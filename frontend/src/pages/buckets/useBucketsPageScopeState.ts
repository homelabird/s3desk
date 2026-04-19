import { useLayoutEffect, useRef } from 'react'

import { useBucketScopedViewState } from './useBucketScopedViewState'

type UseBucketsPageScopeStateArgs = {
	apiToken: string
	profileId: string | null
}

export function useBucketsPageScopeState({
	apiToken,
	profileId,
}: UseBucketsPageScopeStateArgs) {
	const currentScopeKey = `${apiToken}:${profileId ?? 'none'}`
	const bucketsPageContextVersionRef = useRef(0)
	const latestScopeKeyRef = useRef(currentScopeKey)
	const viewState = useBucketScopedViewState(currentScopeKey)

	useLayoutEffect(() => {
		latestScopeKeyRef.current = currentScopeKey
		bucketsPageContextVersionRef.current += 1
	}, [currentScopeKey])

	return {
		currentScopeKey,
		latestScopeKeyRef,
		bucketsPageContextVersionRef,
		...viewState,
	}
}
