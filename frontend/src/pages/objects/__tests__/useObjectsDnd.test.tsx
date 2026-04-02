import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { DragEvent as ReactDragEvent, PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useObjectsDnd } from '../useObjectsDnd'

const confirmDangerActionMock = vi.fn()
const messageOpenMock = vi.fn()
const messageErrorMock = vi.fn()
const messageWarningMock = vi.fn()
const messageInfoMock = vi.fn()

vi.mock('../../../lib/confirmDangerAction', () => ({
	confirmDangerAction: (options: { onConfirm: () => Promise<void> | void }) => confirmDangerActionMock(options),
}))

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			open: (...args: unknown[]) => messageOpenMock(...args),
			error: (...args: unknown[]) => messageErrorMock(...args),
			warning: (...args: unknown[]) => messageWarningMock(...args),
			info: (...args: unknown[]) => messageInfoMock(...args),
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

	function Wrapper(props: PropsWithChildren) {
		return (
			<MemoryRouter>
				<QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
			</MemoryRouter>
		)
	}

	return { queryClient, Wrapper }
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function buildDropEvent(payload: unknown) {
	const currentTarget = document.createElement('div')
	const dataTransfer = (() => {
		const store = new Map<string, string>()
		const dt = {
			dropEffect: 'move',
			effectAllowed: 'copyMove',
			files: [] as unknown as FileList,
			items: [] as unknown as DataTransferItemList,
			types: [] as string[],
			clearData: (format?: string) => {
				if (format) store.delete(format)
				else store.clear()
				dt.types = Array.from(store.keys())
			},
			getData: (format: string) => store.get(format) ?? '',
			setData: (format: string, data: string) => {
				store.set(format, data)
				dt.types = Array.from(store.keys())
			},
			setDragImage: vi.fn(),
		} as unknown as DataTransfer & { types: string[] }
		dt.setData('application/x-s3desk-dnd', JSON.stringify(payload))
		dt.setData('text/plain', JSON.stringify(payload))
		return dt as unknown as DataTransfer
	})()
	return {
		preventDefault: vi.fn(),
		stopPropagation: vi.fn(),
		currentTarget,
		relatedTarget: null,
		dataTransfer,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
	} as unknown as ReactDragEvent
}

