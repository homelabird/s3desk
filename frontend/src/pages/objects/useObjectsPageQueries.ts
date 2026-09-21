import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { queryKeys } from '../../api/queryKeys'
import type { Bucket } from '../../api/types'
import type { ObjectsPageQueriesAPI } from '../../lib/pageApiScopes'
import { buildProfileCapabilityContext } from '../../lib/profileCapabilityContext'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'
import { useObjectsFavorites } from './useObjectsFavorites'
import {
	OBJECTS_ADVANCED_AUTO_SCAN_CAP,
	OBJECTS_AUTO_SCAN_CAP,
	OBJECTS_LIST_CONTINUATION_PAGE_SIZE,
	OBJECTS_LIST_PAGE_SIZE,
} from './objectsPageConstants'
import { logObjectsDebug } from './objectsPageDebug'
import { getNextObjectsContinuationToken } from './objectsContinuation'
export { getNextObjectsContinuationToken } from './objectsContinuation'

import { uniquePrefixes } from './objectsListUtils'

type UseObjectsPageQueriesArgs = {
	api: ObjectsPageQueriesAPI
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	debugObjectsList: boolean
	favoritesPaneExpanded: boolean
	favoritesOnly: boolean
}

type ObjectsPageParam = {
	continuationToken: string
	maxKeys: number
}

export function useObjectsPageQueries({
	api,
	apiToken,
	profileId,
	bucket,
	prefix,
	debugObjectsList,
	favoritesPaneExpanded,
	favoritesOnly,
}: UseObjectsPageQueriesArgs) {
	const metaQuery = useQuery({
		queryKey: queryKeys.server.meta(apiToken),
		queryFn: () => api.server.getMeta(),
		enabled: !!apiToken,
	})

	const profilesQuery = useQuery({
		queryKey: queryKeys.profiles.list(apiToken),
		queryFn: () => api.profiles.listProfiles(),
		enabled: !!apiToken,
	})

	const profileCapabilityContext = useMemo(
		() =>
			buildProfileCapabilityContext({
				profiles: profilesQuery.data,
				profileId,
				meta: metaQuery.data,
			}),
		[metaQuery.data, profileId, profilesQuery.data],
	)
	const {
		selectedProfile,
		capabilities: profileCapabilities,
		bucketCrudSupported,
		objectCrudSupported,
		uploadSupported,
		uploadDisabledReason,
	} = profileCapabilityContext
	const profileCapabilityResolved = !profileId || (profilesQuery.isSuccess && metaQuery.isSuccess)

	const bucketsQuery = useQuery({
		queryKey: queryKeys.buckets.list(profileId, apiToken),
		queryFn: ({ signal }) => api.buckets.listBuckets(profileId!, signal),
		enabled: !!profileId && profileCapabilityResolved && bucketCrudSupported,
		retry: false,
		staleTime: getBucketsQueryStaleTimeMs(selectedProfile?.provider),
	})

	const objectsQuery = useInfiniteQuery({
		queryKey: queryKeys.objects.list(profileId, bucket, prefix, apiToken),
		enabled: !!profileId && !!bucket && profileCapabilityResolved && objectCrudSupported,
		initialPageParam: undefined as ObjectsPageParam | undefined,
		staleTime: 15_000,
		queryFn: async ({ pageParam, signal }) => {
			return api.objects.listObjects({
				profileId: profileId!,
				bucket,
				prefix,
				delimiter: '/',
				maxKeys: pageParam?.maxKeys ?? OBJECTS_LIST_PAGE_SIZE,
				continuationToken: pageParam?.continuationToken,
				signal,
			})
		},
		getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) => {
			const continuationToken = getNextObjectsContinuationToken({
				lastPage,
				lastPageParam: lastPageParam?.continuationToken,
				allPageParams: allPageParams.map((pageParam) => pageParam?.continuationToken),
				bucket,
				prefix,
				onWarn: (message, context) => logObjectsDebug(debugObjectsList, 'warn', message, context),
			})
			if (!continuationToken) return undefined

			const loadedCount = uniquePrefixes(allPages).length + allPages.reduce((total, page) => total + page.items.length, 0)
			const nextBoundary = loadedCount < OBJECTS_AUTO_SCAN_CAP
				? OBJECTS_AUTO_SCAN_CAP
				: OBJECTS_ADVANCED_AUTO_SCAN_CAP
			const maxKeys = loadedCount < OBJECTS_ADVANCED_AUTO_SCAN_CAP
				? Math.min(OBJECTS_LIST_CONTINUATION_PAGE_SIZE, nextBoundary - loadedCount)
				: OBJECTS_LIST_CONTINUATION_PAGE_SIZE

			return { continuationToken, maxKeys }
		},
	})

	const { favoritesQuery, favoriteCount, favoriteItems, favoriteKeys, favoritePendingKeys, toggleFavorite } = useObjectsFavorites({
		api,
		profileId,
		bucket,
		apiToken,
		objectsPages: objectsQuery.data?.pages ?? [],
		hydrateItems: favoritesPaneExpanded || favoritesOnly,
		enabled: profileCapabilityResolved && objectCrudSupported,
	})

	const bucketOptions = useMemo(
		() => (bucketsQuery.data ?? []).map((entry: Bucket) => ({ label: entry.name, value: entry.name })),
		[bucketsQuery.data],
	)

	return {
		metaQuery,
		profilesQuery,
		selectedProfile,
		profileCapabilities,
		objectCrudSupported,
		uploadSupported,
		uploadDisabledReason,
		bucketsQuery,
		bucketOptions,
		objectsQuery,
		favoritesQuery,
		favoriteCount,
		favoriteItems,
		favoriteKeys,
		favoritePendingKeys,
		toggleFavorite,
	}
}
