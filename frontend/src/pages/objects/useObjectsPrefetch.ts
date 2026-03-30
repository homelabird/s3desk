import type { QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

import type { APIClient } from '../../api/client'
import type { ListObjectsResponse } from '../../api/types'
import { getBucketPrefetchPlan, type ObjectsCostMode } from '../../lib/objectsCostMode'

type BucketOption = {
	value: string
}

type UseObjectsPrefetchParams = {
	api: APIClient
	apiToken: string
	profileId: string | null
	profileProvider?: string | null
	objectsCostMode: ObjectsCostMode
	queryClient: QueryClient
	bucket: string
	recentBuckets: string[]
	bucketOptions: BucketOption[]
	prefixByBucketRef: { current: Record<string, string> }
	pageSize: number
}

export function useObjectsPrefetch({
	api,
	apiToken,
	profileId,
	profileProvider,
	objectsCostMode,
	queryClient,
	bucket,
	recentBuckets,
	bucketOptions,
	prefixByBucketRef,
	pageSize,
}: UseObjectsPrefetchParams): { handleBucketDropdownVisibleChange: (open: boolean) => void } {
	const prefetchScopeKey = `${apiToken}:${profileId ?? ''}:${profileProvider ?? ''}:${objectsCostMode}`
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
						api.objects.listObjects({
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
			const plan = getBucketPrefetchPlan(objectsCostMode, profileProvider)
			if (plan.dropdownPreferred <= 0 && plan.dropdownFallback <= 0) return
			const recent = new Set<string>()
			if (bucket) recent.add(bucket)
			for (const name of recentBuckets) {
				if (name) recent.add(name)
			}
			const preferredBuckets = recentBuckets
				.filter((name) => name && name !== bucket)
				.slice(0, plan.dropdownPreferred)
			const fallbackBuckets = bucketOptions
				.map((option) => option.value)
				.filter((name) => name && !recent.has(name))
				.slice(0, plan.dropdownFallback)
			for (const name of [...preferredBuckets, ...fallbackBuckets]) {
				void prefetchObjectsPage(name)
			}
		},
		[bucket, bucketOptions, objectsCostMode, prefetchObjectsPage, profileId, profileProvider, recentBuckets],
	)

	const prefetchQueueRef = useRef<string[]>([])
	const prefetchInFlightRef = useRef(0)
	const prefetchStartedRef = useRef(false)
	const prefetchGenerationRef = useRef(0)
	const lastPrefetchScopeKeyRef = useRef<string | null>(null)

	const pumpPrefetchQueue = useCallback(function pumpPrefetchQueueInternal(generation: number) {
		if (generation !== prefetchGenerationRef.current) return
		const maxConcurrent = 2
		if (prefetchInFlightRef.current >= maxConcurrent) return
		const next = prefetchQueueRef.current.shift()
		if (!next) return
		prefetchInFlightRef.current += 1
		void prefetchObjectsPage(next).finally(() => {
			if (generation !== prefetchGenerationRef.current) return
			prefetchInFlightRef.current = Math.max(0, prefetchInFlightRef.current - 1)
			pumpPrefetchQueueInternal(generation)
		})
	}, [prefetchObjectsPage])

	useEffect(() => {
		if (lastPrefetchScopeKeyRef.current === prefetchScopeKey) return
		lastPrefetchScopeKeyRef.current = prefetchScopeKey
		prefetchGenerationRef.current += 1
		prefetchQueueRef.current = []
		prefetchInFlightRef.current = 0
		prefetchStartedRef.current = false
	}, [prefetchScopeKey])

	useEffect(() => {
		if (prefetchStartedRef.current) return
		if (!profileId) return
		const plan = getBucketPrefetchPlan(objectsCostMode, profileProvider)
		if (plan.initial <= 0) return
		const names = bucketOptions.map((option) => option.value).filter(Boolean)
		if (names.length === 0) return
		prefetchStartedRef.current = true
		const queue = names.filter((name) => name !== bucket).slice(0, plan.initial)
		if (queue.length === 0) return
		prefetchQueueRef.current = queue
		const generation = prefetchGenerationRef.current
		const schedule = (cb: () => void): (() => void) => {
			const idleCallback = (window as typeof window & {
				requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
				cancelIdleCallback?: (handle: number) => void
			}).requestIdleCallback
			if (idleCallback) {
				const idleHandle = idleCallback(cb, { timeout: 1500 })
				return () => {
					;(window as typeof window & {
						cancelIdleCallback?: (handle: number) => void
					}).cancelIdleCallback?.(idleHandle)
				}
			}
			const timeoutId = window.setTimeout(cb, 300)
			return () => {
				window.clearTimeout(timeoutId)
			}
		}
		const cancelScheduledPrefetch = schedule(() => {
			if (generation !== prefetchGenerationRef.current) return
			pumpPrefetchQueue(generation)
		})
		return cancelScheduledPrefetch
	}, [bucket, bucketOptions, objectsCostMode, profileId, profileProvider, pumpPrefetchQueue])

	return { handleBucketDropdownVisibleChange }
}
