import type { BucketsPageRouteShellProps } from './BucketsPageRouteShell'
import type { BucketsPageState } from './useBucketsPageState'

type BucketsPageShellPropsArgs = {
	apiToken: string
	profileId: string | null
	state: BucketsPageState
}

export function buildBucketsPageShellProps({
	apiToken,
	profileId,
	state,
}: BucketsPageShellPropsArgs): BucketsPageRouteShellProps {
	const bucketsLoading =
		!!profileId &&
		(!state.profileResolved ||
			(state.bucketCrudSupported &&
				state.buckets.length === 0 &&
				(state.bucketsQuery.isPending || state.bucketsQuery.isFetching)))

	return {
		apiToken,
		profileId,
		shell: {
			api: state.api,
			selectedProfile: state.selectedProfile,
			bucketCrudSupported: state.bucketCrudSupported,
			bucketCrudUnsupportedReason: state.bucketCrudUnsupportedReason,
			bucketsQueryError: state.bucketsQuery.isError ? state.bucketsQuery.error : null,
			bucketsLoading,
			buckets: state.buckets,
			showBucketsEmpty: state.showBucketsEmpty,
			openCreateModal: state.openCreateModal,
			createOpen: state.createOpen,
			closeCreateModal: state.closeCreateModal,
			submitCreateBucket: state.submitCreateBucket,
			createLoading: state.createMutation.isPending,
			selectedProfileProvider: state.selectedProfile?.provider,
			list: {
				buckets: state.buckets,
				useCompactList: state.useCompactList,
				policySupported: state.policySupported,
				policyUnsupportedReason: state.policyUnsupportedReason,
				controlsSupported: state.controlsSupported,
				controlsUnsupportedReason: state.controlsUnsupportedReason,
				deletePending: state.deleteMutation.isPending,
				deletingBucket: state.deletingBucket,
				onOpenControls: state.openControlsModal,
				onOpenPolicy: state.openPolicyModal,
				onDelete: state.deleteBucket,
			},
			dialogs: {
				policyBucket: state.policyBucket,
				closePolicyModal: state.closePolicyModal,
				openControlsModal: state.openControlsModal,
				controlsBucket: state.controlsBucket,
				closeControlsModal: state.closeControlsModal,
				openPolicyModal: state.openPolicyModal,
				bucketNotEmptyDialogBucket: state.bucketNotEmptyDialogBucket,
				closeBucketNotEmptyDialog: state.closeBucketNotEmptyDialog,
				openBucketNotEmptyObjects: state.openBucketNotEmptyObjects,
				openBucketNotEmptyDeleteJob: state.openBucketNotEmptyDeleteJob,
			},
		},
	}
}
