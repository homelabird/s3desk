import type { APIClientShape } from '../../api/client'
import type { BucketsPageShellViewProps } from './bucketsPagePresentationTypes'
import type { BucketsPageFeatureState } from './useBucketsPageFeatureState'
import type { BucketsPageQueriesState } from './useBucketsPageQueriesState'
import type { BucketsPageScopeState } from './useBucketsPageScopeState'

type BuildBucketsPageShellViewPropsArgs = {
	api: APIClientShape
	scopeState: BucketsPageScopeState
	queriesState: BucketsPageQueriesState
	featureState: BucketsPageFeatureState
	useCompactList: boolean
}

export function buildBucketsPageShellViewProps({
	api,
	scopeState,
	queriesState,
	featureState,
	useCompactList,
}: BuildBucketsPageShellViewPropsArgs): BucketsPageShellViewProps {
	return {
		api,
		selectedProfile: queriesState.selectedProfile,
		bucketCrudSupported: queriesState.bucketCrudSupported,
		bucketCrudUnsupportedReason: queriesState.bucketCrudUnsupportedReason,
		bucketsQueryError: queriesState.bucketsQuery.isError ? queriesState.bucketsQuery.error : null,
		bucketsLoading: isBucketsPageListLoading(queriesState),
		buckets: queriesState.buckets,
		showBucketsEmpty: queriesState.showBucketsEmpty,
		openCreateModal: scopeState.openCreateModal,
		createOpen: scopeState.createOpen,
		closeCreateModal: scopeState.closeCreateModal,
		submitCreateBucket: featureState.submitCreateBucket,
		createLoading: featureState.createMutation.isPending,
		selectedProfileProvider: queriesState.selectedProfile?.provider,
		list: buildBucketsListProps({
			scopeState,
			queriesState,
			featureState,
			useCompactList,
		}),
		dialogs: buildBucketsDialogsProps({ scopeState, featureState }),
	}
}

export function isBucketsPageListLoading(queriesState: BucketsPageQueriesState): boolean {
	const hasProfileScope = !!queriesState.profileId || !!queriesState.selectedProfile?.id
	return (
		hasProfileScope &&
		(!queriesState.profileResolved ||
			(queriesState.bucketCrudSupported &&
				queriesState.buckets.length === 0 &&
				(queriesState.bucketsQuery.isPending || queriesState.bucketsQuery.isFetching)))
	)
}

function buildBucketsListProps({
	scopeState,
	queriesState,
	featureState,
	useCompactList,
}: Omit<BuildBucketsPageShellViewPropsArgs, 'api'>): BucketsPageShellViewProps['list'] {
	return {
		buckets: queriesState.buckets,
		useCompactList,
		policySupported: featureState.policySupported,
		policyUnsupportedReason: featureState.policyUnsupportedReason,
		controlsSupported: featureState.controlsSupported,
		controlsUnsupportedReason: featureState.controlsUnsupportedReason,
		deletePending: featureState.deleteMutation.isPending,
		deletingBucket: scopeState.deletingBucket,
		onOpenObjects: featureState.openObjectsBucket,
		onOpenControls: featureState.openControlsModal,
		onOpenPolicy: featureState.openPolicyModal,
		onDelete: featureState.deleteBucket,
	}
}

function buildBucketsDialogsProps({
	scopeState,
	featureState,
}: Pick<BuildBucketsPageShellViewPropsArgs, 'scopeState' | 'featureState'>): BucketsPageShellViewProps['dialogs'] {
	return {
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
	}
}
