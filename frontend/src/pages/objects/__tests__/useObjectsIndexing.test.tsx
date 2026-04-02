import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
import { useObjectsIndexing } from '../useObjectsIndexing'

const messageOpenMock = vi.fn()
const messageErrorMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			open: (...args: unknown[]) => messageOpenMock(...args),
			error: (...args: unknown[]) => messageErrorMock(...args),
		},
	}
})

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})

	function Wrapper({ children }: PropsWithChildren) {
		return (
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>{children}</MemoryRouter>
			</QueryClientProvider>
		)
	}

	return { queryClient, Wrapper }
}

function createDeferred<T>() {
	let resolve: (value: T) => void = () => {}
	let reject: (reason?: unknown) => void = () => {}
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

async function flushEffects() {
	await act(async () => {
		await Promise.resolve()
		await Promise.resolve()
	})
}

describe('useObjectsIndexing', () => {
	it('creates an auto-index job for stale prefixes', async () => {
		const getObjectIndexSummary = vi.fn().mockResolvedValue({ indexedAt: '2020-01-01T00:00:00Z' })
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-1' })
		const setIndexPrefix = vi.fn()
		const api = createMockApiClient({
			objects: {
				getObjectIndexSummary,
			},
		})

		const { Wrapper } = createWrapper()
		renderHook(
			() =>
				useObjectsIndexing({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'reports/',
					globalSearchOpen: true,
					globalSearchQueryText: 'alpha',
					globalSearchPrefixNormalized: 'reports/',
					objectsCostMode: 'aggressive',
					autoIndexEnabled: true,
					autoIndexTtlMs: 1,
					autoIndexCooldownMs: 0,
					setIndexPrefix,
					createJobWithRetry,
				}),
			{
				wrapper: Wrapper,
			},
		)

		await waitFor(() => {
			expect(getObjectIndexSummary).toHaveBeenCalledWith({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'reports/',
				sampleLimit: 1,
			})
		})

		await waitFor(() => {
			expect(createJobWithRetry).toHaveBeenCalledWith({
				type: 's3_index_objects',
				payload: {
					bucket: 'bucket-a',
					prefix: 'reports/',
					fullReindex: true,
				},
			})
		})
		expect(setIndexPrefix).toHaveBeenCalledWith('reports/')
	})

	it('ignores stale async auto-index responses after the profile changes', async () => {
		const deferred = createDeferred<{ indexedAt?: string }>()
		const getObjectIndexSummary = vi.fn().mockReturnValue(deferred.promise)
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-1' })
		const setIndexPrefix = vi.fn()
		const api = createMockApiClient({
			objects: {
				getObjectIndexSummary,
			},
		})

		const { Wrapper } = createWrapper()
		const { rerender } = renderHook(
			(props: { profileId: string | null; bucket: string; globalSearchOpen: boolean }) =>
				useObjectsIndexing({
					api,
					profileId: props.profileId,
					apiToken: 'token-1',
					bucket: props.bucket,
					prefix: 'reports/',
					globalSearchOpen: props.globalSearchOpen,
					globalSearchQueryText: 'alpha',
					globalSearchPrefixNormalized: 'reports/',
					objectsCostMode: 'aggressive',
					autoIndexEnabled: true,
					autoIndexTtlMs: 1,
					autoIndexCooldownMs: 0,
					setIndexPrefix,
					createJobWithRetry,
				}),
			{
				initialProps: { profileId: 'profile-1', bucket: 'bucket-a', globalSearchOpen: true },
				wrapper: Wrapper,
			},
		)

		await waitFor(() => {
			expect(getObjectIndexSummary).toHaveBeenCalledWith({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'reports/',
				sampleLimit: 1,
			})
		})

		rerender({ profileId: 'profile-2', bucket: 'bucket-b', globalSearchOpen: false })

		deferred.resolve({ indexedAt: '2020-01-01T00:00:00Z' })
		await flushEffects()

		expect(createJobWithRetry).not.toHaveBeenCalled()
		expect(setIndexPrefix).not.toHaveBeenCalled()
	})

	it('ignores stale manual index success responses after the profile changes', async () => {
		const createJobRequest = createDeferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(createJobRequest.promise)
		const setIndexPrefix = vi.fn()
		const api = createMockApiClient({
			objects: {
				getObjectIndexSummary: vi.fn(),
			},
		})
		const { Wrapper, queryClient } = createWrapper()
		const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

		const { result, rerender } = renderHook(
			(props: { profileId: string | null; bucket: string }) =>
				useObjectsIndexing({
					api,
					profileId: props.profileId,
					apiToken: 'token-1',
					bucket: props.bucket,
					prefix: 'reports/',
					globalSearchOpen: false,
					globalSearchQueryText: '',
					globalSearchPrefixNormalized: '',
					objectsCostMode: 'aggressive',
					autoIndexEnabled: true,
					autoIndexTtlMs: 1,
					autoIndexCooldownMs: 0,
					setIndexPrefix,
					createJobWithRetry,
				}),
			{
				initialProps: { profileId: 'profile-1', bucket: 'bucket-a' },
				wrapper: Wrapper,
			},
		)

		act(() => {
			result.current.indexObjectsJobMutation.mutate({ prefix: 'reports/', fullReindex: false })
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ profileId: 'profile-2', bucket: 'bucket-b' })

		await act(async () => {
			createJobRequest.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(messageOpenMock).not.toHaveBeenCalled()
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
	})

	it('ignores stale manual index failures after the profile changes', async () => {
		const createJobRequest = createDeferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(createJobRequest.promise)
		const setIndexPrefix = vi.fn()
		const api = createMockApiClient({
			objects: {
				getObjectIndexSummary: vi.fn(),
			},
		})
		const { Wrapper } = createWrapper()

		const { result, rerender } = renderHook(
			(props: { profileId: string | null; bucket: string }) =>
				useObjectsIndexing({
					api,
					profileId: props.profileId,
					apiToken: 'token-1',
					bucket: props.bucket,
					prefix: 'reports/',
					globalSearchOpen: false,
					globalSearchQueryText: '',
					globalSearchPrefixNormalized: '',
					objectsCostMode: 'aggressive',
					autoIndexEnabled: true,
					autoIndexTtlMs: 1,
					autoIndexCooldownMs: 0,
					setIndexPrefix,
					createJobWithRetry,
				}),
			{
				initialProps: { profileId: 'profile-1', bucket: 'bucket-a' },
				wrapper: Wrapper,
			},
		)

		act(() => {
			result.current.indexObjectsJobMutation.mutate({ prefix: 'reports/', fullReindex: false })
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ profileId: 'profile-2', bucket: 'bucket-b' })

		await act(async () => {
			createJobRequest.reject(new Error('stale index failure'))
			await Promise.resolve()
		})

		expect(messageErrorMock).not.toHaveBeenCalled()
	})
})
