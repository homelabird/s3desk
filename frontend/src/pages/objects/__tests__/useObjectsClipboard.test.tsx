import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
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
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
		expect(messageOpenMock).not.toHaveBeenCalled()
	})
})
