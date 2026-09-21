import type { UploadPreparationProgress } from './uploadPreparation'
import { fingerprintUploadFile, isUploadFingerprint } from './uploadFileIdentity'
import { APIError, type APIClientShape, type UploadFileItem } from '../../api/client'
import { normalizeRelPath, normalizeUploadPath, resolveUploadItemPath } from './uploadPaths'
import type { ResumeFileInfo } from './uploadRuntimePlanning'

type ResolveExistingResumeChunksArgs = {
	api: APIClientShape
	profileId: string
	uploadId: string
	items: UploadFileItem[]
	resumeFilesByPath: Map<string, ResumeFileInfo>
	signal?: AbortSignal
	onProgress?: (progress: UploadPreparationProgress) => void
}

type ExistingResumeChunksResult =
	| { ok: true; available: true; uploadId: string; existingChunksByPath: Record<string, number[]> }
	| { ok: true; available: false }
	| { ok: false; error: string }

const uploadChunkStatusBatchMaxItems = 100
const uploadChunkStatusBatchMaxParts = 10_000

export async function resolveExistingResumeChunks(
	args: ResolveExistingResumeChunksArgs,
): Promise<ExistingResumeChunksResult> {
	const existingChunksByPath: Record<string, number[]> = Object.create(null)
	const requests: Array<{ path: string; total: number; chunkSize: number; fileSize: number }> = []

	for (const item of args.items) {
		const pathRaw = resolveUploadItemPath(item)
		const pathKey = normalizeRelPath(pathRaw)
		const resumeInfo = args.resumeFilesByPath.get(pathKey)
		if (!resumeInfo) continue
		if ((item.file?.size ?? 0) !== resumeInfo.size) {
			return { ok: false, error: 'Selected file size does not match the previous upload.' }
		}
		requests.push({
			path: pathRaw,
			total: Math.max(1, Math.ceil(resumeInfo.size / resumeInfo.chunkSizeBytes)),
			chunkSize: resumeInfo.chunkSizeBytes,
			fileSize: resumeInfo.size,
		})
	}

	// Verify the whole set before making a status request (which may assemble
	// staged parts). Legacy descriptors safely start a NEW session.
	if (requests.length === 0) return { ok: true, available: false }
	const verificationItems = args.items.filter((item) => args.resumeFilesByPath.has(normalizeRelPath(resolveUploadItemPath(item))))
	for (const [index, item] of verificationItems.entries()) {
		const info = args.resumeFilesByPath.get(normalizeRelPath(resolveUploadItemPath(item)))
		if (!info) continue
		if (!isUploadFingerprint(info.fingerprint)) return { ok: true, available: false }
		const fingerprint = await fingerprintUploadFile(item.file, args.signal, (progress) => args.onProgress?.({
			...progress, fileName: resolveUploadItemPath(item), fileIndex: index + 1, fileCount: verificationItems.length,
		}))
		if (!fingerprint) return { ok: true, available: false }
		if (fingerprint !== info.fingerprint) {
			return { ok: false, error: 'Selected file content does not match the previous upload. Select the original file or create a new upload.' }
		}
	}

	const validatePresent = (present: number[], total: number) => {
		if (!Array.isArray(present) || present.some((part) => !Number.isInteger(part) || part < 0 || part >= total) || new Set(present).size !== present.length) {
			throw new Error('Upload chunk status contains invalid part indices.')
		}
		return present
	}

	const loadSingles = async (): Promise<ExistingResumeChunksResult> => {
		for (const request of requests) {
			try {
				const chunkState = await args.api.uploads.getUploadChunks(args.profileId, args.uploadId, request, args.signal)
				existingChunksByPath[request.path] = validatePresent(chunkState.present, request.total)
			} catch (error) {
				if (error instanceof APIError && (error.status === 404 || error.code === 'expired')) {
					return { ok: true, available: false }
				}
				throw error
			}
		}
		return { ok: true, available: true, uploadId: args.uploadId, existingChunksByPath }
	}

	const loadBatch = async (batch: typeof requests) => {
		const response = await args.api.uploads.getUploadChunksBatch(
			args.profileId,
			args.uploadId,
			{ items: batch },
			args.signal,
		)
		const expectedPaths = new Set(batch.map((request) => normalizeUploadPath(request.path)))
		const presentByPath = new Map<string, number[]>()
		for (const item of response.items) {
			const path = normalizeUploadPath(item.path)
			if (!path || !expectedPaths.has(path)) {
				throw new Error('Upload chunk status batch response contains an unexpected path.')
			}
			if (presentByPath.has(path)) {
				throw new Error('Upload chunk status batch response contains duplicate paths.')
			}
			presentByPath.set(path, item.present)
		}
		for (const request of batch) {
			const present = presentByPath.get(normalizeUploadPath(request.path))
			if (!present) {
				throw new Error('Upload chunk status batch response is missing a path.')
			}
			existingChunksByPath[request.path] = validatePresent(present, request.total)
		}
	}

	try {
		let batch: typeof requests = []
		let batchParts = 0
		for (const request of requests) {
			if (
				batch.length > 0 &&
				(batch.length >= uploadChunkStatusBatchMaxItems ||
					batchParts + request.total > uploadChunkStatusBatchMaxParts)
			) {
				await loadBatch(batch)
				batch = []
				batchParts = 0
			}
			batch.push(request)
			batchParts += request.total
		}
		if (batch.length > 0) {
			await loadBatch(batch)
		}
	} catch (error) {
		if (error instanceof APIError && (error.status === 404 || error.code === 'expired')) {
			return loadSingles()
		}
		throw error
	}

	return {
		ok: true,
		available: true,
		uploadId: args.uploadId,
		existingChunksByPath,
	}
}
