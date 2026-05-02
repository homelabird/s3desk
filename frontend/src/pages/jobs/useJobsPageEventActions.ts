import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { QueryClient } from '@tanstack/react-query'

import type { APIClientShape } from '../../api/client'
import { useJobsActionMutations } from './useJobsActionMutations'
import { useJobsRealtimeEvents } from './useJobsRealtimeEvents'
import type { JobsLogClearRequestState, JobsLogDrawerRequestState } from './useJobsPageSurfaceState'

type Args = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	queryClient: QueryClient
	setDetailsJobId: Dispatch<SetStateAction<string | null>>
	setDetailsOpen: Dispatch<SetStateAction<boolean>>
	setLogClearRequest: Dispatch<SetStateAction<JobsLogClearRequestState>>
	setLogDrawerRequest: Dispatch<SetStateAction<JobsLogDrawerRequestState>>
}

export function useJobsPageEventActions(props: Args) {
	const {
		api,
		apiToken,
		profileId,
		queryClient,
		setDetailsJobId,
		setDetailsOpen,
		setLogClearRequest,
		setLogDrawerRequest,
	} = props

	const handleJobsDeleted = useCallback((jobIds: string[]) => {
		setDetailsJobId((prev) => {
			if (!prev || !jobIds.includes(prev)) return prev
			setDetailsOpen(false)
			return null
		})
		setLogDrawerRequest((prev) => {
			if (!prev.jobId || !jobIds.includes(prev.jobId)) return prev
			return { jobId: null, nonce: prev.nonce }
		})
		setLogClearRequest((prev) => ({ jobIds, nonce: prev.nonce + 1 }))
	}, [setDetailsJobId, setDetailsOpen, setLogClearRequest, setLogDrawerRequest])

	const handleJobDeleted = useCallback((jobId: string) => {
		setDetailsJobId((prev) => {
			if (prev !== jobId) return prev
			setDetailsOpen(false)
			return null
		})
		setLogDrawerRequest((prev) => {
			if (prev.jobId !== jobId) return prev
			return { jobId: null, nonce: prev.nonce }
		})
		setLogClearRequest((prev) => ({ jobIds: [jobId], nonce: prev.nonce + 1 }))
	}, [setDetailsJobId, setDetailsOpen, setLogClearRequest, setLogDrawerRequest])

	const realtime = useJobsRealtimeEvents({
		apiToken,
		profileId,
		queryClient,
		onJobsDeleted: handleJobsDeleted,
	})

	const mutations = useJobsActionMutations({
		api,
		apiToken,
		profileId,
		queryClient,
		onJobDeleted: handleJobDeleted,
	})

	const requestCancelJob = useCallback((jobId: string) => {
		mutations.cancelMutation.mutate(jobId)
	}, [mutations.cancelMutation])

	const requestRetryJob = useCallback((jobId: string) => {
		mutations.retryMutation.mutate(jobId)
	}, [mutations.retryMutation])

	const requestDeleteJob = useCallback(async (jobId: string) => {
		await mutations.deleteJobMutation.mutateAsync(jobId)
	}, [mutations.deleteJobMutation])

	return {
		...realtime,
		...mutations,
		requestCancelJob,
		requestRetryJob,
		requestDeleteJob,
	}
}
