import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'

import type { APIClient } from '../../api/client'
import type { ListObjectsResponse, ObjectFavoritesResponse, ObjectItem } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type UseObjectsFavoritesArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	apiToken: string
	objectsPages: ListObjectsResponse[]
}

export function useObjectsFavorites({ api, profileId, bucket, apiToken, objectsPages }: UseObjectsFavoritesArgs) {
	const queryClient = useQueryClient()
	const [favoritePendingKeys, setFavoritePendingKeys] = useState<Set<string>>(() => new Set())

	const favoritesQueryKey = useMemo(
		() => ['objectFavorites', profileId, bucket, apiToken],
		[apiToken, bucket, profileId],
	)
	const favoritesQuery = useQuery({
		queryKey: favoritesQueryKey,
		enabled: !!profileId && !!bucket,
		queryFn: () => api.listObjectFavorites({ profileId: profileId!, bucket }),
	})
	const favoriteItems = useMemo(() => favoritesQuery.data?.items ?? [], [favoritesQuery.data?.items])
	const favoriteKeys = useMemo(() => new Set(favoriteItems.map((item) => item.key)), [favoriteItems])

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
			queryClient.setQueryData<ObjectFavoritesResponse | undefined>(favoritesQueryKey, (prev) => {
				const item = buildFavoriteItem(fav.key, fav.createdAt)
				if (!prev) {
					return { bucket, items: [item] }
				}
				const items = Array.isArray(prev.items) ? prev.items.filter((entry) => entry.key !== fav.key) : []
				return { ...prev, items: [item, ...items] }
			})
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
			queryClient.setQueryData<ObjectFavoritesResponse | undefined>(favoritesQueryKey, (prev) => {
				if (!prev || !Array.isArray(prev.items)) return prev
				return { ...prev, items: prev.items.filter((entry) => entry.key !== key) }
			})
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
		favoriteItems,
		favoriteKeys,
		favoritePendingKeys,
		toggleFavorite,
	}
}
