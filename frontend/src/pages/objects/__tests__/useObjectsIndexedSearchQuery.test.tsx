import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
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
