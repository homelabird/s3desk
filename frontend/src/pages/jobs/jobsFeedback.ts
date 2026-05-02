import { clipboardFailureHint } from '../../lib/clipboard'
import { uploadsUnsupportedHint } from '../../lib/actionHints'
import { appFeedback } from '../../lib/appFeedback'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { noObjectsFoundUnderPrefixHint, selectLocalFolderFirstHint } from '../../lib/secureContext'

export const jobsFeedbackCopy = {
	cancelRequested: 'Cancel requested',
	jobDeleted: 'Job deleted',
	retryQueued: (jobId: string) => `Retry queued: ${jobId}`,
	noLogsToCopy: 'No log lines to copy.',
	noMatchingLogsToCopy: 'No matching log lines to copy.',
	logsCopied: (lineCount: number) => `Copied ${lineCount.toLocaleString()} line(s)`,
	noFilesSelected: 'No files selected',
	chooseFilesOrFolderFirst: 'Choose files or a folder from this device first',
	bucketRequired: 'Bucket is required',
	prefixRequiredUnlessDeleteAll: 'Prefix is required unless deleteAll is enabled',
	wildcardsNotAllowedInPrefix: 'Wildcards are not allowed in prefix',
	acknowledgeUnsafePrefix: 'Acknowledge unsafe prefix to proceed',
	typeDeleteToProceed: 'Type DELETE to proceed',
	deleteJobCreated: (jobId: string) => `Delete job created: ${jobId}`,
}

export const jobsFeedback = {
	cancelRequested() {
		appFeedback.success(jobsFeedbackCopy.cancelRequested)
	},
	retryQueued(jobId: string) {
		appFeedback.success(jobsFeedbackCopy.retryQueued(jobId))
	},
	jobDeleted() {
		appFeedback.success(jobsFeedbackCopy.jobDeleted)
	},
	error(error: unknown) {
		appFeedback.error(formatErr(error))
	},
	noLogsToCopy(hasSearchQuery: boolean) {
		appFeedback.info(hasSearchQuery ? jobsFeedbackCopy.noMatchingLogsToCopy : jobsFeedbackCopy.noLogsToCopy)
	},
	logsCopied(lineCount: number) {
		appFeedback.success(jobsFeedbackCopy.logsCopied(lineCount))
	},
	clipboardFailed() {
		appFeedback.error(clipboardFailureHint())
	},
	uploadsUnsupported(reason?: string | null) {
		appFeedback.warning(reason ?? uploadsUnsupportedHint())
	},
	noFilesSelected() {
		appFeedback.info(jobsFeedbackCopy.noFilesSelected)
	},
	chooseFilesOrFolderFirst() {
		appFeedback.info(jobsFeedbackCopy.chooseFilesOrFolderFirst)
	},
	bucketRequired() {
		appFeedback.error(jobsFeedbackCopy.bucketRequired)
	},
	selectLocalFolderFirst() {
		appFeedback.info(selectLocalFolderFirstHint())
	},
	noObjectsFoundUnderPrefix() {
		appFeedback.info(noObjectsFoundUnderPrefixHint())
	},
	prefixRequiredUnlessDeleteAll() {
		appFeedback.error(jobsFeedbackCopy.prefixRequiredUnlessDeleteAll)
	},
	wildcardsNotAllowedInPrefix() {
		appFeedback.error(jobsFeedbackCopy.wildcardsNotAllowedInPrefix)
	},
	acknowledgeUnsafePrefix() {
		appFeedback.error(jobsFeedbackCopy.acknowledgeUnsafePrefix)
	},
	typeDeleteToProceed() {
		appFeedback.error(jobsFeedbackCopy.typeDeleteToProceed)
	},
	deleteJobCreated(jobId: string) {
		appFeedback.success(jobsFeedbackCopy.deleteJobCreated(jobId))
	},
}
