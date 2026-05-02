import { useEffect } from 'react'

type RouteLocationLike = {
	pathname: string
	search: string
	hash: string
	state: unknown
}

type UseObjectsPageLocationEffectsArgs = {
	routeLocation: RouteLocationLike
	navigate: (to: string, options?: { replace?: boolean; state?: unknown }) => void
	navigateToLocation: (
		bucket: string,
		prefix: string,
		options?: { recordHistory?: boolean },
	) => void
	profileId: string | null
	currentBucket: string
	availableBucketNames: Set<string>
	bucketsLoaded: boolean
	clearInvalidLocation: (invalidBucketRaw?: string) => void
}

export function useObjectsPageLocationEffects({
	routeLocation,
	navigate,
	navigateToLocation,
	profileId,
	currentBucket,
	availableBucketNames,
	bucketsLoaded,
	clearInvalidLocation,
}: UseObjectsPageLocationEffectsArgs) {
	useEffect(() => {
		if (!routeLocation.state || typeof routeLocation.state !== 'object') return
		const state = routeLocation.state as {
			openBucket?: unknown
			bucket?: unknown
			prefix?: unknown
		}
		if (state.openBucket !== true) return
		const nextBucket = typeof state.bucket === 'string' ? state.bucket.trim() : ''
		if (!nextBucket) return
		const nextPrefix = typeof state.prefix === 'string' ? state.prefix : ''
		navigateToLocation(nextBucket, nextPrefix, { recordHistory: true })
		navigate(`${routeLocation.pathname}${routeLocation.search}${routeLocation.hash}`, {
			replace: true,
			state: null,
		})
	}, [navigate, navigateToLocation, routeLocation])

	useEffect(() => {
		if (!profileId || !bucketsLoaded) return
		const activeBucket = currentBucket.trim()
		if (!activeBucket) return
		if (availableBucketNames.has(activeBucket)) return
		clearInvalidLocation(activeBucket)
	}, [
		availableBucketNames,
		bucketsLoaded,
		clearInvalidLocation,
		currentBucket,
		profileId,
	])
}
