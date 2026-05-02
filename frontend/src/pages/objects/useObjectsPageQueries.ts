import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { queryKeys } from '../../api/queryKeys'
import type { Bucket, ListObjectsResponse } from '../../api/types'
import type { ObjectsPageQueriesAPI } from '../../lib/pageApiScopes'
import { buildProfileCapabilityContext } from '../../lib/profileCapabilityContext'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'
import { useObjectsFavorites } from './useObjectsFavorites'
import { OBJECTS_LIST_PAGE_SIZE } from './objectsPageConstants'
import { logObjectsDebug } from './objectsPageDebug'

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

type GetNextObjectsContinuationTokenArgs = {
	lastPage: ListObjectsResponse
	lastPageParam: string | undefined
	allPageParams: Array<string | undefined>
	bucket: string
	prefix: string
	onWarn?: (message: string, context: Record<string, unknown>) => void
}

export function getNextObjectsContinuationToken({
	lastPage,
	lastPageParam,
	allPageParams,
	bucket,
	prefix,
	onWarn,
}: GetNextObjectsContinuationTokenArgs): string | undefined {
	if (!lastPage.isTruncated) return undefined

	const warnContext = { bucket, prefix }
	const nextToken = lastPage.nextContinuationToken ?? undefined
	if (!nextToken) {
		onWarn?.('List objects missing continuation token; stopping pagination', warnContext)
		return undefined
	}

	const lastCommonPrefixes = Array.isArray(lastPage.commonPrefixes) ? lastPage.commonPrefixes : []
	const pageEmpty = lastPage.items.length === 0 && lastCommonPrefixes.length === 0
	if (pageEmpty) {
		onWarn?.('List objects returned empty page; stopping pagination', { ...warnContext, nextToken })
		return undefined
	}

	if (typeof lastPageParam === 'string' && lastPageParam && nextToken === lastPageParam) {
		onWarn?.('List objects repeated continuation token; stopping pagination', { ...warnContext, nextToken })
		return undefined
	}

	const seen = new Set<string>()
	for (const param of allPageParams) {
		if (typeof param === 'string' && param) seen.add(param)
	}
	if (seen.has(nextToken)) {
		onWarn?.('List objects hit previously seen continuation token; stopping pagination', { ...warnContext, nextToken })
		return undefined
	}

	return nextToken
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
		queryFn: () => api.buckets.listBuckets(profileId!),
		enabled: !!profileId && profileCapabilityResolved && bucketCrudSupported,
		retry: false,
		staleTime: getBucketsQueryStaleTimeMs(selectedProfile?.provider),
	})

	const objectsQuery = useInfiniteQuery({
		queryKey: queryKeys.objects.list(profileId, bucket, prefix, apiToken),
		enabled: !!profileId && !!bucket && profileCapabilityResolved && objectCrudSupported,
		initialPageParam: undefined as string | undefined,
		staleTime: 15_000,
		queryFn: async ({ pageParam }) => {
			return api.objects.listObjects({
				profileId: profileId!,
				bucket,
				prefix,
				delimiter: '/',
				maxKeys: OBJECTS_LIST_PAGE_SIZE,
				continuationToken: pageParam,
			})
		},
		getNextPageParam: (lastPage, _allPages, lastPageParam, allPageParams) =>
			getNextObjectsContinuationToken({
				lastPage,
				lastPageParam,
				allPageParams,
				bucket,
				prefix,
				onWarn: (message, context) => logObjectsDebug(debugObjectsList, 'warn', message, context),
			}),
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
