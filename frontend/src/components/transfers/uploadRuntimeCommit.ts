import type { QueryClient } from '@tanstack/react-query'
import type { APIClientShape, UploadFileItem } from '../../api/client'
import { queryKeys } from '../../api/queryKeys'
import type { JobProgress, JobStatus } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { withJobQueueRetry } from '../../lib/jobQueue'
import type { UploadTask } from './transferTypes'
import { maybeReportNetworkError } from './transferDownloadUtils'
import type { TransfersRuntimeNotifications } from './transfersTypes'
import { buildUploadCommitRequest } from './transfersUploadUtils'

type CommitUploadAndTrackJobArgs = {
	api: APIClientShape
	apiToken: string
	queryClient: QueryClient
	notifications: TransfersRuntimeNotifications
	taskId: string
	task: UploadTask
	uploadId: string
	items: UploadFileItem[]
	uploadItemsByTaskIdRef: { current: Record<string, UploadFileItem[]> }
	updateUploadTask: (taskId: string, updater: (task: UploadTask) => UploadTask) => void
	handleUploadJobUpdate: (
		taskId: string,
		job: { status?: JobStatus; progress?: JobProgress | null; error?: string | null },
	) => Promise<void>
	onCommitted?: () => void
}

export async function commitUploadAndTrackJob(args: CommitUploadAndTrackJobArgs) {
	const commitReq = buildUploadCommitRequest(args.task, args.items)
	const response = await withJobQueueRetry(() =>
		args.api.uploads.commitUpload(args.task.profileId, args.uploadId, commitReq),
	)
	args.onCommitted?.()
	delete args.uploadItemsByTaskIdRef.current[args.taskId]
	args.updateUploadTask(args.taskId, (task) => ({
		...task,
		status: 'waiting_job',
		finishedAtMs: undefined,
		jobId: response.jobId,
		loadedBytes: 0,
		speedBps: 0,
		etaSeconds: 0,
	}))

	if (response.jobId) {
		void args.api.jobs
			.getJob(args.task.profileId, response.jobId)
			.then((job) => args.handleUploadJobUpdate(args.taskId, job))
			.catch((error) => {
				maybeReportNetworkError(error)
				args.updateUploadTask(args.taskId, (task) => ({ ...task, error: formatErr(error) }))
			})
	}

	args.notifications.uploadCommitted(response.jobId)
	await args.queryClient.invalidateQueries({
		queryKey: queryKeys.jobs.scope(args.task.profileId, args.apiToken),
		exact: false,
	})

	return response
}
