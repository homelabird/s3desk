import {
	offlineUploadsDisabledHint,
	selectBucketFirstHint,
	selectObjectsFirstHint,
	selectProfileFirstHint,
	uploadsUnsupportedHint,
} from '../../lib/actionHints'
import { appFeedback } from '../../lib/appFeedback'
import { clipboardFailureHint } from '../../lib/clipboard'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import {
	directoryPickerUnavailableHint,
	localFolderSelectionFailedHint,
	noFilesFoundInSelectedFolderHint,
	noObjectsFoundUnderPrefixHint,
	selectLocalFolderFirstHint,
} from '../../lib/secureContext'

export const objectsFeedbackCopy = {
	copiedUrl: 'Copied URL',
	copied: 'Copied',
	invalidDownloadUrl: 'Download URL is invalid.',
	clipboardEmpty: 'Clipboard is empty',
	clipboardDoesNotContainObjectKeys: 'Clipboard does not contain any object keys',
	clipboardMultipleBuckets: 'Clipboard contains multiple buckets; copy from one bucket at a time',
	clipboardDifferentProfile: 'Clipboard objects came from a different profile. Copy them again after switching profiles.',
	dragDropAcrossBucketsUnsupported: 'Drag & drop across buckets is not supported yet',
	alreadyInDestination: 'Already in destination',
	cannotMoveCopyFolderIntoItself: 'Cannot move/copy a folder into itself',
	localFilesOnFolderTargetUnsupported:
		'Dropping local files on a folder target is not supported yet. Drop into the current folder area instead.',
	preparingFolderUpload: 'Preparing folder upload…',
	noFilesFound: 'No files found',
	queuedFiles: (count: number) => `Queued ${count} file(s)`,
	copiedKeys: (count: number) => `Copied ${count} key(s)`,
	cutKeys: (count: number) => `Cut ${count} key(s)`,
	savedInternallyButClipboardFailed: (reason: string) => `Saved internally, but clipboard failed: ${reason}`,
	selectAtLeastOneObjectFirst: 'Select at least one object first',
	selectSingleObjectToRename: 'Select a single object to rename',
	destinationBucketRequired: 'Destination bucket is required',
	destinationPrefixRequired: 'Destination prefix is required',
	destinationKeyRequired: 'Destination key is required',
	wildcardsNotAllowed: 'Wildcards are not allowed',
	typeMoveToProceed: 'Type MOVE to proceed',
	typeRenameToProceed: 'Type RENAME to proceed',
	destinationMustBeDifferent: 'Destination must be different',
	destinationMustNotBeUnderSource: 'Destination must not be under source',
	copyMoveTaskStarted: (mode: 'copy' | 'move', jobId: string) =>
		`${mode === 'copy' ? 'Copy' : 'Move'} task started: ${jobId}`,
	deletedCount: (count: number) => `Deleted ${count}`,
	deleteTaskStarted: (jobId: string) => `Delete task started: ${jobId}`,
}

