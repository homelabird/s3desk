import type { QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

import type { APIClient } from '../../api/client'
import type { ListObjectsResponse } from '../../api/types'
import type { LocationTab } from './objectsPageConstants'

type BucketOption = {
	value: string
}

type UseObjectsPrefetchParams = {
	api: APIClient
	apiToken: string
	profileId: string | null
	queryClient: QueryClient
	bucket: string
	tabs: LocationTab[]
	bucketOptions: BucketOption[]
	prefixByBucketRef: { current: Record<string, string> }
	pageSize: number
}

export function useObjectsPrefetch({
	api,
	apiToken,
	profileId,
	queryClient,
	bucket,
	tabs,
	bucketOptions,
	prefixByBucketRef,
	pageSize,
}: UseObjectsPrefetchParams): { handleBucketDropdownVisibleChange: (open: boolean) => void } {
	const prefetchObjectsPage = useCallback(
		async (bucketName: string) => {
			if (!profileId || !bucketName) return
			const savedPrefix = prefixByBucketRef.current[bucketName] ?? ''
			const queryKey = ['objects', profileId, bucketName, savedPrefix, apiToken]
			const existing = queryClient.getQueryState(queryKey)
			if (existing?.status === 'success' || existing?.fetchStatus === 'fetching') return
			try {
				await queryClient.prefetchInfiniteQuery({
					queryKey,
					initialPageParam: undefined as string | undefined,
					staleTime: 15_000,
					queryFn: ({ pageParam }) =>
						api.listObjects({
							profileId,
							bucket: bucketName,
							prefix: savedPrefix || undefined,
							delimiter: '/',
							maxKeys: pageSize,
							continuationToken: pageParam,
						}),
					getNextPageParam: (lastPage: ListObjectsResponse) =>
						lastPage.isTruncated ? lastPage.nextContinuationToken ?? undefined : undefined,
				})
			} catch {
				// ignore prefetch failures
			}
		},
		[api, apiToken, pageSize, prefixByBucketRef, profileId, queryClient],
	)

	const handleBucketDropdownVisibleChange = useCallback(
		(open: boolean) => {
			if (!open) return
			if (!profileId || bucketOptions.length === 0) return
			const recent = new Set<string>()
			if (bucket) recent.add(bucket)
			for (const tab of tabs) {
				if (tab.bucket) recent.add(tab.bucket)
			}
			const recentBuckets = Array.from(recent).filter((name) => name && name !== bucket).slice(0, 3)
			const fallbackBuckets = bucketOptions
				.map((option) => option.value)
				.filter((name) => name && !recent.has(name))
				.slice(0, Math.max(0, 3 - recentBuckets.length))
			for (const name of [...recentBuckets, ...fallbackBuckets]) {
				void prefetchObjectsPage(name)
			}
		},
		[bucket, bucketOptions, prefetchObjectsPage, profileId, tabs],
	)

	const prefetchQueueRef = useRef<string[]>([])
	const prefetchInFlightRef = useRef(0)
	const prefetchStartedRef = useRef(false)

	const pumpPrefetchQueue = useCallback(function pumpPrefetchQueueInternal() {
		const maxConcurrent = 2
		if (prefetchInFlightRef.current >= maxConcurrent) return
		const next = prefetchQueueRef.current.shift()
		if (!next) return
		prefetchInFlightRef.current += 1
		void prefetchObjectsPage(next).finally(() => {
			prefetchInFlightRef.current -= 1
			pumpPrefetchQueueInternal()
		})
	}, [prefetchObjectsPage])

	useEffect(() => {
		if (prefetchStartedRef.current) return
		if (!profileId) return
		const names = bucketOptions.map((option) => option.value).filter(Boolean)
		if (names.length === 0) return
		prefetchStartedRef.current = true
		const queue = names.filter((name) => name !== bucket).slice(0, 12)
		if (queue.length === 0) return
		prefetchQueueRef.current = queue
		const schedule = (cb: () => void) => {
			const idleCallback = (window as typeof window & {
				requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
			}).requestIdleCallback
			if (idleCallback) {
				idleCallback(cb, { timeout: 1500 })
				return
			}
			window.setTimeout(cb, 300)
		}
		schedule(() => pumpPrefetchQueue())
	}, [bucket, bucketOptions, profileId, pumpPrefetchQueue])

	return { handleBucketDropdownVisibleChange }
}
