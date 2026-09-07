import '@testing-library/jest-dom/vitest'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import { useObjectsRename } from '../useObjectsRename'

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

describe('useObjectsRename', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		messageOpenMock.mockClear()
		messageErrorMock.mockClear()
	})

	it('ignores stale rename job responses after the dialog closes and reopens', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const pendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)

		const { result } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsRename({
					profileId: 'profile-1',
					apiToken,
					bucket: 'bucket-a',
					prefix: 'docs/',
					createJobWithRetry,
				}),
			{ initialProps: { apiToken: 'token-1' }, wrapper: Wrapper },
		)

		act(() => {
			result.current.openRenameObject('docs/a.txt')
		})

		await act(async () => {
			result.current.handleRenameSubmit({
				name: 'renamed.txt',
				confirm: 'RENAME',
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		act(() => {
			result.current.handleRenameCancel()
			result.current.openRenamePrefix('logs/')
		})

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(result.current.renameOpen).toBe(true)
		expect(result.current.renameKind).toBe('prefix')
		expect(result.current.renameSource).toBe('logs/')
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
		expect(messageOpenMock).not.toHaveBeenCalled()
	})

	it.each(
		(['object', 'prefix'] as const).flatMap((kind) =>
			(['profile', 'bucket', 'auth'] as const).map((change) => ({ kind, change })),
		),
	)('keeps a paused $kind rename in its original scope after a $change change', async ({ kind, change }) => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-original' })
		const nextCreateJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-next' })
		const initialProps = { profileId: 'profile-1', apiToken: 'token-1', bucket: 'bucket-a', prefix: 'docs/', createJobWithRetry }
		const { result, rerender, unmount } = renderHook((props) => useObjectsRename(props), { initialProps, wrapper: Wrapper })
		try {
			act(() => {
				if (kind === 'object') result.current.openRenameObject('docs/a.txt')
				else result.current.openRenamePrefix('docs/nested/')
			})
			onlineManager.setOnline(false)
			act(() => result.current.handleRenameSubmit({ name: 'renamed', confirm: 'RENAME' }))
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
			expect(result.current.renameSubmitting).toBe(false)
			onlineManager.setOnline(true)
			await waitFor(() => expect(mutation.state.status).toBe('success'))
			expect(nextCreateJobWithRetry).not.toHaveBeenCalled()
			expect(createJobWithRetry).toHaveBeenCalledExactlyOnceWith(kind === 'object' ? {
				type: 'transfer_move_object',
				payload: { srcBucket: 'bucket-a', srcKey: 'docs/a.txt', dstBucket: 'bucket-a', dstKey: 'docs/renamed', dryRun: false },
			} : {
				type: 'transfer_move_prefix',
				payload: { srcBucket: 'bucket-a', srcPrefix: 'docs/nested/', dstBucket: 'bucket-a', dstPrefix: 'docs/renamed/', include: [], exclude: [], dryRun: false },
			})
			expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
			expect(result.current.renameOpen).toBe(false)
			expect(messageOpenMock).not.toHaveBeenCalled()
		} finally {
			onlineManager.setOnline(true)
			unmount()
			queryClient.clear()
		}
	})

	it('ignores stale rename job responses after the api token changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const pendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsRename({
					profileId: 'profile-1',
					apiToken,
					bucket: 'bucket-a',
					prefix: 'docs/',
					createJobWithRetry,
				}),
			{ initialProps: { apiToken: 'token-1' }, wrapper: Wrapper },
		)

		act(() => {
			result.current.openRenameObject('docs/a.txt')
		})

		await act(async () => {
			result.current.handleRenameSubmit({
				name: 'renamed.txt',
				confirm: 'RENAME',
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(result.current.renameOpen).toBe(false)
		expect(result.current.renameSource).toBeNull()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
		expect(messageOpenMock).not.toHaveBeenCalled()
	})

	it('does not let an old-scope pending rename disable a newly opened rename dialog', async () => {
		const { Wrapper } = createWrapper()
		const oldPendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValueOnce(oldPendingJob.promise).mockResolvedValueOnce({ id: 'job-new' })

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsRename({
					profileId: 'profile-1',
					apiToken,
					bucket: 'bucket-a',
					prefix: 'docs/',
					createJobWithRetry,
				}),
			{ initialProps: { apiToken: 'token-1' }, wrapper: Wrapper },
		)

		act(() => {
			result.current.openRenameObject('docs/a.txt')
		})
		await act(async () => {
			result.current.handleRenameSubmit({
				name: 'renamed-a.txt',
				confirm: 'RENAME',
			})
		})
		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-2' })
		act(() => {
			result.current.openRenameObject('docs/b.txt')
		})

		expect(result.current.renameSubmitting).toBe(false)

		await act(async () => {
			result.current.handleRenameSubmit({
				name: 'renamed-b.txt',
				confirm: 'RENAME',
			})
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(2))
	})

	it('closes stale rename state after navigating to another prefix in the same bucket', async () => {
		const { Wrapper } = createWrapper()
		const oldPendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(oldPendingJob.promise)

		const { result, rerender } = renderHook(
			({ prefix }: { prefix: string }) =>
				useObjectsRename({
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix,
					createJobWithRetry,
				}),
			{ initialProps: { prefix: 'docs/' }, wrapper: Wrapper },
		)

		act(() => {
			result.current.openRenameObject('docs/a.txt')
		})
		await act(async () => {
			result.current.handleRenameSubmit({
				name: 'renamed-a.txt',
				confirm: 'RENAME',
			})
		})
		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ prefix: 'archive/' })

		expect(result.current.renameOpen).toBe(false)
		expect(result.current.renameSource).toBeNull()
		expect(result.current.renameSubmitting).toBe(false)

		await act(async () => {
			oldPendingJob.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(messageOpenMock).not.toHaveBeenCalled()
	})
})
