import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { APIClient } from '../../api/client'
import type { Bucket, ListObjectsResponse, Profile } from '../../api/types'
import { getProviderCapabilities, getUploadCapabilityDisabledReason } from '../../lib/providerCapabilities'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'
import { useObjectsFavorites } from './useObjectsFavorites'
import { OBJECTS_LIST_PAGE_SIZE } from './objectsPageConstants'
import { logObjectsDebug } from './objectsPageDebug'

type UseObjectsPageQueriesArgs = {
	api: APIClient
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
		queryKey: ['meta', apiToken],
		queryFn: () => api.server.getMeta(),
		enabled: !!apiToken,
	})

	const profilesQuery = useQuery({
		queryKey: ['profiles', apiToken],
		queryFn: () => api.profiles.listProfiles(),
		enabled: !!apiToken,
	})

	const selectedProfile: Profile | null = useMemo(() => {
		if (!profileId) return null
		return profilesQuery.data?.find((profile) => profile.id === profileId) ?? null
	}, [profileId, profilesQuery.data])

	const profileCapabilities = selectedProfile?.provider
		? getProviderCapabilities(selectedProfile.provider, metaQuery.data?.capabilities?.providers, selectedProfile)
		: null
	const objectCrudSupported = profileCapabilities ? profileCapabilities.objectCrud : true
	const uploadSupported = profileCapabilities ? profileCapabilities.objectCrud && profileCapabilities.jobTransfer : true
	const uploadDisabledReason = getUploadCapabilityDisabledReason(profileCapabilities)

	const bucketsQuery = useQuery({
		queryKey: ['buckets', profileId, apiToken],
		queryFn: () => api.buckets.listBuckets(profileId!),
		enabled: !!profileId,
		staleTime: getBucketsQueryStaleTimeMs(selectedProfile?.provider),
	})

	const objectsQuery = useInfiniteQuery({
		queryKey: ['objects', profileId, bucket, prefix, apiToken],
		enabled: !!profileId && !!bucket,
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
