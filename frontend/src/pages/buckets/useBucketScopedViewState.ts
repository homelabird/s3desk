import { useState } from 'react'

export type ScopedBucketState = {
	bucketName: string
	scopeKey: string
}

export function useBucketScopedViewState(currentScopeKey: string) {
	const [searchState, setSearchState] = useState({ scopeKey: currentScopeKey, query: '' })
	const [createOpenScope, setCreateOpenScope] = useState<string | null>(null)
	const [deletingBucketState, setDeletingBucketState] = useState<ScopedBucketState | null>(null)
	const [bucketNotEmptyDialogState, setBucketNotEmptyDialogState] = useState<ScopedBucketState | null>(null)
	if (searchState.scopeKey !== currentScopeKey) {
		setSearchState({ scopeKey: currentScopeKey, query: '' })
	}

	return {
		bucketSearch: searchState.scopeKey === currentScopeKey ? searchState.query : '',
		setBucketSearch: (query: string) => setSearchState({ scopeKey: currentScopeKey, query }),
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
