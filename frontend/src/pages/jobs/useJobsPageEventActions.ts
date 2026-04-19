import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { QueryClient } from '@tanstack/react-query'

import type { APIClient } from '../../api/client'
import { useJobsActionMutations } from './useJobsActionMutations'
import { useJobsRealtimeEvents } from './useJobsRealtimeEvents'
import type { JobsLogClearRequestState, JobsLogDrawerRequestState } from './useJobsPageSurfaceState'

type Args = {
	api: APIClient
	apiToken: string
	profileId: string | null
	queryClient: QueryClient
	setDetailsJobId: Dispatch<SetStateAction<string | null>>
	setDetailsOpen: Dispatch<SetStateAction<boolean>>
	setLogClearRequest: Dispatch<SetStateAction<JobsLogClearRequestState>>
	setLogDrawerRequest: Dispatch<SetStateAction<JobsLogDrawerRequestState>>
}

export function useJobsPageEventActions(props: Args) {
	const handleJobsDeleted = useCallback((jobIds: string[]) => {
		props.setDetailsJobId((prev) => {
			if (!prev || !jobIds.includes(prev)) return prev
			props.setDetailsOpen(false)
			return null
		})
		props.setLogDrawerRequest((prev) => {
			if (!prev.jobId || !jobIds.includes(prev.jobId)) return prev
			return { jobId: null, nonce: prev.nonce }
		})
		props.setLogClearRequest((prev) => ({ jobIds, nonce: prev.nonce + 1 }))
	}, [props])

	const handleJobDeleted = useCallback((jobId: string) => {
		props.setDetailsJobId((prev) => {
			if (prev !== jobId) return prev
			props.setDetailsOpen(false)
			return null
		})
		props.setLogDrawerRequest((prev) => {
			if (prev.jobId !== jobId) return prev
			return { jobId: null, nonce: prev.nonce }
		})
		props.setLogClearRequest((prev) => ({ jobIds: [jobId], nonce: prev.nonce + 1 }))
	}, [props])

	const realtime = useJobsRealtimeEvents({
		apiToken: props.apiToken,
		profileId: props.profileId,
		queryClient: props.queryClient,
		onJobsDeleted: handleJobsDeleted,
	})

	const mutations = useJobsActionMutations({
		api: props.api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		queryClient: props.queryClient,
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
