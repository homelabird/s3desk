import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
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
	it.each(['profile', 'bucket', 'auth'] as const)('keeps a paused index job in its original scope after a %s change', async (change) => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-original' })
		const nextCreateJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-next' })
		const api = createMockApiClient()
		const initialProps = { profileId: 'profile-1', apiToken: 'token-1', bucket: 'bucket-a', prefix: 'docs/', createJobWithRetry }
		const { result, rerender, unmount } = renderHook((props) => useObjectsIndexing({
			...props, api, globalSearchOpen: false, globalSearchQueryText: '', globalSearchPrefixNormalized: '',
			objectsCostMode: 'aggressive', autoIndexEnabled: false, autoIndexTtlMs: 1000, autoIndexCooldownMs: 1000, setIndexPrefix: vi.fn(),
		}), { initialProps, wrapper: Wrapper })
		messageOpenMock.mockClear()
		try {
			onlineManager.setOnline(false)
			act(() => result.current.indexObjectsJobMutation.mutate({ prefix: 'docs/nested', fullReindex: true }))
			const mutation = queryClient.getMutationCache().getAll()[0]
			await waitFor(() => expect(mutation.state.isPaused).toBe(true))
			expect(createJobWithRetry).not.toHaveBeenCalled()
			rerender({
				...initialProps,
				profileId: change === 'profile' ? 'profile-2' : initialProps.profileId,
				apiToken: change === 'auth' ? 'token-2' : initialProps.apiToken,
				bucket: change === 'bucket' ? 'bucket-b' : initialProps.bucket,
				createJobWithRetry: change === 'bucket' ? createJobWithRetry : nextCreateJobWithRetry,
			})
			onlineManager.setOnline(true)
			await waitFor(() => expect(mutation.state.status).toBe('success'))
			expect(nextCreateJobWithRetry).not.toHaveBeenCalled()
			expect(createJobWithRetry).toHaveBeenCalledExactlyOnceWith({
				type: 's3_index_objects', payload: { bucket: 'bucket-a', prefix: 'docs/nested/', fullReindex: true },
			})
			expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
			expect(messageOpenMock).not.toHaveBeenCalled()
		} finally {
			onlineManager.setOnline(true)
			unmount()
			queryClient.clear()
			vi.restoreAllMocks()
		}
	})

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
					signal: expect.any(AbortSignal),
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

	it('does not repeat a fresh summary probe for the same location during cooldown', async () => {
		const deferred = createDeferred<{ indexedAt?: string }>()
		const getObjectIndexSummary = vi.fn().mockReturnValue(deferred.promise)
		const createJobWithRetry = vi.fn()
		const setIndexPrefix = vi.fn()
		const api = createMockApiClient({
			objects: {
				getObjectIndexSummary,
			},
		})
		const { Wrapper } = createWrapper()
		const { rerender } = renderHook(
			(props: { queryText: string; renderNonce: number }) => {
				void props.renderNonce
				return useObjectsIndexing({
					api,
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'reports/',
					globalSearchOpen: true,
					globalSearchQueryText: props.queryText,
					globalSearchPrefixNormalized: 'reports/',
					objectsCostMode: 'balanced',
					autoIndexEnabled: true,
					autoIndexTtlMs: 60_000,
					autoIndexCooldownMs: 300_000,
					setIndexPrefix,
					createJobWithRetry,
				})
			},
			{
				initialProps: { queryText: 'alpha', renderNonce: 0 },
				wrapper: Wrapper,
			},
		)

		await waitFor(() => expect(getObjectIndexSummary).toHaveBeenCalledTimes(1))
		rerender({ queryText: 'beta', renderNonce: 1 })
		await flushEffects()
		expect(getObjectIndexSummary).toHaveBeenCalledTimes(1)

		await act(async () => {
			deferred.resolve({ indexedAt: new Date().toISOString() })
			await deferred.promise
		})
		await flushEffects()

		rerender({ queryText: 'beta', renderNonce: 2 })
		await flushEffects()
		rerender({ queryText: '', renderNonce: 3 })
		await flushEffects()
		rerender({ queryText: 'gamma', renderNonce: 4 })
		await flushEffects()

		expect(getObjectIndexSummary).toHaveBeenCalledTimes(1)
		expect(createJobWithRetry).not.toHaveBeenCalled()
	})

	it('ignores stale async auto-index responses after the profile changes', async () => {
		const deferred = createDeferred<{
			bucket: string
			objectCount: number
			totalBytes: number
			sampleKeys: string[]
			indexedAt?: string
		}>()
		let summarySignal: AbortSignal | undefined
		const getObjectIndexSummary = vi.fn((args: { signal?: AbortSignal }) => {
			summarySignal = args.signal
			return deferred.promise
		})
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
					signal: expect.any(AbortSignal),
				})
			})

		rerender({ profileId: 'profile-2', bucket: 'bucket-b', globalSearchOpen: false })
		expect(summarySignal?.aborted).toBe(true)

		deferred.resolve({
			bucket: 'bucket-a',
			objectCount: 0,
			totalBytes: 0,
			sampleKeys: [],
			indexedAt: '2020-01-01T00:00:00Z',
		})
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
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
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
