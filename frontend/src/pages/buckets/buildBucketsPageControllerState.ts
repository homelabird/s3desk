import type { APIClientShape } from '../../api/client'
import type { BucketsPageShellViewProps } from './bucketsPagePresentationTypes'
import type { BucketsPageFeatureState } from './useBucketsPageFeatureState'
import type { BucketsPageQueriesState } from './useBucketsPageQueriesState'
import type { BucketsPageScopeState } from './useBucketsPageScopeState'

type BuildBucketsPageControllerStateArgs = {
	api: APIClientShape
	scopeState: BucketsPageScopeState
	queriesState: BucketsPageQueriesState
	featureState: BucketsPageFeatureState
	useCompactList: boolean
}

export type BucketsPageControllerState = {
	currentScopeKey: string
	queries: BucketsPageQueriesState
	shell: BucketsPageShellViewProps
}

export function buildBucketsPageControllerState({
	api,
	scopeState,
	queriesState,
	featureState,
	useCompactList,
}: BuildBucketsPageControllerStateArgs): BucketsPageControllerState {
	const hasProfileScope = !!queriesState.profileId || !!queriesState.selectedProfile?.id
	const bucketsLoading =
		hasProfileScope &&
		(!queriesState.profileResolved ||
			(queriesState.bucketCrudSupported &&
				queriesState.buckets.length === 0 &&
				(queriesState.bucketsQuery.isPending || queriesState.bucketsQuery.isFetching)))

	return {
		currentScopeKey: scopeState.currentScopeKey,
		queries: queriesState,
		shell: {
			api,
			selectedProfile: queriesState.selectedProfile,
			bucketCrudSupported: queriesState.bucketCrudSupported,
			bucketCrudUnsupportedReason: queriesState.bucketCrudUnsupportedReason,
			bucketsQueryError: queriesState.bucketsQuery.isError ? queriesState.bucketsQuery.error : null,
			bucketsLoading,
			buckets: queriesState.buckets,
			showBucketsEmpty: queriesState.showBucketsEmpty,
			openCreateModal: scopeState.openCreateModal,
			createOpen: scopeState.createOpen,
			closeCreateModal: scopeState.closeCreateModal,
			submitCreateBucket: featureState.submitCreateBucket,
			createLoading: featureState.createMutation.isPending,
			selectedProfileProvider: queriesState.selectedProfile?.provider,
			list: {
				buckets: queriesState.buckets,
				useCompactList,
				policySupported: featureState.policySupported,
				policyUnsupportedReason: featureState.policyUnsupportedReason,
				controlsSupported: featureState.controlsSupported,
				controlsUnsupportedReason: featureState.controlsUnsupportedReason,
				deletePending: featureState.deleteMutation.isPending,
				deletingBucket: scopeState.deletingBucket,
				onOpenControls: featureState.openControlsModal,
				onOpenPolicy: featureState.openPolicyModal,
				onDelete: featureState.deleteBucket,
			},
			dialogs: {
				policyBucket: featureState.policyBucket,
				closePolicyModal: featureState.closePolicyModal,
				openControlsModal: featureState.openControlsModal,
				controlsBucket: featureState.controlsBucket,
				closeControlsModal: featureState.closeControlsModal,
				openPolicyModal: featureState.openPolicyModal,
				bucketNotEmptyDialogBucket: scopeState.bucketNotEmptyDialogBucket,
				closeBucketNotEmptyDialog: scopeState.closeBucketNotEmptyDialog,
				openBucketNotEmptyObjects: featureState.openBucketNotEmptyObjects,
				openBucketNotEmptyDeleteJob: featureState.openBucketNotEmptyDeleteJob,
			},
		},
	}
}
