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

	const cancelMutation = useMutation({
		mutationFn: (jobId: string) => api.cancelJob(requireProfileId(), jobId),
		onMutate: (jobId) => setCancelingJobId(jobId),
		onSuccess: async () => {
			message.success('Cancel requested')
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onSettled: (_, __, jobId) => setCancelingJobId((prev) => (prev === jobId ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const retryMutation = useMutation({
		mutationFn: (jobId: string) => withJobQueueRetry(() => api.retryJob(requireProfileId(), jobId)),
		onMutate: (jobId) => setRetryingJobId(jobId),
		onSuccess: async (job) => {
			message.success(`Retry queued: ${job.id}`)
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onSettled: (_, __, jobId) => setRetryingJobId((prev) => (prev === jobId ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const deleteJobMutation = useMutation({
		mutationFn: (jobId: string) => api.deleteJob(requireProfileId(), jobId),
		onMutate: (jobId) => setDeletingJobId(jobId),
		onSuccess: async (_, jobId) => {
			message.success('Job deleted')
			onJobDeleted?.(jobId)
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
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
