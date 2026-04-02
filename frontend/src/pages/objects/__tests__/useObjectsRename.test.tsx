import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
		expect(messageOpenMock).not.toHaveBeenCalled()
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
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['jobs', 'profile-1', 'token-1'], exact: false })
		expect(messageOpenMock).not.toHaveBeenCalled()
	})
})
