import type { UploadTask } from './transferTypes'

type UploadMode = NonNullable<UploadTask['uploadMode']> | NonNullable<UploadTask['uploadFallbackFrom']>

type UploadRecoveryLine = {
	text: string
	tone: 'secondary' | 'warning' | 'danger'
}

export type UploadRecoveryDescriptor = {
	modeTagLabel: string | null
	showFallbackTag: boolean
	retryRequiresFileSelection: boolean
	canRetryWithRememberedFiles: boolean
	lines: UploadRecoveryLine[]
}

export function getUploadModeLabel(mode: UploadMode): string {
	if (mode === 'presigned') return 'Presigned'
	if (mode === 'direct') return 'Direct'
	return 'Staging'
}

export function getUploadModeDescription(mode: UploadMode): string {
	if (mode === 'presigned') return 'Browser presigned upload'
	if (mode === 'direct') return 'Server direct stream upload'
	return 'Server staging upload'
}

export function getUploadRetryFileHandleState(task: UploadTask): UploadTask['retryFileHandleState'] {
	if (task.retryFileHandleState) return task.retryFileHandleState
	if (task.error && /missing files|select the same|file size does not match|interrupted by refresh/i.test(task.error)) {
		return 'selection_required'
	}
	if (task.status === 'failed' || task.status === 'canceled') return 'remembered'
	return undefined
}

export function getUploadFallbackLine(task: UploadTask): string | null {
	if (!task.uploadFallbackFrom || !task.uploadMode || task.uploadFallbackFrom === task.uploadMode) return null
	const from = getUploadModeLabel(task.uploadFallbackFrom)
	const to = getUploadModeLabel(task.uploadMode)
	if (task.uploadFallbackReason === 'provider_unsupported') {
		return `Fallback: ${from} upload is unavailable here. Continuing with ${to} upload.`
	}
	if (task.uploadFallbackReason === 'network_path_failed') {
		return `Fallback: ${from} browser upload failed on the network. Continuing with ${to} upload.`
	}
	return `Fallback: switched from ${from} to ${to} upload.`
}

export function buildUploadRecoveryDescriptor(task: UploadTask): UploadRecoveryDescriptor {
	const lines: UploadRecoveryLine[] = []
	const fallbackLine = getUploadFallbackLine(task)
	const retryFileHandleState = getUploadRetryFileHandleState(task)
	const retryRequiresFileSelection = retryFileHandleState === 'selection_required'
	const canRetryWithRememberedFiles = retryFileHandleState === 'remembered'

	if (task.uploadMode) {
		lines.push({
			tone: 'secondary',
			text: `Path: ${getUploadModeDescription(task.uploadMode)}.`,
		})
	}
	if (fallbackLine) {
		lines.push({ tone: 'warning', text: fallbackLine })
	}
	if (task.status === 'commit') {
		lines.push({
			tone: 'secondary',
			text: 'Finalization: upload commit is in progress; removal is paused.',
		})
	}
	if (task.status === 'waiting_job') {
		lines.push({
			tone: 'secondary',
			text: 'Finalization: server job is applying uploaded files. Open Jobs for details.',
		})
	}
	if (task.status === 'failed' || task.status === 'canceled') {
		if (retryRequiresFileSelection) {
			lines.push({
				tone: 'warning',
				text: 'Recovery: Retry opens the file picker. Select the same files or folder to resume.',
			})
		} else if (canRetryWithRememberedFiles) {
			lines.push({
				tone: 'secondary',
				text: 'Recovery: Retry will reuse remembered local files.',
			})
		} else {
			lines.push({
				tone: 'warning',
				text: 'Recovery: re-add the upload source or select the same files when retrying.',
			})
		}
	}
	if (task.preview) {
		lines.push({
			tone: 'secondary',
			text: `Preview frame: ${task.preview.label}.`,
		})
	}

	return {
		modeTagLabel: task.uploadMode ? getUploadModeLabel(task.uploadMode) : null,
		showFallbackTag: Boolean(fallbackLine),
		retryRequiresFileSelection,
		canRetryWithRememberedFiles,
		lines,
	}
}
