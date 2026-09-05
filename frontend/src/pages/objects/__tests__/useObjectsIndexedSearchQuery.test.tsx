import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ObjectsAPI } from '../../../api/clientContracts'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useObjectsIndexedSearchQuery } from '../useObjectsIndexedSearchQuery'

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	return function Wrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	}
}

describe('useObjectsIndexedSearchQuery', () => {
	it.each(['size', 'date'] as const)('blocks reversed %s ranges, including manual refetch, then recovers', async (kind) => {
		const searchObjectsIndex = vi.fn<ObjectsAPI['searchObjectsIndex']>().mockResolvedValue({ bucket: 'bucket-a', query: 'alpha', items: [], nextCursor: null })
		const args = {
			api: createMockApiClient({ objects: { searchObjectsIndex } }), apiToken: 'test-token', profileId: 'profile-1', bucket: 'bucket-a',
			globalSearchOpen: true, deferredGlobalSearch: 'alpha', globalSearchPrefix: 'docs/', globalSearchLimit: 100, globalSearchExt: 'txt',
			globalSearchMinSize: kind === 'size' ? 100 : null, globalSearchMaxSize: kind === 'size' ? 1 : null,
			globalSearchMinModifiedMs: kind === 'date' ? 2000 : null, globalSearchMaxModifiedMs: kind === 'date' ? 1000 : null,
		}
		const { result, rerender } = renderHook((props) => useObjectsIndexedSearchQuery(props), { initialProps: args, wrapper: createWrapper() })
		expect(result.current.indexedSearchQuery.fetchStatus).toBe('idle')
		await act(async () => { await result.current.indexedSearchQuery.refetch() })
		expect(searchObjectsIndex).not.toHaveBeenCalled()
		rerender({ ...args, globalSearchMaxSize: kind === 'size' ? 100 : null, globalSearchMaxModifiedMs: kind === 'date' ? 2000 : null })
		await waitFor(() => expect(searchObjectsIndex).toHaveBeenCalledOnce())
		expect(searchObjectsIndex).toHaveBeenCalledWith(expect.objectContaining({ q: 'alpha', prefix: 'docs/', ext: 'txt',
			minSize: kind === 'size' ? 100 : undefined, maxSize: kind === 'size' ? 100 : undefined,
			modifiedAfter: kind === 'date' ? new Date(2000).toISOString() : undefined,
			modifiedBefore: kind === 'date' ? new Date(2000).toISOString() : undefined,
		}))
	})

	it.each([[null, null], [100, null], [null, 100], [1, 100]])('keeps valid or open size bounds %s / %s unchanged', async (min, max) => {
		const searchObjectsIndex = vi.fn<ObjectsAPI['searchObjectsIndex']>().mockResolvedValue({ bucket: 'bucket-a', query: 'alpha', items: [], nextCursor: null })
		renderHook(() => useObjectsIndexedSearchQuery({
			api: createMockApiClient({ objects: { searchObjectsIndex } }), apiToken: 'test-token', profileId: 'profile-1', bucket: 'bucket-a',
			globalSearchOpen: true, deferredGlobalSearch: 'alpha', globalSearchPrefix: '', globalSearchLimit: 100, globalSearchExt: '',
			globalSearchMinSize: min, globalSearchMaxSize: max, globalSearchMinModifiedMs: null, globalSearchMaxModifiedMs: null,
		}), { wrapper: createWrapper() })
		await waitFor(() => expect(searchObjectsIndex).toHaveBeenCalledOnce())
		expect(searchObjectsIndex).toHaveBeenCalledWith(expect.objectContaining({ minSize: min ?? undefined, maxSize: max ?? undefined }))
	})

	it('aborts the discarded search when the query scope changes', async () => {
		const searchObjectsIndex = vi.fn<ObjectsAPI['searchObjectsIndex']>(() => new Promise<never>(() => undefined))
		const api = createMockApiClient({ objects: { searchObjectsIndex } })
		const wrapper = createWrapper()
		const { rerender } = renderHook(
			({ profileId, bucket, query }) =>
				useObjectsIndexedSearchQuery({
					api,
					apiToken: 'token-a',
					profileId,
					bucket,
					globalSearchOpen: true,
					deferredGlobalSearch: query,
					globalSearchPrefix: '',
					globalSearchLimit: 100,
					globalSearchExt: '',
					globalSearchMinSize: null,
					globalSearchMaxSize: null,
					globalSearchMinModifiedMs: null,
					globalSearchMaxModifiedMs: null,
				}),
			{
				initialProps: { profileId: 'profile-1', bucket: 'bucket-a', query: 'alpha' },
				wrapper,
			},
		)

		await waitFor(() => expect(searchObjectsIndex).toHaveBeenCalledTimes(1))
		const firstSignal = searchObjectsIndex.mock.calls[0]?.[0].signal

		rerender({ profileId: 'profile-2', bucket: 'bucket-b', query: 'beta' })

		await waitFor(() => expect(searchObjectsIndex).toHaveBeenCalledTimes(2))
		expect(firstSignal).toBeInstanceOf(AbortSignal)
		expect(firstSignal?.aborted).toBe(true)
		expect(searchObjectsIndex).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				profileId: 'profile-2',
				bucket: 'bucket-b',
				q: 'beta',
				cursor: undefined,
			}),
		)
	})
})
