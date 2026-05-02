import { appFeedback } from '../../lib/appFeedback'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { directoryPickerUnavailableHint } from '../../lib/secureContext'

export const transfersFeedbackCopy = {
	downloaded: (target: string) => `Downloaded ${target}`,
	downloadAlreadyQueued: 'Download already queued',
	allDownloadsAlreadyQueued: 'All downloads already queued',
	noObjectsToDownload: 'No objects to download',
	artifactDownloadAlreadyQueued: 'Artifact download already queued',
	skippedAlreadyQueuedDownloads: (count: number) => `Skipped ${count} already queued download(s)`,
	uploadCommitted: (jobId?: string) => `Upload committed${jobId ? ` (job ${jobId})` : ''}`,
}

export const transfersFeedback = {
	open(config: Parameters<typeof appFeedback.open>[0]) {
		appFeedback.open(config)
	},
	info(content: Parameters<typeof appFeedback.info>[0], duration?: Parameters<typeof appFeedback.info>[1]) {
		appFeedback.info(content, duration)
	},
	warning(content: Parameters<typeof appFeedback.warning>[0], duration?: Parameters<typeof appFeedback.warning>[1]) {
		appFeedback.warning(content, duration)
	},
	errorText(content: string) {
		appFeedback.error(content)
	},
	error(error: unknown) {
		appFeedback.error(formatErr(error))
	},
	errorMessage(error: unknown) {
		const message = formatErr(error)
		appFeedback.error(message)
		return message
	},
	downloaded(target: string) {
		appFeedback.success(transfersFeedbackCopy.downloaded(target))
	},
	downloadAlreadyQueued() {
		appFeedback.info(transfersFeedbackCopy.downloadAlreadyQueued)
	},
	downloadsAlreadyQueued(count: number) {
		appFeedback.info(count === 1 ? transfersFeedbackCopy.downloadAlreadyQueued : transfersFeedbackCopy.allDownloadsAlreadyQueued)
	},
	skippedAlreadyQueuedDownloads(count: number) {
		appFeedback.info(transfersFeedbackCopy.skippedAlreadyQueuedDownloads(count))
	},
	noObjectsToDownload() {
		appFeedback.info(transfersFeedbackCopy.noObjectsToDownload)
	},
	artifactDownloadAlreadyQueued() {
		appFeedback.info(transfersFeedbackCopy.artifactDownloadAlreadyQueued)
	},
	directoryPickerUnavailable(reason?: string | null) {
		appFeedback.error(reason ?? directoryPickerUnavailableHint())
	},
}