export const objectsFeedback = {
	open(config: Parameters<typeof appFeedback.open>[0]) {
		appFeedback.open(config)
	},
	destroy(key?: Parameters<typeof appFeedback.destroy>[0]) {
		appFeedback.destroy(key)
	},
	success(content: Parameters<typeof appFeedback.success>[0], duration?: Parameters<typeof appFeedback.success>[1]) {
		appFeedback.success(content, duration)
	},
	warning(content: Parameters<typeof appFeedback.warning>[0], duration?: Parameters<typeof appFeedback.warning>[1]) {
		appFeedback.warning(content, duration)
	},
	copiedUrl() {
		appFeedback.success(objectsFeedbackCopy.copiedUrl)
	},
	copied() {
		appFeedback.success(objectsFeedbackCopy.copied)
	},
	copiedKeys(count: number) {
		appFeedback.success(objectsFeedbackCopy.copiedKeys(count))
	},
	cutKeys(count: number) {
		appFeedback.success(objectsFeedbackCopy.cutKeys(count))
	},
	savedInternallyButClipboardFailed() {
		appFeedback.warning(objectsFeedbackCopy.savedInternallyButClipboardFailed(clipboardFailureHint()))
	},
	clipboardFailed() {
		appFeedback.error(clipboardFailureHint())
	},
	clipboardEmpty() {
		appFeedback.info(objectsFeedbackCopy.clipboardEmpty)
	},
	clipboardDoesNotContainObjectKeys() {
		appFeedback.info(objectsFeedbackCopy.clipboardDoesNotContainObjectKeys)
	},
	clipboardMultipleBuckets() {
		appFeedback.error(objectsFeedbackCopy.clipboardMultipleBuckets)
	},
	clipboardDifferentProfile() {
		appFeedback.warning(objectsFeedbackCopy.clipboardDifferentProfile)
	},
	dragDropAcrossBucketsUnsupported() {
		appFeedback.warning(objectsFeedbackCopy.dragDropAcrossBucketsUnsupported)
	},
	alreadyInDestination() {
		appFeedback.info(objectsFeedbackCopy.alreadyInDestination)
	},
	cannotMoveCopyFolderIntoItself() {
		appFeedback.error(objectsFeedbackCopy.cannotMoveCopyFolderIntoItself)
	},
	localFilesOnFolderTargetUnsupported() {
		appFeedback.info(objectsFeedbackCopy.localFilesOnFolderTargetUnsupported)
	},
	preparingFolderUpload(key: string) {
		appFeedback.open({ type: 'loading', content: objectsFeedbackCopy.preparingFolderUpload, duration: 0, key })
	},
	noFilesFound(key: string) {
		appFeedback.open({ type: 'warning', content: objectsFeedbackCopy.noFilesFound, key, duration: 2 })
	},
	queuedFiles(key: string, count: number) {
		appFeedback.open({ type: 'success', content: objectsFeedbackCopy.queuedFiles(count), key, duration: 2 })
	},
	dropUploadFailed(key: string, error: unknown) {
		appFeedback.open({ type: 'error', content: formatErr(error), key, duration: 4 })
	},
	invalidDownloadUrl(error: unknown) {
		appFeedback.error(error instanceof Error ? error.message : objectsFeedbackCopy.invalidDownloadUrl)
	},
	copyMoveTaskStarted(mode: 'copy' | 'move', jobId: string) {
		appFeedback.success(objectsFeedbackCopy.copyMoveTaskStarted(mode, jobId))
	},
	deletedCount(count: number) {
		appFeedback.success(objectsFeedbackCopy.deletedCount(count))
	},
	deleteTaskStarted(jobId: string) {
		appFeedback.success(objectsFeedbackCopy.deleteTaskStarted(jobId))
	},
	destinationBucketRequired() {
		appFeedback.error(objectsFeedbackCopy.destinationBucketRequired)
	},
	destinationPrefixRequired() {
		appFeedback.error(objectsFeedbackCopy.destinationPrefixRequired)
	},
	destinationKeyRequired() {
		appFeedback.error(objectsFeedbackCopy.destinationKeyRequired)
	},
	wildcardsNotAllowed() {
		appFeedback.error(objectsFeedbackCopy.wildcardsNotAllowed)
	},
	typeMoveToProceed() {
		appFeedback.error(objectsFeedbackCopy.typeMoveToProceed)
	},
	typeRenameToProceed() {
		appFeedback.error(objectsFeedbackCopy.typeRenameToProceed)
	},
	destinationMustBeDifferent() {
		appFeedback.error(objectsFeedbackCopy.destinationMustBeDifferent)
	},
	destinationMustNotBeUnderSource() {
		appFeedback.error(objectsFeedbackCopy.destinationMustNotBeUnderSource)
	},
	selectProfileFirst() {
		appFeedback.info(selectProfileFirstHint())
	},
	selectBucketFirst() {
		appFeedback.info(selectBucketFirstHint())
	},
	selectObjectsFirst() {
		appFeedback.info(selectObjectsFirstHint())
	},
	selectAtLeastOneObjectFirst() {
		appFeedback.info(objectsFeedbackCopy.selectAtLeastOneObjectFirst)
	},
	selectLocalFolderFirst() {
		appFeedback.info(selectLocalFolderFirstHint())
	},
	selectSingleObjectToRename() {
		appFeedback.info(objectsFeedbackCopy.selectSingleObjectToRename)
	},
	noObjectsFoundUnderPrefix() {
		appFeedback.info(noObjectsFoundUnderPrefixHint())
	},
	noFilesFoundInSelectedFolder() {
		appFeedback.info(noFilesFoundInSelectedFolderHint())
	},
	offlineUploadsDisabled() {
		appFeedback.warning(offlineUploadsDisabledHint())
	},
	uploadsUnsupported(reason?: string | null) {
		appFeedback.warning(reason ?? uploadsUnsupportedHint())
	},
	directoryPickerUnavailable(reason?: string | null) {
		appFeedback.warning(reason ?? directoryPickerUnavailableHint())
	},
	localFolderSelectionFailed(error?: Error | null) {
		appFeedback.error(error?.message ?? localFolderSelectionFailedHint())
	},
	error(error: unknown) {
		appFeedback.error(formatErr(error))
	},
	errorText(content: string) {
		appFeedback.error(content)
	},
	formatError(error: unknown) {
		return formatErr(error)
	},
	errorMessage(error: unknown) {
		const message = formatErr(error)
		appFeedback.error(message)
		return message
	},
}
