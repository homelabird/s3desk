import type { QueryClient } from '@tanstack/react-query'
import type { NavigateFunction } from 'react-router'

import type { APIClientShape } from '../../api/client'
import {
	buildBucketsPageControllerState,
	type BucketsPageControllerState,
} from './buildBucketsPageControllerState'
import { useBucketsPageFeatureState } from './useBucketsPageFeatureState'
import { useBucketsPageQueriesState } from './useBucketsPageQueriesState'
import { useBucketsPageScopeState } from './useBucketsPageScopeState'

type UseBucketsPageControllerStateArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	queryClient: QueryClient
	navigate: NavigateFunction
	useCompactList: boolean
}

export function useBucketsPageControllerState({
	api,
	apiToken,
	profileId,
	queryClient,
	navigate,
	useCompactList,
}: UseBucketsPageControllerStateArgs): BucketsPageControllerState {
	const scopeState = useBucketsPageScopeState({
		apiToken,
		profileId,
	})

	const queriesState = useBucketsPageQueriesState({
		api,
		apiToken,
		profileId,
	})

	const featureState = useBucketsPageFeatureState({
		api,
		apiToken,
		profileId,
		queryClient,
		navigate,
		scopeState,
		selectedProfile: queriesState.selectedProfile,
		capabilities: queriesState.capabilities,
	})

	return buildBucketsPageControllerState({
		api,
		scopeState,
		queriesState,
		featureState,
		useCompactList,
	})
}
