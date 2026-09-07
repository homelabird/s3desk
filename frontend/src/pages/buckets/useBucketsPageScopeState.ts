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
	const bucketsPageContextVersionRef = useRef(1)
	const latestScopeKeyRef = useRef(currentScopeKey)
	const viewState = useBucketScopedViewState(currentScopeKey)

	useLayoutEffect(() => {
		latestScopeKeyRef.current = currentScopeKey
		return () => {
			latestScopeKeyRef.current = ''
			bucketsPageContextVersionRef.current += 1
		}
	}, [currentScopeKey])

	return {
		currentScopeKey,
		latestScopeKeyRef,
		bucketsPageContextVersionRef,
		...viewState,
	}
}

export type BucketsPageScopeState = ReturnType<typeof useBucketsPageScopeState>
