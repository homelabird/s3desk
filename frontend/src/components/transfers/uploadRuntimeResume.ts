import { APIError, type APIClientShape, type UploadFileItem } from '../../api/client'
import { normalizeRelPath, resolveUploadItemPath } from './uploadPaths'
import type { ResumeFileInfo } from './uploadRuntimePlanning'

type ResolveExistingResumeChunksArgs = {
	api: APIClientShape
	profileId: string
	uploadId: string
	items: UploadFileItem[]
	resumeFilesByPath: Map<string, ResumeFileInfo>
}

type ExistingResumeChunksResult =
	| { ok: true; available: true; uploadId: string; existingChunksByPath: Record<string, number[]> }
	| { ok: true; available: false }
	| { ok: false; error: string }

export async function resolveExistingResumeChunks(
	args: ResolveExistingResumeChunksArgs,
): Promise<ExistingResumeChunksResult> {
	const existingChunksByPath: Record<string, number[]> = {}

	for (const item of args.items) {
		const pathRaw = resolveUploadItemPath(item)
		const pathKey = normalizeRelPath(pathRaw)
		const resumeInfo = args.resumeFilesByPath.get(pathKey)
		if (!resumeInfo) continue
		if ((item.file?.size ?? 0) !== resumeInfo.size) {
			return { ok: false, error: 'Selected file size does not match the previous upload.' }
		}

		try {
			const chunkState = await args.api.uploads.getUploadChunks(args.profileId, args.uploadId, {
				path: pathRaw,
				total: Math.max(1, Math.ceil(resumeInfo.size / resumeInfo.chunkSizeBytes)),
				chunkSize: resumeInfo.chunkSizeBytes,
				fileSize: resumeInfo.size,
			})
			existingChunksByPath[pathRaw] = chunkState.present
		} catch (error) {
			if (error instanceof APIError && error.status === 404) {
				return { ok: true, available: false }
			}
			throw error
		}
	}

	return {
		ok: true,
		available: true,
		uploadId: args.uploadId,
		existingChunksByPath,
	}
}
