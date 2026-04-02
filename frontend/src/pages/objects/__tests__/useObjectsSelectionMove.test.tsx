import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useObjectsSelectionMove } from '../useObjectsSelectionMove'

const messageOpenMock = vi.fn()
const messageErrorMock = vi.fn()
const messageInfoMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			open: (...args: unknown[]) => messageOpenMock(...args),
			error: (...args: unknown[]) => messageErrorMock(...args),
			info: (...args: unknown[]) => messageInfoMock(...args),
		},
	}
})

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})

	function Wrapper(props: PropsWithChildren) {
		return (
			<MemoryRouter>
				<QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
			</MemoryRouter>
		)
	}

	return { Wrapper, queryClient }
}

describe('useObjectsSelectionMove', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		messageOpenMock.mockClear()
		messageErrorMock.mockClear()
		messageInfoMock.mockClear()
	})

	it('creates a move batch job for the selected keys', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-1' })
		const setSelectedKeys = vi.fn()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

		const { result } = renderHook(
			() =>
				useObjectsSelectionMove({
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'docs/',
					selectedKeys: new Set(['docs/a.txt', 'docs/nested/b.txt']),
					createJobWithRetry,
					setSelectedKeys,
				}),
			{ wrapper: Wrapper },
		)

		await act(async () => {
			result.current.openMoveSelection()
			result.current.setMoveSelectionValues({
				dstBucket: 'bucket-a',
				dstPrefix: 'archive/',
				confirm: 'MOVE',
			})
		})

		await act(async () => {
			result.current.handleMoveSelectionSubmit({
				dstBucket: 'bucket-a',
				dstPrefix: 'archive/',
				confirm: 'MOVE',
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))
		expect(createJobWithRetry).toHaveBeenCalledWith({
			type: 'transfer_move_batch',
			payload: {
				srcBucket: 'bucket-a',
				dstBucket: 'bucket-a',
				items: [
					{ srcKey: 'docs/a.txt', dstKey: 'archive/a.txt' },
					{ srcKey: 'docs/nested/b.txt', dstKey: 'archive/nested/b.txt' },
				],
				dryRun: false,
			},
		})
		expect(setSelectedKeys).toHaveBeenCalledWith(new Set())
		expect(messageOpenMock).toHaveBeenCalled()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
	})

	it('preserves the full key path when moving from the root prefix', async () => {
		const { Wrapper } = createWrapper()
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-root' })
		const setSelectedKeys = vi.fn()

		const { result } = renderHook(
			() =>
				useObjectsSelectionMove({
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: '',
					selectedKeys: new Set(['notes/todo.txt']),
					createJobWithRetry,
					setSelectedKeys,
				}),
			{ wrapper: Wrapper },
		)

		await act(async () => {
			result.current.openMoveSelection()
		})

		await act(async () => {
			result.current.handleMoveSelectionSubmit({
				dstBucket: 'bucket-a',
				dstPrefix: 'archive/mobile/',
				confirm: 'MOVE',
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))
		expect(createJobWithRetry).toHaveBeenCalledWith({
			type: 'transfer_move_batch',
			payload: {
				srcBucket: 'bucket-a',
				dstBucket: 'bucket-a',
				items: [{ srcKey: 'notes/todo.txt', dstKey: 'archive/mobile/notes/todo.txt' }],
				dryRun: false,
			},
		})
	})

	it('ignores stale move job responses after the dialog closes and reopens', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const pendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)
		const setSelectedKeys = vi.fn()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

		const { result } = renderHook(
			() =>
				useObjectsSelectionMove({
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'docs/',
					selectedKeys: new Set(['docs/a.txt']),
					createJobWithRetry,
					setSelectedKeys,
				}),
			{ wrapper: Wrapper },
		)

		await act(async () => {
			result.current.openMoveSelection()
		})

		await act(async () => {
			result.current.handleMoveSelectionSubmit({
				dstBucket: 'bucket-a',
				dstPrefix: 'archive/',
				confirm: 'MOVE',
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		act(() => {
			result.current.handleMoveSelectionCancel()
			result.current.openMoveSelection()
			result.current.setMoveSelectionValues({
				dstBucket: 'bucket-a',
				dstPrefix: 'current/',
				confirm: '',
			})
		})

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(result.current.moveSelectionOpen).toBe(true)
		expect(result.current.moveSelectionValues).toEqual({
			dstBucket: 'bucket-a',
			dstPrefix: 'current/',
			confirm: '',
		})
		expect(setSelectedKeys).not.toHaveBeenCalled()
		expect(messageOpenMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
	})

	it('ignores stale move job responses after the api token changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const pendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)
		const setSelectedKeys = vi.fn()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsSelectionMove({
					profileId: 'profile-1',
					apiToken,
					bucket: 'bucket-a',
					prefix: 'docs/',
					selectedKeys: new Set(['docs/a.txt']),
					createJobWithRetry,
					setSelectedKeys,
				}),
			{ initialProps: { apiToken: 'token-1' }, wrapper: Wrapper },
		)

		await act(async () => {
			result.current.openMoveSelection()
		})

		await act(async () => {
			result.current.handleMoveSelectionSubmit({
				dstBucket: 'bucket-a',
				dstPrefix: 'archive/',
				confirm: 'MOVE',
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(result.current.moveSelectionOpen).toBe(false)
		expect(result.current.moveSelectionValues).toEqual({
			dstBucket: '',
			dstPrefix: '',
			confirm: '',
		})
		expect(setSelectedKeys).not.toHaveBeenCalled()
		expect(messageOpenMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
	})
})
