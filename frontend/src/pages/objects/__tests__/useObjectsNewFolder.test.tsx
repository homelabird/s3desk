import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useObjectsNewFolder } from '../useObjectsNewFolder'

const messageSuccessMock = vi.fn()
const messageWarningMock = vi.fn()
const messageErrorMock = vi.fn()
const invalidateObjectQueriesForPrefixMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			success: (...args: unknown[]) => messageSuccessMock(...args),
			warning: (...args: unknown[]) => messageWarningMock(...args),
			error: (...args: unknown[]) => messageErrorMock(...args),
		},
	}
})

vi.mock('../objectsQueryCache', async () => {
	const actual = await vi.importActual<typeof import('../objectsQueryCache')>('../objectsQueryCache')
	return {
		...actual,
		invalidateObjectQueriesForPrefix: (...args: unknown[]) => invalidateObjectQueriesForPrefixMock(...args),
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

	return { Wrapper }
}

describe('useObjectsNewFolder', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		messageSuccessMock.mockClear()
		messageWarningMock.mockClear()
		messageErrorMock.mockClear()
		invalidateObjectQueriesForPrefixMock.mockClear()
	})

	it('ignores stale create-folder responses after the dialog closes and reopens', async () => {
		const { Wrapper } = createWrapper()
		const createFolderRequest = deferred<void>()
		const createFolder = vi.fn().mockReturnValue(createFolderRequest.promise)
		const onOpenPrefix = vi.fn()
		const onClearSearch = vi.fn()
		const onDisableFavoritesOnly = vi.fn()
		const onShowFolders = vi.fn()
		const refreshTreeNode = vi.fn()

		const { result } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsNewFolder({
					api: {
						objects: {
							createFolder,
							listObjects: vi.fn(),
						},
					} as never,
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'docs/',
					typeFilter: 'all',
					favoritesOnly: false,
					searchText: '',
					onClearSearch,
					onDisableFavoritesOnly,
					onShowFolders,
					refreshTreeNode,
					onOpenPrefix,
				}),
			{ initialProps: { apiToken: 'token-1' }, wrapper: Wrapper },
		)

		act(() => {
			result.current.openNewFolder()
		})

		await act(async () => {
			result.current.handleNewFolderSubmit({ name: 'first', allowPath: false })
		})

		await waitFor(() =>
			expect(createFolder).toHaveBeenCalledWith({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				key: 'docs/first/',
			}),
		)

		act(() => {
			result.current.handleNewFolderCancel()
			result.current.openNewFolder('other/')
		})

		await act(async () => {
			createFolderRequest.resolve()
			await Promise.resolve()
		})

		expect(result.current.newFolderOpen).toBe(true)
		expect(result.current.newFolderParentPrefix).toBe('other/')
		expect(onOpenPrefix).not.toHaveBeenCalled()
		expect(refreshTreeNode).not.toHaveBeenCalled()
		expect(invalidateObjectQueriesForPrefixMock).not.toHaveBeenCalled()
		expect(messageSuccessMock).not.toHaveBeenCalled()
		expect(messageWarningMock).not.toHaveBeenCalled()
		expect(messageErrorMock).not.toHaveBeenCalled()
		expect(onClearSearch).not.toHaveBeenCalled()
		expect(onDisableFavoritesOnly).not.toHaveBeenCalled()
		expect(onShowFolders).not.toHaveBeenCalled()
	})

	it('ignores stale create-folder responses after the api token changes', async () => {
		const { Wrapper } = createWrapper()
		const createFolderRequest = deferred<void>()
		const createFolder = vi.fn().mockReturnValue(createFolderRequest.promise)
		const onOpenPrefix = vi.fn()
		const onClearSearch = vi.fn()
		const onDisableFavoritesOnly = vi.fn()
		const onShowFolders = vi.fn()
		const refreshTreeNode = vi.fn()

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsNewFolder({
					api: {
						objects: {
							createFolder,
							listObjects: vi.fn(),
						},
					} as never,
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'docs/',
					typeFilter: 'all',
					favoritesOnly: false,
					searchText: '',
					onClearSearch,
					onDisableFavoritesOnly,
					onShowFolders,
					refreshTreeNode,
					onOpenPrefix,
				}),
			{ initialProps: { apiToken: 'token-1' }, wrapper: Wrapper },
		)

		act(() => {
			result.current.openNewFolder()
		})

		await act(async () => {
			result.current.handleNewFolderSubmit({ name: 'first', allowPath: false })
		})

		await waitFor(() =>
			expect(createFolder).toHaveBeenCalledWith({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				key: 'docs/first/',
			}),
		)

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			createFolderRequest.resolve()
			await Promise.resolve()
		})

		expect(result.current.newFolderOpen).toBe(false)
		expect(result.current.newFolderParentPrefix).toBe('')
		expect(onOpenPrefix).not.toHaveBeenCalled()
		expect(refreshTreeNode).not.toHaveBeenCalled()
		expect(invalidateObjectQueriesForPrefixMock).not.toHaveBeenCalled()
		expect(messageSuccessMock).not.toHaveBeenCalled()
	})
})
