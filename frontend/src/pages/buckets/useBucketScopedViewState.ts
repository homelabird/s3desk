import { useState } from 'react'

type ScopedBucketState = {
	bucketName: string
	scopeKey: string
}

export function useBucketScopedViewState(currentScopeKey: string) {
	const [createOpenScope, setCreateOpenScope] = useState<string | null>(null)
	const [deletingBucketState, setDeletingBucketState] = useState<ScopedBucketState | null>(null)
	const [policyBucketState, setPolicyBucketState] = useState<ScopedBucketState | null>(null)
	const [controlsBucketState, setControlsBucketState] = useState<ScopedBucketState | null>(null)
	const [bucketNotEmptyDialogState, setBucketNotEmptyDialogState] = useState<ScopedBucketState | null>(null)

	return {
		createOpen: createOpenScope === currentScopeKey,
		deletingBucket:
			deletingBucketState?.scopeKey === currentScopeKey ? deletingBucketState.bucketName : null,
		policyBucket:
			policyBucketState?.scopeKey === currentScopeKey ? policyBucketState.bucketName : null,
		controlsBucket:
			controlsBucketState?.scopeKey === currentScopeKey ? controlsBucketState.bucketName : null,
		bucketNotEmptyDialogBucket:
			bucketNotEmptyDialogState?.scopeKey === currentScopeKey
				? bucketNotEmptyDialogState.bucketName
				: null,
		setDeletingBucketState,
		setBucketNotEmptyDialogState,
		openCreateModal: () => setCreateOpenScope(currentScopeKey),
		closeCreateModal: () => setCreateOpenScope(null),
		openPolicyModal: (bucketName: string) => {
			setControlsBucketState(null)
			setPolicyBucketState({ bucketName, scopeKey: currentScopeKey })
		},
		openControlsModal: (bucketName: string) => {
			setPolicyBucketState(null)
			setControlsBucketState({ bucketName, scopeKey: currentScopeKey })
		},
		closePolicyModal: () => setPolicyBucketState(null),
		closeControlsModal: () => setControlsBucketState(null),
		closeBucketNotEmptyDialog: () => setBucketNotEmptyDialogState(null),
	}
}
