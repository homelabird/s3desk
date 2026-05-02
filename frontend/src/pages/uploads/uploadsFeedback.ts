import {
	addFilesOrFolderFirstHint,
	offlineUploadsDisabledHint,
	selectBucketFirstHint,
	uploadsUnsupportedHint,
} from '../../lib/actionHints'
import { appFeedback } from '../../lib/appFeedback'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

export const uploadsFeedback = {
	offlineUploadsDisabled() {
		appFeedback.warning(offlineUploadsDisabledHint())
	},
	uploadsUnsupported(reason?: string | null) {
		appFeedback.warning(reason ?? uploadsUnsupportedHint())
	},
	selectBucketFirst() {
		appFeedback.info(selectBucketFirstHint())
	},
	addFilesOrFolderFirst() {
		appFeedback.info(addFilesOrFolderFirstHint())
	},
	error(error: unknown) {
		appFeedback.error(formatErr(error))
	},
}
