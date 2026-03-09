import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'

import type { APIClient } from '../../api/client'
import type { FavoriteObjectItem, ListObjectsResponse, ObjectFavoritesResponse, ObjectItem } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type UseObjectsFavoritesArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	apiToken: string
	objectsPages: ListObjectsResponse[]
	hydrateItems: boolean
}

function favoriteKeysFromResponse(response: ObjectFavoritesResponse | undefined): string[] {
	if (!response) return []
	if (Array.isArray(response.keys) && response.keys.length > 0) {
		return Array.from(new Set(response.keys.filter(Boolean)))
	}
	return Array.from(new Set((response.items ?? []).map((item) => item.key).filter(Boolean)))
}

function updateFavoriteResponse(
	response: ObjectFavoritesResponse | undefined,
	args: {
		bucket: string
		hydrated: boolean
		favoriteKey: string
		mode: 'add' | 'remove'
		item?: FavoriteObjectItem
	},
): ObjectFavoritesResponse {
	const nextKeys = favoriteKeysFromResponse(response)
	if (args.mode === 'add') {
		nextKeys.unshift(args.favoriteKey)
	}
	const uniqueKeys = Array.from(new Set(nextKeys.filter((key) => key && (args.mode === 'add' || key !== args.favoriteKey))))
	const nextItems =
		args.hydrated || response?.hydrated
			? args.mode === 'add'
				? [args.item, ...(response?.items ?? []).filter((item) => item.key !== args.favoriteKey)].filter(Boolean) as FavoriteObjectItem[]
				: (response?.items ?? []).filter((item) => item.key !== args.favoriteKey)
			: []
	return {
		bucket: response?.bucket ?? args.bucket,
		prefix: response?.prefix ?? '',
		count: uniqueKeys.length,
		keys: uniqueKeys,
		hydrated: args.hydrated || response?.hydrated || false,
		items: nextItems,
	}
}

export function useObjectsFavorites({ api, profileId, bucket, apiToken, objectsPages, hydrateItems }: UseObjectsFavoritesArgs) {
	const queryClient = useQueryClient()
	const [favoritePendingKeys, setFavoritePendingKeys] = useState<Set<string>>(() => new Set())

	const favoriteSummaryQueryKey = useMemo(
		() => ['objectFavorites', profileId, bucket, apiToken, 'summary'],
		[apiToken, bucket, profileId],
	)
	const favoriteItemsQueryKey = useMemo(
		() => ['objectFavorites', profileId, bucket, apiToken, 'items'],
		[apiToken, bucket, profileId],
	)
	const favoriteSummaryQuery = useQuery({
		queryKey: favoriteSummaryQueryKey,
		enabled: !!profileId && !!bucket,
		queryFn: () => api.listObjectFavorites({ profileId: profileId!, bucket, hydrate: false }),
	})
	const favoriteItemsQuery = useQuery({
		queryKey: favoriteItemsQueryKey,
		enabled: !!profileId && !!bucket && hydrateItems,
		queryFn: () => api.listObjectFavorites({ profileId: profileId!, bucket, hydrate: true }),
	})
	const favoritesQuery = hydrateItems ? favoriteItemsQuery : favoriteSummaryQuery
	const favoriteItems = useMemo(() => favoriteItemsQuery.data?.items ?? [], [favoriteItemsQuery.data?.items])
	const favoriteKeys = useMemo(
		() =>
			new Set(
				favoriteKeysFromResponse(favoriteSummaryQuery.data).concat(
					favoriteItemsQuery.data?.items?.map((item) => item.key) ?? [],
				),
			),
		[favoriteItemsQuery.data?.items, favoriteSummaryQuery.data],
	)
	const favoriteCount = favoriteSummaryQuery.data?.count ?? favoriteItemsQuery.data?.count ?? favoriteKeys.size

	const objectsItemMap = useMemo(() => {
		const map = new Map<string, ObjectItem>()
		for (const page of objectsPages) {
			for (const item of page.items) {
				map.set(item.key, item)
			}
		}
		return map
	}, [objectsPages])

	const buildFavoriteItem = useCallback(
		(key: string, createdAt: string) => {
			const found = objectsItemMap.get(key) ?? favoriteItems.find((item) => item.key === key)
			return {
				key,
				size: found?.size ?? 0,
				etag: found?.etag ?? '',
				lastModified: found?.lastModified ?? '',
				storageClass: found?.storageClass ?? '',
				createdAt,
			}
		},
		[favoriteItems, objectsItemMap],
	)

	const addFavoriteMutation = useMutation({
		mutationFn: (key: string) => api.createObjectFavorite({ profileId: profileId!, bucket, key }),
		onMutate: (key) => {
			setFavoritePendingKeys((prev) => new Set(prev).add(key))
		},
		onSuccess: (fav) => {
			const item = buildFavoriteItem(fav.key, fav.createdAt)
			queryClient.setQueryData<ObjectFavoritesResponse | undefined>(favoriteSummaryQueryKey, (prev) =>
				updateFavoriteResponse(prev, { bucket, hydrated: false, favoriteKey: fav.key, item, mode: 'add' }),
			)
			queryClient.setQueryData<ObjectFavoritesResponse | undefined>(favoriteItemsQueryKey, (prev) =>
				updateFavoriteResponse(prev, { bucket, hydrated: true, favoriteKey: fav.key, item, mode: 'add' }),
			)
		},
		onSettled: (_, __, key) => {
			setFavoritePendingKeys((prev) => {
				const next = new Set(prev)
				next.delete(key)
				return next
			})
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const removeFavoriteMutation = useMutation({
		mutationFn: (key: string) => api.deleteObjectFavorite({ profileId: profileId!, bucket, key }),
		onMutate: (key) => {
			setFavoritePendingKeys((prev) => new Set(prev).add(key))
		},
		onSuccess: (_, key) => {
			queryClient.setQueryData<ObjectFavoritesResponse | undefined>(favoriteSummaryQueryKey, (prev) =>
				updateFavoriteResponse(prev, { bucket, hydrated: false, favoriteKey: key, mode: 'remove' }),
			)
			queryClient.setQueryData<ObjectFavoritesResponse | undefined>(favoriteItemsQueryKey, (prev) =>
				updateFavoriteResponse(prev, { bucket, hydrated: true, favoriteKey: key, mode: 'remove' }),
			)
		},
		onSettled: (_, __, key) => {
			setFavoritePendingKeys((prev) => {
				const next = new Set(prev)
				next.delete(key)
				return next
			})
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const toggleFavorite = useCallback(
		(key: string) => {
			if (!profileId) {
				message.info('Select a profile first')
				return
			}
			if (!bucket) {
				message.info('Select a bucket first')
				return
			}
			if (favoriteKeys.has(key)) {
				removeFavoriteMutation.mutate(key)
				return
			}
			addFavoriteMutation.mutate(key)
		},
		[addFavoriteMutation, bucket, favoriteKeys, profileId, removeFavoriteMutation],
	)

	return {
		favoritesQuery,
		favoriteCount,
		favoriteItems,
		favoriteKeys,
		favoritePendingKeys,
		toggleFavorite,
	}
}
