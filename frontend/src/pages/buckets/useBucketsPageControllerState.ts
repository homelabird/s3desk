import type { QueryClient } from '@tanstack/react-query'
import type { NavigateFunction } from 'react-router-dom'

import type { APIClient } from '../../api/client'
import { useBucketsPageCreateState } from './useBucketsPageCreateState'
import { useBucketsPageDeleteFlow } from './useBucketsPageDeleteFlow'
import { useBucketsPageOverlaysState } from './useBucketsPageOverlaysState'
import { useBucketsPageQueriesState } from './useBucketsPageQueriesState'
import { useBucketsPageScopeState } from './useBucketsPageScopeState'

type UseBucketsPageControllerStateArgs = {
	api: APIClient
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
}: UseBucketsPageControllerStateArgs) {
	const {
		currentScopeKey,
		latestScopeKeyRef,
		bucketsPageContextVersionRef,
		createOpen,
		deletingBucket,
		bucketNotEmptyDialogBucket,
		setDeletingBucketState,
		setBucketNotEmptyDialogState,
		openCreateModal,
		closeCreateModal,
		closeBucketNotEmptyDialog,
	} = useBucketsPageScopeState({
		apiToken,
		profileId,
	})

	const {
		metaQuery,
		profilesQuery,
		selectedProfile,
		profileResolved,
		capabilities,
		bucketCrudSupported,
		bucketCrudUnsupportedReason,
		bucketsQuery,
		buckets,
		showBucketsEmpty,
	} = useBucketsPageQueriesState({
		api,
		apiToken,
		profileId,
	})

	const {
		policySupported,
		policyUnsupportedReason,
		controlsSupported,
		controlsUnsupportedReason,
		policyBucket,
		controlsBucket,
		openPolicyModal,
		openControlsModal,
		closePolicyModal,
		closeControlsModal,
	} = useBucketsPageOverlaysState({
		currentScopeKey,
		selectedProfile,
		capabilities,
	})

	const { createMutation, submitCreateBucket } = useBucketsPageCreateState({
		api,
		apiToken,
		profileId,
		queryClient,
		bucketsPageContextVersionRef,
		closeCreateModal,
	})

	const {
		deleteMutation,
		deleteBucket,
		openBucketNotEmptyObjects,
		openBucketNotEmptyDeleteJob,
	} = useBucketsPageDeleteFlow({
		api,
		apiToken,
		profileId,
		queryClient,
		navigate,
		currentScopeKey,
		latestScopeKeyRef,
		bucketsPageContextVersionRef,
		bucketNotEmptyDialogBucket,
		setDeletingBucketState,
		setBucketNotEmptyDialogState,
	})

	return {
		api,
		useCompactList,
		metaQuery,
		profilesQuery,
		selectedProfile,
		profileResolved,
		capabilities,
		bucketCrudSupported,
		bucketCrudUnsupportedReason,
		policySupported,
		policyUnsupportedReason,
		controlsSupported,
		controlsUnsupportedReason,
		bucketsQuery,
		buckets,
		showBucketsEmpty,
		currentScopeKey,
		createOpen,
		openCreateModal,
		closeCreateModal,
		createMutation,
		deleteMutation,
		submitCreateBucket,
		deleteBucket,
		deletingBucket,
		openPolicyModal,
		openControlsModal,
		closePolicyModal,
		closeControlsModal,
		policyBucket,
		controlsBucket,
		bucketNotEmptyDialogBucket,
		closeBucketNotEmptyDialog,
		openBucketNotEmptyObjects,
		openBucketNotEmptyDeleteJob,
	}
}
