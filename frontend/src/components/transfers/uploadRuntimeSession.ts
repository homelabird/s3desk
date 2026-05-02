import { APIError, type APIClientShape } from '../../api/client'
import type { UploadTask } from './transferTypes'
import type { UploadFallbackMode, UploadRuntimeMode } from './uploadRuntimePlanning'

export type UploadRuntimeSession = {
	uploadId: string
	mode: UploadRuntimeMode
	maxBytes?: number | null
}

type UploadSessionFallback = {
	from: Exclude<UploadRuntimeMode, 'staging'>
	to: UploadFallbackMode
	reason: 'provider_unsupported'
}

function isUnsupportedUploadSessionError(error: unknown): error is APIError {
	return error instanceof APIError && (error.code === 'not_supported' || error.code === 'invalid_request')
}

export async function createUploadSession(args: {
	api: APIClientShape
	profileId: string
	bucket: string
	prefix: string
	mode: UploadRuntimeMode
}): Promise<UploadRuntimeSession> {
	return args.api.uploads.createUpload(args.profileId, {
		bucket: args.bucket,
		prefix: args.prefix,
		mode: args.mode,
	})
}

export async function createUploadSessionWithFallback(args: {
	api: APIClientShape
	task: UploadTask
	preferredMode: UploadRuntimeMode
	fallbackMode: UploadFallbackMode
	canUsePresigned: boolean
	onFallback?: (fallback: UploadSessionFallback) => void
}): Promise<UploadRuntimeSession> {
	try {
		return await createUploadSession({
			api: args.api,
			profileId: args.task.profileId,
			bucket: args.task.bucket,
			prefix: args.task.prefix ?? '',
			mode: args.preferredMode,
		})
	} catch (error) {
		if (args.canUsePresigned && args.preferredMode === 'presigned' && isUnsupportedUploadSessionError(error)) {
			const session = await createUploadSession({
				api: args.api,
				profileId: args.task.profileId,
				bucket: args.task.bucket,
				prefix: args.task.prefix ?? '',
				mode: args.fallbackMode,
			})
			args.onFallback?.({ from: 'presigned', to: args.fallbackMode, reason: 'provider_unsupported' })
			return session
		}

		if (args.preferredMode === 'direct' && isUnsupportedUploadSessionError(error)) {
			const session = await createUploadSession({
				api: args.api,
				profileId: args.task.profileId,
				bucket: args.task.bucket,
				prefix: args.task.prefix ?? '',
				mode: 'staging',
			})
			args.onFallback?.({ from: 'direct', to: 'staging', reason: 'provider_unsupported' })
			return session
		}

		throw error
	}
}