describe('useObjectsDnd', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		confirmDangerActionMock.mockClear()
		messageOpenMock.mockClear()
		messageErrorMock.mockClear()
		messageWarningMock.mockClear()
		messageInfoMock.mockClear()
	})

	it('creates a move batch job when dropping selected objects onto a folder target', async () => {
		const { queryClient, Wrapper } = createWrapper()
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-1' })
		const setSelectedKeys = vi.fn()
		const setLastSelectedObjectKey = vi.fn()

		const { result } = renderHook(
			() =>
				useObjectsDnd({
					profileId: 'profile-1',
					apiToken: 'token-1',
					bucket: 'bucket-a',
					prefix: '',
					canDragDrop: true,
					isDesktop: true,
					selectedKeys: new Set(['alpha.txt', 'beta.txt']),
					setSelectedKeys,
					setLastSelectedObjectKey,
					createJobWithRetry,
					queryClient,
				}),
			{ wrapper: Wrapper },
		)

		const event = buildDropEvent({ kind: 'objects', bucket: 'bucket-a', keys: ['alpha.txt', 'beta.txt'] })

		await act(async () => {
			result.current.onDndTargetDrop(event, 'docs/')
		})

		expect(confirmDangerActionMock).toHaveBeenCalledTimes(1)
		const confirmOptions = confirmDangerActionMock.mock.lastCall?.[0] as { onConfirm: () => Promise<void> }

		await act(async () => {
			await confirmOptions.onConfirm()
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))
		expect(createJobWithRetry).toHaveBeenCalledWith({
			type: 'transfer_move_batch',
			payload: {
				srcBucket: 'bucket-a',
				dstBucket: 'bucket-a',
				items: [
					{ srcKey: 'alpha.txt', dstKey: 'docs/alpha.txt' },
					{ srcKey: 'beta.txt', dstKey: 'docs/beta.txt' },
				],
				dryRun: false,
			},
		})
		expect(messageOpenMock).toHaveBeenCalled()
	})

	it('ignores stale move confirmations after the objects context changes', async () => {
		const { queryClient, Wrapper } = createWrapper()
		const createJobWithRetry = vi.fn().mockResolvedValue({ id: 'job-1' })
		const setSelectedKeys = vi.fn()
		const setLastSelectedObjectKey = vi.fn()

		const { result, rerender } = renderHook(
			(props: { apiToken: string; profileId: string | null; bucket: string; prefix: string }) =>
				useObjectsDnd({
					profileId: props.profileId,
					apiToken: props.apiToken,
					bucket: props.bucket,
					prefix: props.prefix,
					canDragDrop: true,
					isDesktop: true,
					selectedKeys: new Set(['alpha.txt', 'beta.txt']),
					setSelectedKeys,
					setLastSelectedObjectKey,
					createJobWithRetry,
					queryClient,
				}),
			{
				initialProps: { apiToken: 'token-1', profileId: 'profile-1', bucket: 'bucket-a', prefix: '' },
				wrapper: Wrapper,
			},
		)

		const event = buildDropEvent({ kind: 'objects', bucket: 'bucket-a', keys: ['alpha.txt', 'beta.txt'] })

		await act(async () => {
			result.current.onDndTargetDrop(event, 'docs/')
		})

		expect(confirmDangerActionMock).toHaveBeenCalledTimes(1)
		const confirmOptions = confirmDangerActionMock.mock.lastCall?.[0] as { onConfirm: () => Promise<void> }

		await act(async () => {
			rerender({ apiToken: 'token-1', profileId: 'profile-2', bucket: 'bucket-b', prefix: 'archive/' })
		})

		await act(async () => {
			await confirmOptions.onConfirm()
		})

		expect(createJobWithRetry).not.toHaveBeenCalled()
		expect(messageOpenMock).not.toHaveBeenCalled()
	})

	it('ignores stale move job responses after the objects context changes', async () => {
		const { queryClient, Wrapper } = createWrapper()
		const deferred = createDeferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(deferred.promise)
		const setSelectedKeys = vi.fn()
		const setLastSelectedObjectKey = vi.fn()

		const { result, rerender } = renderHook(
			(props: { apiToken: string; profileId: string | null; bucket: string; prefix: string }) =>
				useObjectsDnd({
					profileId: props.profileId,
					apiToken: props.apiToken,
					bucket: props.bucket,
					prefix: props.prefix,
					canDragDrop: true,
					isDesktop: true,
					selectedKeys: new Set(['alpha.txt', 'beta.txt']),
					setSelectedKeys,
					setLastSelectedObjectKey,
					createJobWithRetry,
					queryClient,
				}),
			{
				initialProps: { apiToken: 'token-1', profileId: 'profile-1', bucket: 'bucket-a', prefix: '' },
				wrapper: Wrapper,
			},
		)

		const event = buildDropEvent({ kind: 'objects', bucket: 'bucket-a', keys: ['alpha.txt', 'beta.txt'] })

		await act(async () => {
			result.current.onDndTargetDrop(event, 'docs/')
		})

		expect(confirmDangerActionMock).toHaveBeenCalledTimes(1)
		const confirmOptions = confirmDangerActionMock.mock.lastCall?.[0] as { onConfirm: () => Promise<void> }

		await act(async () => {
			void confirmOptions.onConfirm()
			await Promise.resolve()
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-1', profileId: 'profile-2', bucket: 'bucket-b', prefix: 'archive/' })

		await act(async () => {
			deferred.resolve({ id: 'job-1' })
			await Promise.resolve()
		})

		expect(messageOpenMock).not.toHaveBeenCalled()
	})

	it('ignores stale move job responses after the api token changes', async () => {
		const { queryClient, Wrapper } = createWrapper()
		const deferred = createDeferred<{ id: string }>()
		const createJobWithRetry = vi.fn().mockReturnValue(deferred.promise)
		const setSelectedKeys = vi.fn()
		const setLastSelectedObjectKey = vi.fn()

		const { result, rerender } = renderHook(
			(props: { apiToken: string }) =>
				useObjectsDnd({
					profileId: 'profile-1',
					apiToken: props.apiToken,
					bucket: 'bucket-a',
					prefix: '',
					canDragDrop: true,
					isDesktop: true,
					selectedKeys: new Set(['alpha.txt', 'beta.txt']),
					setSelectedKeys,
					setLastSelectedObjectKey,
					createJobWithRetry,
					queryClient,
				}),
			{
				initialProps: { apiToken: 'token-1' },
				wrapper: Wrapper,
			},
		)

		const event = buildDropEvent({ kind: 'objects', bucket: 'bucket-a', keys: ['alpha.txt', 'beta.txt'] })

		await act(async () => {
			result.current.onDndTargetDrop(event, 'docs/')
		})

		const confirmOptions = confirmDangerActionMock.mock.lastCall?.[0] as { onConfirm: () => Promise<void> }

		await act(async () => {
			void confirmOptions.onConfirm()
			await Promise.resolve()
		})

		await waitFor(() => expect(createJobWithRetry).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			deferred.resolve({ id: 'job-1' })
			await Promise.resolve()
		})

		expect(messageOpenMock).not.toHaveBeenCalled()
	})
})
