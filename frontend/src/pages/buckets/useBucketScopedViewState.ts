import { useState } from 'react'

export type ScopedBucketState = {
	bucketName: string
	scopeKey: string
}

export function useBucketScopedViewState(currentScopeKey: string) {
	const [createOpenScope, setCreateOpenScope] = useState<string | null>(null)
	const [deletingBucketState, setDeletingBucketState] = useState<ScopedBucketState | null>(null)
	const [bucketNotEmptyDialogState, setBucketNotEmptyDialogState] = useState<ScopedBucketState | null>(null)

	return {
		createOpen: createOpenScope === currentScopeKey,
		deletingBucket:
			deletingBucketState?.scopeKey === currentScopeKey ? deletingBucketState.bucketName : null,
		bucketNotEmptyDialogBucket:
			bucketNotEmptyDialogState?.scopeKey === currentScopeKey
				? bucketNotEmptyDialogState.bucketName
				: null,
		setDeletingBucketState,
		setBucketNotEmptyDialogState,
		openCreateModal: () => setCreateOpenScope(currentScopeKey),
		closeCreateModal: () => setCreateOpenScope(null),
		closeBucketNotEmptyDialog: () => setBucketNotEmptyDialogState(null),
	}
}
