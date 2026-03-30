import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useObjectsCopyMove } from '../useObjectsCopyMove'

const messageSuccessMock = vi.fn()
const messageErrorMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			success: (...args: unknown[]) => messageSuccessMock(...args),
			error: (...args: unknown[]) => messageErrorMock(...args),
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
		return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
	}

	return { Wrapper, queryClient }
}

describe('useObjectsCopyMove', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		messageSuccessMock.mockClear()
		messageErrorMock.mockClear()
	})

	it('ignores stale object copy/move responses after the dialog closes and reopens', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const pendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

		const { result } = renderHook(
			() =>
				useObjectsCopyMove({
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'docs/',
					createJobWithRetry,
					splitLines: (value) => value.split('\n').filter(Boolean),
				}),
			{ wrapper: Wrapper },
		)

		act(() => {
			result.current.openCopyMove('move', 'docs/a.txt')
		})

		await act(async () => {
			result.current.handleCopyMoveSubmit({
				dstBucket: 'bucket-a',
				dstKey: 'archive/a.txt',
				dryRun: false,
				confirm: 'MOVE',
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		act(() => {
			result.current.handleCopyMoveCancel()
			result.current.openCopyMove('copy', 'docs/b.txt')
		})

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(result.current.copyMoveOpen).toBe(true)
		expect(result.current.copyMoveMode).toBe('copy')
		expect(result.current.copyMoveSrcKey).toBe('docs/b.txt')
		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
	})

	it('ignores stale prefix copy/move responses after the dialog closes and reopens', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const pendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

		const { result } = renderHook(
			() =>
				useObjectsCopyMove({
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: 'docs/',
					createJobWithRetry,
					splitLines: (value) => value.split('\n').filter(Boolean),
				}),
			{ wrapper: Wrapper },
		)

		act(() => {
			result.current.openCopyPrefix('move', 'logs/')
		})

		await act(async () => {
			result.current.handleCopyPrefixSubmit({
				dstBucket: 'bucket-a',
				dstPrefix: 'archive/',
				include: '',
				exclude: '',
				dryRun: false,
				confirm: 'MOVE',
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		act(() => {
			result.current.handleCopyPrefixCancel()
			result.current.openCopyPrefix('copy', 'images/')
		})

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(result.current.copyPrefixOpen).toBe(true)
		expect(result.current.copyPrefixMode).toBe('copy')
		expect(result.current.copyPrefixSrcPrefix).toBe('images/')
		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
	})

	it('ignores stale copy responses after the api token changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const pendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsCopyMove({
					profileId: 'profile-1',
					apiToken,
					bucket: 'bucket-a',
					prefix: 'docs/',
					createJobWithRetry,
					splitLines: (value) => value.split('\n').filter(Boolean),
				}),
			{ initialProps: { apiToken: 'token-1' }, wrapper: Wrapper },
		)

		act(() => {
			result.current.openCopyMove('copy', 'docs/a.txt')
		})

		await act(async () => {
			result.current.handleCopyMoveSubmit({
				dstBucket: 'bucket-a',
				dstKey: 'archive/a.txt',
				dryRun: false,
				confirm: '',
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(result.current.copyMoveOpen).toBe(false)
		expect(result.current.copyMoveSrcKey).toBeNull()
		expect(result.current.copyMoveValues).toEqual({
			dstBucket: '',
			dstKey: '',
			dryRun: false,
			confirm: '',
		})
		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
	})
})
