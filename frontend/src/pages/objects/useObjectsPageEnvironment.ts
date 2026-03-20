import { useQueryClient } from '@tanstack/react-query'
import { Grid } from 'antd'
import { useCallback, useMemo } from 'react'

import { APIClient } from '../../api/client'
import type { JobCreateRequest } from '../../api/types'
import { useTransfers } from '../../components/useTransfers'
import { withJobQueueRetry } from '../../lib/jobQueue'
import { useIsOffline } from '../../lib/useIsOffline'
import { isContextMenuDebugEnabled, isObjectsListDebugEnabled } from './objectsPageDebug'
import { useObjectsDeferredOpener } from './useObjectsDeferredOpener'

type UseObjectsPageEnvironmentArgs = {
	apiToken: string
	profileId: string | null
}

export function useObjectsPageEnvironment(args: UseObjectsPageEnvironmentArgs) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: args.apiToken }), [args.apiToken])
	const transfers = useTransfers()
	const screens = Grid.useBreakpoint()
	const isOffline = useIsOffline()
	const debugObjectsList = isObjectsListDebugEnabled()
	const debugContextMenu = isContextMenuDebugEnabled()
	const commandPaletteOpener = useObjectsDeferredOpener()

	const createJobWithRetry = useCallback(
		(req: JobCreateRequest) => {
			if (!args.profileId) throw new Error('profile is required')
			return withJobQueueRetry(() => api.jobs.createJob(args.profileId!, req))
		},
		[api, args.profileId],
	)

	return {
		queryClient,
		api,
		transfers,
		screens,
		isOffline,
		debugObjectsList,
		debugContextMenu,
		commandPaletteOpener,
		createJobWithRetry,
	}
}
