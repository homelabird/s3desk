import type { QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useObjectsPrefetch } from '../useObjectsPrefetch'

const originalRequestIdleCallback = window.requestIdleCallback

function buildArgs(overrides: Partial<Parameters<typeof useObjectsPrefetch>[0]> = {}): Parameters<typeof useObjectsPrefetch>[0] {
	const queryClient = {
		getQueryState: vi.fn(),
		prefetchInfiniteQuery: vi.fn().mockResolvedValue(undefined),
	} as unknown as QueryClient
	const api = createMockApiClient({
		objects: {
			listObjects: vi.fn().mockResolvedValue({
				bucket: 'bucket-a',
				prefix: '',
				items: [],
				commonPrefixes: [],
				isTruncated: false,
			}),
		},
	})

	return {
		api,
		apiToken: 'token',
		profileId: 'profile-1',
		profileProvider: 'aws_s3',
		objectsCostMode: 'balanced',
		queryClient,
		bucket: 'bucket-a',
		recentBuckets: [],
		bucketOptions: [
			{ value: 'bucket-a' },
			{ value: 'bucket-b' },
			{ value: 'bucket-c' },
		],
		prefixByBucketRef: { current: {} },
		pageSize: 200,
		...overrides,
	}
}

describe('useObjectsPrefetch', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		Reflect.deleteProperty(window as typeof window & { requestIdleCallback?: typeof window.requestIdleCallback }, 'requestIdleCallback')
	})

	afterEach(() => {
		vi.useRealTimers()
		if (originalRequestIdleCallback) {
			window.requestIdleCallback = originalRequestIdleCallback
			return
		}
		Reflect.deleteProperty(window as typeof window & { requestIdleCallback?: typeof window.requestIdleCallback }, 'requestIdleCallback')
	})

	it('skips initial background bucket prefetch for OCI native profiles', async () => {
		const args = buildArgs({ profileProvider: 'oci_object_storage' })

		renderHook(() => useObjectsPrefetch(args))
		await vi.runAllTimersAsync()

		expect(args.queryClient.prefetchInfiniteQuery).not.toHaveBeenCalled()
	})

	it('skips initial background bucket prefetch in balanced mode', async () => {
		const args = buildArgs()

		renderHook(() => useObjectsPrefetch(args))
		await vi.runAllTimersAsync()

		expect(args.queryClient.prefetchInfiniteQuery).not.toHaveBeenCalled()
	})

	it('keeps balanced bucket-dropdown prefetch intent-driven', async () => {
		const args = buildArgs({ recentBuckets: ['bucket-c'] })
		const { result } = renderHook(() => useObjectsPrefetch(args))

		await act(async () => {
			result.current.handleBucketDropdownVisibleChange(true)
		})

		const prefetchQueryKeys = vi
			.mocked(args.queryClient.prefetchInfiniteQuery)
			.mock.calls.map((call) => call[0]?.queryKey)
		expect(prefetchQueryKeys).toEqual([
			queryKeys.objects.list('profile-1', 'bucket-c', '', 'token'),
			queryKeys.objects.list('profile-1', 'bucket-b', '', 'token'),
		])
	})

	it('limits OCI bucket dropdown prefetch to one recent bucket and skips fallback buckets', async () => {
		const args = buildArgs({
			profileProvider: 'oci_object_storage',
			bucket: 'bucket-a',
			recentBuckets: ['bucket-c', 'bucket-b', 'bucket-d'],
			bucketOptions: [{ value: 'bucket-a' }, { value: 'bucket-b' }, { value: 'bucket-c' }, { value: 'bucket-d' }],
		})

		const { result } = renderHook(() => useObjectsPrefetch(args))

		await act(async () => {
			result.current.handleBucketDropdownVisibleChange(true)
		})

		expect(args.queryClient.prefetchInfiniteQuery).toHaveBeenCalledTimes(1)
		const call = vi.mocked(args.queryClient.prefetchInfiniteQuery).mock.calls[0]?.[0]
		expect(call?.queryKey).toEqual(queryKeys.objects.list('profile-1', 'bucket-c', '', 'token'))
	})

	it('restarts initial background prefetch after the session scope changes', async () => {
		const args = buildArgs({ objectsCostMode: 'aggressive' })
		const { rerender } = renderHook(
			(props: Parameters<typeof useObjectsPrefetch>[0]) => useObjectsPrefetch(props),
			{ initialProps: args },
		)

		await vi.runAllTimersAsync()
		rerender({ ...args, profileId: 'profile-2', apiToken: 'token-2' })
		await vi.runAllTimersAsync()

		const prefetchQueryKeys = vi
			.mocked(args.queryClient.prefetchInfiniteQuery)
			.mock.calls.map((call) => call[0]?.queryKey)

		expect(prefetchQueryKeys).toContainEqual(queryKeys.objects.list('profile-1', 'bucket-b', '', 'token'))
		expect(prefetchQueryKeys).toContainEqual(queryKeys.objects.list('profile-2', 'bucket-b', '', 'token-2'))
	})

	it('drops scheduled initial prefetch work from stale session scopes before it starts', async () => {
		const args = buildArgs({ objectsCostMode: 'aggressive' })
		const { rerender } = renderHook(
			(props: Parameters<typeof useObjectsPrefetch>[0]) => useObjectsPrefetch(props),
			{ initialProps: args },
		)

		rerender({ ...args, profileId: 'profile-2', apiToken: 'token-2' })
		await vi.runAllTimersAsync()

		const prefetchQueryKeys = vi
			.mocked(args.queryClient.prefetchInfiniteQuery)
			.mock.calls.map((call) => call[0]?.queryKey)

		expect(prefetchQueryKeys).not.toContainEqual(queryKeys.objects.list('profile-1', 'bucket-b', '', 'token'))
		expect(prefetchQueryKeys).toContainEqual(queryKeys.objects.list('profile-2', 'bucket-b', '', 'token-2'))
	})

	it('drops queued background prefetch work after unmount', async () => {
		let releaseFirstRequest!: () => void
		const firstRequest = new Promise<void>((resolve) => {
			releaseFirstRequest = resolve
		})
		const args = buildArgs({ objectsCostMode: 'aggressive' })
		let firstRequestSignal: AbortSignal | undefined
		vi.mocked(args.api.objects.listObjects).mockImplementationOnce(async ({ signal }) => {
			firstRequestSignal = signal
			await firstRequest
			return {
				bucket: 'bucket-b',
				prefix: '',
				delimiter: '/',
				items: [],
				commonPrefixes: [],
				isTruncated: false,
			}
		})
		const queryController = new AbortController()
		vi.mocked(args.queryClient.prefetchInfiniteQuery).mockImplementationOnce(async (options) => {
			if (typeof options.queryFn !== 'function') throw new Error('queryFn is required')
			await options.queryFn({
				client: args.queryClient,
				queryKey: options.queryKey,
				pageParam: undefined,
				direction: 'forward',
				meta: undefined,
				signal: queryController.signal,
			} as never)
		})
		const { unmount } = renderHook(() => useObjectsPrefetch(args), { wrapper: StrictMode })

		await vi.advanceTimersByTimeAsync(300)
		expect(args.queryClient.prefetchInfiniteQuery).toHaveBeenCalledTimes(1)
		expect(firstRequestSignal?.aborted).toBe(false)

		unmount()
		expect(firstRequestSignal?.aborted).toBe(true)
		expect(queryController.signal.aborted).toBe(false)
		await act(async () => {
			releaseFirstRequest()
			await firstRequest
		})

		expect(args.queryClient.prefetchInfiniteQuery).toHaveBeenCalledTimes(1)
	})
})
