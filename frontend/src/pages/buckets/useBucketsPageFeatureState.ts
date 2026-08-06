import type { QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { NavigateFunction } from 'react-router'

import type { APIClientShape } from '../../api/client'
import type { BucketsPageQueriesState } from './useBucketsPageQueriesState'
import type { BucketsPageScopeState } from './useBucketsPageScopeState'
import { useBucketsPageCreateState } from './useBucketsPageCreateState'
import { useBucketsPageDeleteFlow } from './useBucketsPageDeleteFlow'
import { useBucketsPageOverlaysState } from './useBucketsPageOverlaysState'

type UseBucketsPageFeatureStateArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	queryClient: QueryClient
	navigate: NavigateFunction
	scopeState: BucketsPageScopeState
	selectedProfile: BucketsPageQueriesState['selectedProfile']
	capabilities: BucketsPageQueriesState['capabilities']
}

export function useBucketsPageFeatureState({
	api,
	apiToken,
	profileId,
	queryClient,
	navigate,
	scopeState,
	selectedProfile,
	capabilities,
}: UseBucketsPageFeatureStateArgs) {
	const overlaysState = useBucketsPageOverlaysState({
		currentScopeKey: scopeState.currentScopeKey,
		selectedProfile,
		capabilities,
	})

	const createState = useBucketsPageCreateState({
		api,
		apiToken,
		profileId,
		queryClient,
		bucketsPageContextVersionRef: scopeState.bucketsPageContextVersionRef,
		closeCreateModal: scopeState.closeCreateModal,
	})

	const deleteFlow = useBucketsPageDeleteFlow({
		api,
		apiToken,
		profileId,
		queryClient,
		navigate,
		currentScopeKey: scopeState.currentScopeKey,
		latestScopeKeyRef: scopeState.latestScopeKeyRef,
		bucketsPageContextVersionRef: scopeState.bucketsPageContextVersionRef,
		bucketNotEmptyDialogBucket: scopeState.bucketNotEmptyDialogBucket,
		setDeletingBucketState: scopeState.setDeletingBucketState,
		setBucketNotEmptyDialogState: scopeState.setBucketNotEmptyDialogState,
	})
	const openObjectsBucket = useCallback(
		(bucket: string) => {
			navigate('/objects', {
				state: {
					openBucket: true,
					bucket,
					prefix: '',
				},
			})
		},
		[navigate],
	)

	return {
		...overlaysState,
		...createState,
		...deleteFlow,
		openObjectsBucket,
	}
}

export type BucketsPageFeatureState = ReturnType<typeof useBucketsPageFeatureState>
