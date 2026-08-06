import type { UploadFileItem } from '../../api/client'
import type { UploadTask } from './transferTypes'
import type { UploadCapabilityByProfileId } from './transfersTypes'
import {
	normalizeRelPath,
	resolveUploadItemPath,
	resolveUploadItemPathNormalized,
} from './uploadPaths'

export type UploadRuntimeMode = NonNullable<UploadTask['uploadMode']>
export type UploadFallbackMode = Exclude<UploadRuntimeMode, 'presigned'>
export type ResumeFileInfo = { size: number; chunkSizeBytes: number }

export function planUploadMode(args: {
	uploadCapability?: UploadCapabilityByProfileId[string]
	uploadDirectStream?: boolean
}) {
	const canUsePresigned = args.uploadCapability ? args.uploadCapability.presignedUpload : true
	const canUseDirect = args.uploadCapability ? args.uploadCapability.directUpload : !!args.uploadDirectStream
	const canUseDirectMultipart = args.uploadCapability?.directMultipartUpload ?? canUsePresigned
	const directModePreferred = !!args.uploadDirectStream && canUseDirect
	const fallbackMode: UploadFallbackMode = directModePreferred ? 'direct' : 'staging'
	const preferredMode: UploadRuntimeMode = canUsePresigned ? 'presigned' : fallbackMode

	return {
		canUsePresigned,
		canUseDirect,
		canUseDirectMultipart,
		directModePreferred,
		fallbackMode,
		preferredMode,
	}
}

export function buildResumeFilesByPath(args: {
	task: UploadTask
	items: UploadFileItem[]
	allowResume: boolean
}): Map<string, ResumeFileInfo> {
	const resumeFilesByPath = new Map<string, ResumeFileInfo>()
	if (!args.allowResume) return resumeFilesByPath

	if (args.task.resumeFiles && args.task.resumeFiles.length > 0) {
		for (const file of args.task.resumeFiles) {
			const pathKey = normalizeRelPath(file.path)
			if (!pathKey) continue
			resumeFilesByPath.set(pathKey, { size: file.size, chunkSizeBytes: file.chunkSizeBytes })
		}
		return resumeFilesByPath
	}

	if (args.task.resumeChunkSizeBytes && args.task.resumeFileSize && args.items.length === 1) {
		const pathKey = resolveUploadItemPathNormalized(args.items[0])
		if (pathKey) {
			resumeFilesByPath.set(pathKey, {
				size: args.task.resumeFileSize,
				chunkSizeBytes: args.task.resumeChunkSizeBytes,
			})
		}
	}

	return resumeFilesByPath
}

export function planResumeChunkSettings(args: {
	resumeFilesByPath: Map<string, ResumeFileInfo>
	uploadResumeConversionEnabled: boolean
}):
	| { ok: true; resumeChunkSizeBytes: number; allowPerFileChunkSize: boolean }
	| { ok: false; error: string } {
	if (args.resumeFilesByPath.size === 0) {
		return { ok: true, resumeChunkSizeBytes: 0, allowPerFileChunkSize: false }
	}

	const distinctSizes = new Set(Array.from(args.resumeFilesByPath.values()).map((value) => value.chunkSizeBytes))
	if (distinctSizes.size > 1 && !args.uploadResumeConversionEnabled) {
		return {
			ok: false,
			error: 'Resume requires consistent chunk size across files. Enable conversion mode or re-add files.',
		}
	}

	return {
		ok: true,
		resumeChunkSizeBytes: Array.from(distinctSizes)[0] ?? 0,
		allowPerFileChunkSize: args.uploadResumeConversionEnabled,
	}
}

export function buildResumeTrackingPlan(args: {
	items: UploadFileItem[]
	attemptMode: UploadRuntimeMode
	resumeFilesByPath: Map<string, ResumeFileInfo>
	chunkThresholdBytes: number
	chunkSizeBytes: number
}) {
	const shouldTrackResume = args.attemptMode !== 'presigned'
	const chunkSizeByPath: Record<string, number> = {}

	const resumeFilesNext = shouldTrackResume
		? args.items
				.filter((item) => {
					const pathKey = resolveUploadItemPathNormalized(item)
					if (args.resumeFilesByPath.has(pathKey)) return true
					return (item.file?.size ?? 0) >= args.chunkThresholdBytes
				})
				.map((item) => {
					const pathKey = resolveUploadItemPathNormalized(item)
					const pathRaw = resolveUploadItemPath(item)
					const resumeInfo = args.resumeFilesByPath.get(pathKey)
					const fileChunkSize = resumeInfo?.chunkSizeBytes ?? args.chunkSizeBytes
					if (pathRaw) {
						chunkSizeByPath[pathRaw] = fileChunkSize
					}
					return {
						path: pathKey,
						size: item.file?.size ?? 0,
						chunkSizeBytes: fileChunkSize,
					}
				})
		: undefined

	return {
		shouldTrackResume,
		resumeFilesNext,
		chunkSizeByPath,
	}
}
