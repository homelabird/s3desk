import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { queryKeys } from '../../api/queryKeys'
import type { FavoriteObjectItem, ListObjectsResponse, ObjectFavoritesResponse, ObjectItem } from '../../api/types'
import type { ObjectsFavoritesAPI } from '../../lib/pageApiScopes'
import { objectsFeedback } from './objectsFeedback'

type UseObjectsFavoritesArgs = {
	api: ObjectsFavoritesAPI
	profileId: string | null
	bucket: string
	apiToken: string
	objectsPages: ListObjectsResponse[]
	hydrateItems: boolean
	enabled?: boolean
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
): ObjectFavoritesResponse | undefined {
	if (!response) return undefined
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

export function useObjectsFavorites({ api, profileId, bucket, apiToken, objectsPages, hydrateItems, enabled = true }: UseObjectsFavoritesArgs) {
	const queryClient = useQueryClient()
	const currentScopeKey = `${profileId ?? ''}:${bucket}:${apiToken}`
	const favoriteContextVersionRef = useRef(0)
	const favoriteMutationRequestIdRef = useRef(0)
	const favoriteMutationOwnerByKeyRef = useRef(new Map<string, number>())
	const [favoritePendingOwnersByScope, setFavoritePendingOwnersByScope] = useState(
		() => new Map<string, Map<string, number>>(),
	)

	useEffect(() => {
		favoriteContextVersionRef.current += 1
	}, [currentScopeKey])

	const favoriteSummaryQueryKey = useMemo(
		() => queryKeys.objects.favoritesSummary(profileId, bucket, apiToken),
		[apiToken, bucket, profileId],
	)
	const favoriteItemsQueryKey = useMemo(
		() => queryKeys.objects.favoritesItems(profileId, bucket, apiToken),
		[apiToken, bucket, profileId],
	)
	const favoriteItemsEnabled = enabled && !!profileId && !!bucket && hydrateItems
	const favoriteItemsQuery = useQuery({
		queryKey: favoriteItemsEnabled ? favoriteItemsQueryKey : [...favoriteItemsQueryKey, 'disabled'],
		enabled: favoriteItemsEnabled,
		retry: false,
		queryFn: ({ signal }) => api.objects.listObjectFavorites({ profileId: profileId!, bucket, hydrate: true, signal }),
	})
	const favoriteSummaryEnabled = enabled && !!profileId && !!bucket && (!hydrateItems || favoriteItemsQuery.isError)
	const favoriteSummaryQuery = useQuery({
		queryKey: favoriteSummaryEnabled ? favoriteSummaryQueryKey : [...favoriteSummaryQueryKey, 'disabled'],
		enabled: favoriteSummaryEnabled,
		retry: false,
		queryFn: ({ signal }) => api.objects.listObjectFavorites({ profileId: profileId!, bucket, hydrate: false, signal }),
	})
	const favoritesQuery = hydrateItems ? favoriteItemsQuery : favoriteSummaryQuery
	const favoriteItemsResponse = favoriteItemsQuery.data ?? queryClient.getQueryData<ObjectFavoritesResponse>(favoriteItemsQueryKey)
	const favoriteSummaryResponse = favoriteSummaryQuery.data ?? queryClient.getQueryData<ObjectFavoritesResponse>(favoriteSummaryQueryKey)
	const favoriteResponse = hydrateItems && !favoriteItemsQuery.isError
		? favoriteItemsResponse ?? favoriteSummaryResponse
		: favoriteSummaryResponse ?? favoriteItemsResponse
	const favoriteItems = useMemo(() => favoriteItemsResponse?.items ?? [], [favoriteItemsResponse?.items])
	const favoriteKeys = useMemo(() => new Set(favoriteKeysFromResponse(favoriteResponse)), [favoriteResponse])
	const favoriteCount = favoriteResponse?.count ?? favoriteKeys.size

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
	const favoriteQueryKeys = [favoriteSummaryQueryKey, favoriteItemsQueryKey]
	const cancelFavoriteQueriesForMutation = async () => {
		const queryKeysToRecover = favoriteQueryKeys.filter((queryKey) => {
			const state = queryClient.getQueryState(queryKey)
			return state?.fetchStatus === 'fetching' || state?.data === undefined
		})
		await Promise.all(favoriteQueryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey, exact: true })))
		return queryKeysToRecover
	}

	const addFavoriteMutation = useMutation({
		mutationFn: (key: string) => api.objects.createObjectFavorite({ profileId: profileId!, bucket, key }),
		onMutate: async (key) => {
			const contextVersion = favoriteContextVersionRef.current
			const requestId = ++favoriteMutationRequestIdRef.current
			const ownerKey = JSON.stringify([currentScopeKey, key])
			favoriteMutationOwnerByKeyRef.current.set(ownerKey, requestId)
			const sourceItem = getFavoriteSourceItem(key)
			setFavoritePendingOwnersByScope((prev) => {
				const next = new Map(prev)
				const owners = new Map(prev.get(currentScopeKey) ?? [])
				owners.set(key, requestId)
				next.set(currentScopeKey, owners)
				return next
			})
			const queryKeysToRecover = await cancelFavoriteQueriesForMutation()
			return {
				contextVersion,
				ownerKey,
				requestId,
				scopeKey: currentScopeKey,
				queryKeysToRecover,
				summaryQueryKey: favoriteSummaryQueryKey,
				itemsQueryKey: favoriteItemsQueryKey,
				scopeBucket: bucket,
				sourceItem,
			}
		},
		onSuccess: (fav, _key, context) => {
			if (!context || favoriteMutationOwnerByKeyRef.current.get(context.ownerKey) !== context.requestId) return
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
			if (!context || favoriteMutationOwnerByKeyRef.current.get(context.ownerKey) !== context.requestId) return
			favoriteMutationOwnerByKeyRef.current.delete(context.ownerKey)
			for (const queryKey of context?.queryKeysToRecover ?? []) {
				void queryClient.invalidateQueries({ queryKey, exact: true })
			}
			setFavoritePendingOwnersByScope((prev) => {
				const currentOwners = prev.get(context.scopeKey)
				if (currentOwners?.get(key) !== context.requestId) return prev
				const next = new Map(prev)
				const owners = new Map(currentOwners)
				owners.delete(key)
				if (owners.size === 0) next.delete(context.scopeKey)
				else next.set(context.scopeKey, owners)
				return next
			})
		},
		onError: (err, _key, context) => {
			if (
				!context ||
				context.contextVersion !== favoriteContextVersionRef.current ||
				favoriteMutationOwnerByKeyRef.current.get(context.ownerKey) !== context.requestId
			) return
			objectsFeedback.error(err)
		},
	})

	const removeFavoriteMutation = useMutation({
		mutationFn: (key: string) => api.objects.deleteObjectFavorite({ profileId: profileId!, bucket, key }),
		onMutate: async (key) => {
			const contextVersion = favoriteContextVersionRef.current
			const requestId = ++favoriteMutationRequestIdRef.current
			const ownerKey = JSON.stringify([currentScopeKey, key])
			favoriteMutationOwnerByKeyRef.current.set(ownerKey, requestId)
			setFavoritePendingOwnersByScope((prev) => {
				const next = new Map(prev)
				const owners = new Map(prev.get(currentScopeKey) ?? [])
				owners.set(key, requestId)
				next.set(currentScopeKey, owners)
				return next
			})
			const queryKeysToRecover = await cancelFavoriteQueriesForMutation()
			return {
				contextVersion,
				ownerKey,
				requestId,
				scopeKey: currentScopeKey,
				queryKeysToRecover,
				summaryQueryKey: favoriteSummaryQueryKey,
				itemsQueryKey: favoriteItemsQueryKey,
				scopeBucket: bucket,
			}
		},
		onSuccess: (_, key, context) => {
			if (!context || favoriteMutationOwnerByKeyRef.current.get(context.ownerKey) !== context.requestId) return
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
			if (!context || favoriteMutationOwnerByKeyRef.current.get(context.ownerKey) !== context.requestId) return
			favoriteMutationOwnerByKeyRef.current.delete(context.ownerKey)
			for (const queryKey of context?.queryKeysToRecover ?? []) {
				void queryClient.invalidateQueries({ queryKey, exact: true })
			}
			setFavoritePendingOwnersByScope((prev) => {
				const currentOwners = prev.get(context.scopeKey)
				if (currentOwners?.get(key) !== context.requestId) return prev
				const next = new Map(prev)
				const owners = new Map(currentOwners)
				owners.delete(key)
				if (owners.size === 0) next.delete(context.scopeKey)
				else next.set(context.scopeKey, owners)
				return next
			})
		},
		onError: (err, _key, context) => {
			if (
				!context ||
				context.contextVersion !== favoriteContextVersionRef.current ||
				favoriteMutationOwnerByKeyRef.current.get(context.ownerKey) !== context.requestId
			) return
			objectsFeedback.error(err)
		},
		})

	const favoritesReady = favoriteResponse !== undefined
	const favoritePendingKeys = useMemo(() => {
		const scopedPending = new Set(favoritePendingOwnersByScope.get(currentScopeKey)?.keys() ?? [])
		if (favoritesReady) return scopedPending
		const pending = new Set(scopedPending)
		for (const key of objectsItemMap.keys()) pending.add(key)
		return pending
	}, [currentScopeKey, favoritePendingOwnersByScope, favoritesReady, objectsItemMap])

	const toggleFavorite = useCallback(
		(key: string) => {
			if (!enabled) return
			if (!profileId) {
				objectsFeedback.selectProfileFirst()
				return
			}
			if (!bucket) {
				objectsFeedback.selectBucketFirst()
				return
			}
			if (!favoritesReady || favoritePendingKeys.has(key)) return
			if (favoriteKeys.has(key)) {
				removeFavoriteMutation.mutate(key)
				return
			}
			addFavoriteMutation.mutate(key)
		},
		[addFavoriteMutation, bucket, enabled, favoriteKeys, favoritePendingKeys, favoritesReady, profileId, removeFavoriteMutation],
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
