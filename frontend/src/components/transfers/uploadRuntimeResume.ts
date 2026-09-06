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

	const loadSingles = async (): Promise<ExistingResumeChunksResult> => {
		for (const request of requests) {
			try {
				const chunkState = await args.api.uploads.getUploadChunks(args.profileId, args.uploadId, request, args.signal)
				existingChunksByPath[request.path] = chunkState.present
			} catch (error) {
				if (error instanceof APIError && error.status === 404) {
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
			existingChunksByPath[request.path] = present
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
			if (error instanceof APIError && error.status === 404) {
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
