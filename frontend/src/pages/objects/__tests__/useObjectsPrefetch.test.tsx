import type { QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { APIClient } from '../../../api/client'
import { useObjectsPrefetch } from '../useObjectsPrefetch'

function buildArgs(overrides: Partial<Parameters<typeof useObjectsPrefetch>[0]> = {}): Parameters<typeof useObjectsPrefetch>[0] {
	const queryClient = {
		getQueryState: vi.fn(),
		prefetchInfiniteQuery: vi.fn().mockResolvedValue(undefined),
	} as unknown as QueryClient
	const api = {
		listObjects: vi.fn().mockResolvedValue({
			bucket: 'bucket-a',
			prefix: '',
			items: [],
			commonPrefixes: [],
			isTruncated: false,
		}),
	} as unknown as APIClient

	return {
		api,
		apiToken: 'token',
		profileId: 'profile-1',
		profileProvider: 's3_compatible',
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
	})

	afterEach(() => {
		vi.useRealTimers()
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
})
