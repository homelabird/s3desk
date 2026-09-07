import '@testing-library/jest-dom/vitest'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import { useObjectsClipboard } from '../useObjectsClipboard'

const confirmDangerActionMock = vi.fn()
const copyToClipboardMock = vi.fn()
const messageOpenMock = vi.fn()
const messageSuccessMock = vi.fn()
const messageWarningMock = vi.fn()
const messageInfoMock = vi.fn()
const messageErrorMock = vi.fn()

vi.mock('../../../lib/confirmDangerAction', () => ({
	confirmDangerAction: (options: unknown) => confirmDangerActionMock(options),
}))

vi.mock('../../../lib/clipboard', () => ({
	copyToClipboard: (...args: unknown[]) => copyToClipboardMock(...args),
	clipboardFailureHint: () => 'clipboard-failed',
}))

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			open: (...args: unknown[]) => messageOpenMock(...args),
			success: (...args: unknown[]) => messageSuccessMock(...args),
			warning: (...args: unknown[]) => messageWarningMock(...args),
			info: (...args: unknown[]) => messageInfoMock(...args),
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

describe('useObjectsClipboard', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		confirmDangerActionMock.mockClear()
		copyToClipboardMock.mockReset()
		messageOpenMock.mockClear()
		messageSuccessMock.mockClear()
		messageWarningMock.mockClear()
		messageInfoMock.mockClear()
		messageErrorMock.mockClear()
	})

	it.each(
		(['copy', 'move'] as const).flatMap((mode) => (['profile', 'auth'] as const).map((change) => ({ mode, change }))),
	)('keeps a confirmed paused $mode paste in its original scope after a $change change', async ({ mode, change }) => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-original' })
		const nextCreateJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-next' })
		copyToClipboardMock.mockResolvedValue({ ok: true })
		const initialProps = {
			profileId: 'profile-1', apiToken: 'token-1', bucket: 'bucket-a', prefix: 'docs/',
			selectedKeys: new Set(['docs/nested/a.txt']), createJobWithRetry, queryClient,
		}
		const { result, rerender, unmount } = renderHook((props) => useObjectsClipboard(props), { initialProps, wrapper: Wrapper })
		try {
			await act(async () => { await result.current.copySelectionToClipboard(mode) })
			rerender({ ...initialProps, prefix: 'archive/' })
			onlineManager.setOnline(false)
			if (mode === 'move') {
				await act(async () => { await result.current.pasteClipboardObjects() })
				const confirm = confirmDangerActionMock.mock.calls.at(-1)?.[0] as { onConfirm: () => Promise<void> }
				act(() => { void confirm.onConfirm() })
			} else {
				act(() => { void result.current.pasteClipboardObjects() })
			}
			const mutation = queryClient.getMutationCache().getAll()[0]
			await waitFor(() => expect(mutation.state.isPaused).toBe(true))
			expect(createJobWithRetry).not.toHaveBeenCalled()
			rerender({
				...initialProps, prefix: 'archive/', createJobWithRetry: nextCreateJobWithRetry,
				profileId: change === 'profile' ? 'profile-2' : initialProps.profileId,
				apiToken: change === 'auth' ? 'token-2' : initialProps.apiToken,
			})
			onlineManager.setOnline(true)
			await waitFor(() => expect(mutation.state.status).toBe('success'))
			expect(nextCreateJobWithRetry).not.toHaveBeenCalled()
			expect(createJobWithRetry).toHaveBeenCalledExactlyOnceWith({
				type: `transfer_${mode}_batch`,
				payload: { srcBucket: 'bucket-a', dstBucket: 'bucket-a', items: [{ srcKey: 'docs/nested/a.txt', dstKey: 'archive/nested/a.txt' }], dryRun: false },
			})
			expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
			expect(messageOpenMock).not.toHaveBeenCalled()
			if (change === 'profile') expect(result.current.clipboardObjects?.keys).toEqual(['docs/nested/a.txt'])
		} finally {
			onlineManager.setOnline(true)
			unmount()
			queryClient.clear()
		}
	})

	it('ignores stale move-paste confirmations after the objects context changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const createJobWithRetry = vi.fn()
		copyToClipboardMock.mockResolvedValue({ ok: true })

		const { result, rerender } = renderHook(
			({ apiToken, profileId, bucket, prefix, selectedKeys }) =>
				useObjectsClipboard({
					profileId,
					apiToken,
					bucket,
					prefix,
					selectedKeys,
					createJobWithRetry,
					queryClient,
				}),
			{
				initialProps: {
					apiToken: 'token-1',
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'archive/',
					selectedKeys: new Set(['logs/a.txt']),
				},
				wrapper: Wrapper,
			},
		)

		await act(async () => {
			await result.current.copySelectionToClipboard('move')
		})

		messageSuccessMock.mockClear()

		await act(async () => {
			await result.current.pasteClipboardObjects()
		})

		const confirmCall = confirmDangerActionMock.mock.calls.at(-1)?.[0] as { onConfirm: () => Promise<void> | void } | undefined
		expect(confirmCall).toBeDefined()

		rerender({
			apiToken: 'token-1',
			profileId: 'profile-2',
			bucket: 'bucket-b',
			prefix: 'archive/',
			selectedKeys: new Set(['archive/b.txt']),
		})

		await act(async () => {
			await confirmCall?.onConfirm()
		})

		expect(createJobWithRetry).not.toHaveBeenCalled()
		expect(messageOpenMock).not.toHaveBeenCalled()
	})

	it('ignores stale move-paste responses after the objects context changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const pendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)
		copyToClipboardMock.mockResolvedValue({ ok: true })

		const { result, rerender } = renderHook(
			({ apiToken, profileId, bucket, prefix, selectedKeys }) =>
				useObjectsClipboard({
					profileId,
					apiToken,
					bucket,
					prefix,
					selectedKeys,
					createJobWithRetry,
					queryClient,
				}),
			{
				initialProps: {
					apiToken: 'token-1',
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'archive/',
					selectedKeys: new Set(['logs/a.txt']),
				},
				wrapper: Wrapper,
			},
		)

		await act(async () => {
			await result.current.copySelectionToClipboard('move')
		})

		await act(async () => {
			await result.current.pasteClipboardObjects()
		})

		const confirmCall = confirmDangerActionMock.mock.calls.at(-1)?.[0] as { onConfirm: () => Promise<void> | void } | undefined
		expect(confirmCall).toBeDefined()

		await act(async () => {
			void confirmCall?.onConfirm()
			await Promise.resolve()
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({
			apiToken: 'token-1',
			profileId: 'profile-2',
			bucket: 'bucket-b',
			prefix: 'archive/',
			selectedKeys: new Set(['archive/b.txt']),
		})

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(result.current.clipboardObjects).not.toBeNull()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
		expect(messageOpenMock).not.toHaveBeenCalled()
	})

	it('ignores stale move-paste responses after the api token changes', async () => {
		const { Wrapper, queryClient } = createWrapper()
		const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
		const pendingJob = deferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(pendingJob.promise)
		copyToClipboardMock.mockResolvedValue({ ok: true })

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsClipboard({
					profileId: 'profile-1',
					apiToken,
					bucket: 'bucket-a',
					prefix: 'archive/',
					selectedKeys: new Set(['logs/a.txt']),
					createJobWithRetry,
					queryClient,
				}),
			{
				initialProps: { apiToken: 'token-1' },
				wrapper: Wrapper,
			},
		)

		await act(async () => {
			await result.current.copySelectionToClipboard('move')
		})

		await act(async () => {
			await result.current.pasteClipboardObjects()
		})

		const confirmCall = confirmDangerActionMock.mock.calls.at(-1)?.[0] as { onConfirm: () => Promise<void> | void } | undefined
		expect(confirmCall).toBeDefined()

		await act(async () => {
			void confirmCall?.onConfirm()
			await Promise.resolve()
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			pendingJob.resolve({ id: 'job-stale' })
			await Promise.resolve()
		})

		expect(result.current.clipboardObjects).toBeNull()
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-1'), exact: false })
		expect(messageOpenMock).not.toHaveBeenCalled()
	})
})
