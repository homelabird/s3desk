import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'

import type { useObjectsLocationState } from './useObjectsLocationState'
import { useObjectsPageLocationEffects } from './useObjectsPageLocationEffects'
import type { useObjectsPageQueries } from './useObjectsPageQueries'

type UseObjectsPageLocationSyncArgs = {
	profileId: string | null
	location: Pick<
		ReturnType<typeof useObjectsLocationState>,
		'bucket' | 'clearInvalidLocation' | 'navigateToLocation'
	>
	queries: Pick<ReturnType<typeof useObjectsPageQueries>, 'bucketsQuery'>
}

export function useObjectsPageLocationSync(args: UseObjectsPageLocationSyncArgs) {
	const routeLocation = useLocation()
	const navigate = useNavigate()
	const availableBucketNames = useMemo(
		() => new Set((args.queries.bucketsQuery.data ?? []).map((entry) => entry.name.trim()).filter(Boolean)),
		[args.queries.bucketsQuery.data],
	)

	useObjectsPageLocationEffects({
		routeLocation,
		navigate,
		navigateToLocation: args.location.navigateToLocation,
		profileId: args.profileId,
		currentBucket: args.location.bucket,
		availableBucketNames,
		bucketsLoaded: args.queries.bucketsQuery.isSuccess,
		clearInvalidLocation: args.location.clearInvalidLocation,
	})
}
