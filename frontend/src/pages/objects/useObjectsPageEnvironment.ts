import { useQueryClient } from '@tanstack/react-query'
import { Grid } from 'antd'
import { useCallback, useMemo } from 'react'

import { useAPIClient } from '../../api/useAPIClient'
import { queryKeys } from '../../api/queryKeys'
import type { JobCreateRequest } from '../../api/types'
import {
	useTransfersCommands,
	useTransfersSummary,
} from '../../components/useTransfers'
import { withJobQueueRetry } from '../../lib/jobQueue'
import { useIsOffline } from '../../lib/useIsOffline'
import { useJobsRealtimeEvents, type JobsRealtimeCompletion } from '../jobs/useJobsRealtimeEvents'
import { isContextMenuDebugEnabled, isObjectsListDebugEnabled } from './objectsPageDebug'
import { useObjectsDeferredOpener } from './useObjectsDeferredOpener'
import { completeClaimedObjectJob, invalidateObjectQueriesForJob } from './objectsQueryCache'

type UseObjectsPageEnvironmentArgs = {
	apiToken: string
	profileId: string | null
}

export function useObjectsPageEnvironment(args: UseObjectsPageEnvironmentArgs) {
	const queryClient = useQueryClient()
	const api = useAPIClient()
	const transferCommands = useTransfersCommands()
	const { activeTransferCount } = useTransfersSummary()
	const transfers = useMemo(
		() => ({ ...transferCommands, activeTransferCount }),
		[activeTransferCount, transferCommands],
	)
	const screens = Grid.useBreakpoint()
	const isOffline = useIsOffline()
	const debugObjectsList = isObjectsListDebugEnabled()
	const debugContextMenu = isContextMenuDebugEnabled()
	const commandPaletteOpener = useObjectsDeferredOpener()
	const handleJobCompleted = useCallback(
		(completion: JobsRealtimeCompletion) => {
			if (!args.profileId) return
			if (completeClaimedObjectJob(
				{ apiToken: args.apiToken, profileId: args.profileId, jobId: completion.jobId },
				{ status: completion.status, error: completion.error },
			)) return
			if (!completion.job || completion.status !== 'succeeded') return
			void invalidateObjectQueriesForJob(queryClient, completion.job, args.profileId, args.apiToken)
		},
		[args.apiToken, args.profileId, queryClient],
	)
	const { eventsConnected } = useJobsRealtimeEvents({
		apiToken: args.apiToken,
		profileId: args.profileId,
		queryClient,
		onJobCompleted: handleJobCompleted,
	})

	const createJobWithRetry = useCallback(
		async (req: JobCreateRequest) => {
			if (!args.profileId) throw new Error('profile is required')
			const job = await withJobQueueRetry(() => api.jobs.createJob(args.profileId!, req))
			queryClient.setQueryData(queryKeys.jobs.detail(args.profileId, job.id, args.apiToken), job)
			return job
		},
		[api, args.apiToken, args.profileId, queryClient],
	)

	return {
		queryClient,
		api,
		transfers,
		screens,
		isOffline,
		eventsConnected,
		debugObjectsList,
		debugContextMenu,
		commandPaletteOpener,
		createJobWithRetry,
	}
}
