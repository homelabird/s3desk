import { useMutation, type QueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { useState } from 'react'

import type { APIClient } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { withJobQueueRetry } from '../../lib/jobQueue'

type UseJobsActionMutationsArgs = {
	api: APIClient
	profileId: string | null
	queryClient: QueryClient
	onJobDeleted?: (jobId: string) => void
}

export function useJobsActionMutations({
	api,
	profileId,
	queryClient,
	onJobDeleted,
}: UseJobsActionMutationsArgs) {
	const [cancelingJobId, setCancelingJobId] = useState<string | null>(null)
	const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
	const [deletingJobId, setDeletingJobId] = useState<string | null>(null)

	const requireProfileId = () => {
		if (!profileId) throw new Error('profile is required')
		return profileId
	}

	const invalidateJobQueries = async (jobId: string) => {
		await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		await queryClient.invalidateQueries({ queryKey: ['job', profileId, jobId], exact: false })
	}

	const cancelMutation = useMutation({
		mutationFn: (jobId: string) => api.jobs.cancelJob(requireProfileId(), jobId),
		onMutate: (jobId) => setCancelingJobId(jobId),
		onSuccess: async (_, jobId) => {
			message.success('Cancel requested')
			await invalidateJobQueries(jobId)
		},
		onSettled: (_, __, jobId) => setCancelingJobId((prev) => (prev === jobId ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const retryMutation = useMutation({
		mutationFn: (jobId: string) => withJobQueueRetry(() => api.jobs.retryJob(requireProfileId(), jobId)),
		onMutate: (jobId) => setRetryingJobId(jobId),
		onSuccess: async (job, jobId) => {
			message.success(`Retry queued: ${job.id}`)
			await invalidateJobQueries(jobId)
			if (job.id !== jobId) {
				await invalidateJobQueries(job.id)
			}
		},
		onSettled: (_, __, jobId) => setRetryingJobId((prev) => (prev === jobId ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const deleteJobMutation = useMutation({
		mutationFn: (jobId: string) => api.jobs.deleteJob(requireProfileId(), jobId),
		onMutate: (jobId) => setDeletingJobId(jobId),
		onSuccess: async (_, jobId) => {
			message.success('Job deleted')
			onJobDeleted?.(jobId)
			await invalidateJobQueries(jobId)
		},
		onSettled: (_, __, jobId) => setDeletingJobId((prev) => (prev === jobId ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	return {
		cancelingJobId,
		retryingJobId,
		deletingJobId,
		cancelMutation,
		retryMutation,
		deleteJobMutation,
	}
}
