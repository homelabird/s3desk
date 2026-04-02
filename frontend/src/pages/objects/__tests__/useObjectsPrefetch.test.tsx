import type { QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

	it('keeps initial background bucket prefetch for non-OCI profiles', async () => {
		const args = buildArgs()

		renderHook(() => useObjectsPrefetch(args))
		await vi.runAllTimersAsync()

		expect(args.queryClient.prefetchInfiniteQuery).toHaveBeenCalled()
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
		expect(call?.queryKey).toEqual(['objects', 'profile-1', 'bucket-c', '', 'token'])
	})

	it('restarts initial background prefetch after the session scope changes', async () => {
		const args = buildArgs()
		const { rerender } = renderHook(
			(props: Parameters<typeof useObjectsPrefetch>[0]) => useObjectsPrefetch(props),
			{ initialProps: args },
		)

		await vi.runAllTimersAsync()
		rerender({ ...args, profileId: 'profile-2', apiToken: 'token-2' })
		await vi.runAllTimersAsync()

		const queryKeys = vi
			.mocked(args.queryClient.prefetchInfiniteQuery)
			.mock.calls.map((call) => call[0]?.queryKey)

		expect(queryKeys).toContainEqual(['objects', 'profile-1', 'bucket-b', '', 'token'])
		expect(queryKeys).toContainEqual(['objects', 'profile-2', 'bucket-b', '', 'token-2'])
	})

	it('drops scheduled initial prefetch work from stale session scopes before it starts', async () => {
		const args = buildArgs()
		const { rerender } = renderHook(
			(props: Parameters<typeof useObjectsPrefetch>[0]) => useObjectsPrefetch(props),
			{ initialProps: args },
		)

		rerender({ ...args, profileId: 'profile-2', apiToken: 'token-2' })
		await vi.runAllTimersAsync()

		const queryKeys = vi
			.mocked(args.queryClient.prefetchInfiniteQuery)
			.mock.calls.map((call) => call[0]?.queryKey)

		expect(queryKeys).not.toContainEqual(['objects', 'profile-1', 'bucket-b', '', 'token'])
		expect(queryKeys).toContainEqual(['objects', 'profile-2', 'bucket-b', '', 'token-2'])
	})
})
