import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
	const currentScopeKey = `${profileId ?? ''}:${bucket}:${apiToken}`
	const favoriteContextVersionRef = useRef(0)
	const [favoritePendingState, setFavoritePendingState] = useState<{ scopeKey: string; keys: Set<string> }>(() => ({
		scopeKey: currentScopeKey,
		keys: new Set(),
	}))

	useEffect(() => {
		favoriteContextVersionRef.current += 1
	}, [currentScopeKey])

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
		queryFn: () => api.objects.listObjectFavorites({ profileId: profileId!, bucket, hydrate: false }),
	})
	const favoriteItemsQuery = useQuery({
		queryKey: favoriteItemsQueryKey,
		enabled: !!profileId && !!bucket && hydrateItems,
		queryFn: () => api.objects.listObjectFavorites({ profileId: profileId!, bucket, hydrate: true }),
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

	const getFavoriteSourceItem = useCallback(
		(key: string) => objectsItemMap.get(key) ?? favoriteItems.find((item) => item.key === key),
		[favoriteItems, objectsItemMap],
	)

	const addFavoriteMutation = useMutation({
		mutationFn: (key: string) => api.objects.createObjectFavorite({ profileId: profileId!, bucket, key }),
		onMutate: (key) => {
			const contextVersion = favoriteContextVersionRef.current
			const sourceItem = getFavoriteSourceItem(key)
			setFavoritePendingState((prev) => {
				const next = prev.scopeKey === currentScopeKey ? new Set(prev.keys) : new Set<string>()
				next.add(key)
				return { scopeKey: currentScopeKey, keys: next }
			})
			return {
				contextVersion,
				scopeKey: currentScopeKey,
				summaryQueryKey: favoriteSummaryQueryKey,
				itemsQueryKey: favoriteItemsQueryKey,
				scopeBucket: bucket,
				sourceItem,
			}
		},
		onSuccess: (fav, _key, context) => {
			const item = {
				key: fav.key,
				size: context?.sourceItem?.size ?? 0,
				etag: context?.sourceItem?.etag ?? '',
				lastModified: context?.sourceItem?.lastModified ?? '',
				storageClass: context?.sourceItem?.storageClass ?? '',
				createdAt: fav.createdAt,
			}
			queryClient.setQueryData<ObjectFavoritesResponse | undefined>(context?.summaryQueryKey ?? favoriteSummaryQueryKey, (prev) =>
				updateFavoriteResponse(prev, {
					bucket: context?.scopeBucket ?? bucket,
					hydrated: false,
					favoriteKey: fav.key,
					item,
					mode: 'add',
				}),
			)
			queryClient.setQueryData<ObjectFavoritesResponse | undefined>(context?.itemsQueryKey ?? favoriteItemsQueryKey, (prev) =>
				updateFavoriteResponse(prev, {
					bucket: context?.scopeBucket ?? bucket,
					hydrated: true,
					favoriteKey: fav.key,
					item,
					mode: 'add',
				}),
			)
		},
		onSettled: (_, __, key, context) => {
			if (!context || context.contextVersion !== favoriteContextVersionRef.current) return
			setFavoritePendingState((prev) => {
				if (prev.scopeKey !== context.scopeKey) return prev
				const next = new Set(prev.keys)
				next.delete(key)
				return { scopeKey: prev.scopeKey, keys: next }
			})
		},
		onError: (err, _key, context) => {
			if (context?.contextVersion !== favoriteContextVersionRef.current) return
			message.error(formatErr(err))
		},
	})

	const removeFavoriteMutation = useMutation({
		mutationFn: (key: string) => api.objects.deleteObjectFavorite({ profileId: profileId!, bucket, key }),
		onMutate: (key) => {
			const contextVersion = favoriteContextVersionRef.current
			setFavoritePendingState((prev) => {
				const next = prev.scopeKey === currentScopeKey ? new Set(prev.keys) : new Set<string>()
				next.add(key)
				return { scopeKey: currentScopeKey, keys: next }
			})
			return {
				contextVersion,
				scopeKey: currentScopeKey,
				summaryQueryKey: favoriteSummaryQueryKey,
				itemsQueryKey: favoriteItemsQueryKey,
				scopeBucket: bucket,
			}
		},
		onSuccess: (_, key, context) => {
			queryClient.setQueryData<ObjectFavoritesResponse | undefined>(context?.summaryQueryKey ?? favoriteSummaryQueryKey, (prev) =>
				updateFavoriteResponse(prev, {
					bucket: context?.scopeBucket ?? bucket,
					hydrated: false,
					favoriteKey: key,
					mode: 'remove',
				}),
			)
			queryClient.setQueryData<ObjectFavoritesResponse | undefined>(context?.itemsQueryKey ?? favoriteItemsQueryKey, (prev) =>
				updateFavoriteResponse(prev, {
					bucket: context?.scopeBucket ?? bucket,
					hydrated: true,
					favoriteKey: key,
					mode: 'remove',
				}),
			)
		},
		onSettled: (_, __, key, context) => {
			if (!context || context.contextVersion !== favoriteContextVersionRef.current) return
			setFavoritePendingState((prev) => {
				if (prev.scopeKey !== context.scopeKey) return prev
				const next = new Set(prev.keys)
				next.delete(key)
				return { scopeKey: prev.scopeKey, keys: next }
			})
		},
		onError: (err, _key, context) => {
			if (context?.contextVersion !== favoriteContextVersionRef.current) return
			message.error(formatErr(err))
		},
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
		favoritePendingKeys: favoritePendingState.scopeKey === currentScopeKey ? favoritePendingState.keys : new Set<string>(),
		toggleFavorite,
	}
}
