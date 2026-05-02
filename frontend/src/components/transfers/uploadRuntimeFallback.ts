import type { APIClientShape, UploadFilesResult } from '../../api/client'
import type { UploadTask } from './transferTypes'
import type { UploadFallbackMode, UploadRuntimeMode } from './uploadRuntimePlanning'
import { createUploadSession, type UploadRuntimeSession } from './uploadRuntimeSession'

type RunUploadAttempt = (
	mode: UploadRuntimeMode,
	uploadId: string,
	existingChunksByPath?: Record<string, number[]>,
) => Promise<UploadFilesResult>

type RunUploadAttemptWithNetworkFallbackArgs = {
	api: APIClientShape
	task: UploadTask
	uploadId: string
	sessionMode: UploadRuntimeMode
	fallbackMode: UploadFallbackMode
	runUploadAttempt: RunUploadAttempt
	onFallbackSessionReady?: (session: UploadRuntimeSession) => void
	onNetworkFallback?: (session: UploadRuntimeSession) => void
}

function isPresignedNetworkFailure(error: unknown): boolean {
	return error instanceof Error && error.name === 'PresignedUploadNetworkError'
}

export async function runUploadAttemptWithNetworkFallback(
	args: RunUploadAttemptWithNetworkFallbackArgs,
): Promise<UploadFilesResult> {
	try {
		return await args.runUploadAttempt(args.sessionMode, args.uploadId)
	} catch (error) {
		if (args.sessionMode !== 'presigned' || !isPresignedNetworkFailure(error)) {
			throw error
		}

		await args.api.uploads.deleteUpload(args.task.profileId, args.uploadId).catch(() => {})
		const fallbackSession = await createUploadSession({
			api: args.api,
			profileId: args.task.profileId,
			bucket: args.task.bucket,
			prefix: args.task.prefix ?? '',
			mode: args.fallbackMode,
		})
		args.onFallbackSessionReady?.(fallbackSession)
		if (fallbackSession.maxBytes && args.task.totalBytes > fallbackSession.maxBytes) {
			throw new Error(`selected files exceed maxBytes (${args.task.totalBytes} > ${fallbackSession.maxBytes})`)
		}
		args.onNetworkFallback?.(fallbackSession)
		return args.runUploadAttempt(fallbackSession.mode, fallbackSession.uploadId, undefined)
	}
}
