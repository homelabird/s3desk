import '@testing-library/jest-dom/vitest'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
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

	return { Wrapper, queryClient }
}

describe('useObjectsNewFolder', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		messageSuccessMock.mockClear()
		messageWarningMock.mockClear()
		messageErrorMock.mockClear()
		invalidateObjectQueriesForPrefixMock.mockClear()
	})

	it.each(['profile', 'bucket', 'auth', 'parent'] as const)('keeps a paused folder creation in its original scope after a %s change', async (change) => {
		const { Wrapper, queryClient } = createWrapper()
		const api = createMockApiClient({ objects: { createFolder: vi.fn().mockResolvedValue(undefined) } })
		const nextApi = createMockApiClient({ objects: { createFolder: vi.fn().mockResolvedValue(undefined) } })
		const refreshTreeNode = vi.fn()
		const initialProps = { api, profileId: 'profile-1', apiToken: 'token-1', bucket: 'bucket-a', prefix: 'docs/' }
		const { result, rerender, unmount } = renderHook((props) => useObjectsNewFolder({
			...props, typeFilter: 'all', favoritesOnly: false, searchText: '', refreshTreeNode,
			onClearSearch: vi.fn(), onDisableFavoritesOnly: vi.fn(), onShowFolders: vi.fn(), onOpenPrefix: vi.fn(),
		}), { initialProps, wrapper: Wrapper })
		try {
			act(() => result.current.openNewFolder())
			onlineManager.setOnline(false)
			act(() => result.current.handleNewFolderSubmit({ name: 'child', allowPath: false }))
			const mutation = queryClient.getMutationCache().getAll()[0]
			await waitFor(() => expect(mutation.state.context).toBeDefined())
			expect(mutation.state.isPaused).toBe(true)
			expect(api.objects.createFolder).not.toHaveBeenCalled()
			if (change === 'parent') {
				act(() => {
					result.current.handleNewFolderCancel()
					result.current.openNewFolder('other/')
				})
			} else {
				rerender({
					...initialProps,
					profileId: change === 'profile' ? 'profile-2' : initialProps.profileId,
					apiToken: change === 'auth' ? 'token-2' : initialProps.apiToken,
					bucket: change === 'bucket' ? 'bucket-b' : initialProps.bucket,
					api: change === 'bucket' ? api : nextApi,
				})
			}
			expect(result.current.newFolderSubmitting).toBe(false)
			onlineManager.setOnline(true)
			await waitFor(() => expect(mutation.state.status).toBe('success'))
			expect(nextApi.objects.createFolder).not.toHaveBeenCalled()
			expect(api.objects.createFolder).toHaveBeenCalledExactlyOnceWith({ profileId: 'profile-1', bucket: 'bucket-a', key: 'docs/child/' })
			expect(refreshTreeNode).not.toHaveBeenCalled()
			expect(messageSuccessMock).not.toHaveBeenCalled()
			if (change === 'parent') expect(result.current.newFolderParentPrefix).toBe('other/')
		} finally {
			onlineManager.setOnline(true)
			unmount()
			queryClient.clear()
		}
	})

	it.each(['success', 'validation', 'provider', 'partial'] as const)('reports %s when the parent is outside the current list and no optimistic snapshot is made', async (outcome) => {
		const { Wrapper, queryClient } = createWrapper()
		const createFolder = vi.fn().mockResolvedValue(undefined)
		if (outcome === 'provider') createFolder.mockRejectedValue(new Error('folder denied'))
		if (outcome === 'partial') createFolder.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('folder denied'))
		const api = createMockApiClient({ objects: { createFolder } })
		const refreshTreeNode = vi.fn()
		const { result, unmount } = renderHook(() => useObjectsNewFolder({
			api, profileId: 'profile-1', apiToken: 'token-1', bucket: 'bucket-a', prefix: 'docs/',
			typeFilter: 'all', favoritesOnly: false, searchText: '', refreshTreeNode,
			onClearSearch: vi.fn(), onDisableFavoritesOnly: vi.fn(), onShowFolders: vi.fn(), onOpenPrefix: vi.fn(),
		}), { wrapper: Wrapper })
		try {
			act(() => result.current.openNewFolder('other/'))
			await act(async () => {
				result.current.handleNewFolderSubmit({
					name: outcome === 'validation' ? '../bad' : outcome === 'partial' ? 'one/two' : 'child', allowPath: true,
				})
				await vi.dynamicImportSettled()
			})
			const mutation = queryClient.getMutationCache().getAll()[0]
			await waitFor(() => expect(mutation.state.status).toBe(outcome === 'success' ? 'success' : 'error'))
			if (outcome === 'success') {
				expect(createFolder).toHaveBeenCalledExactlyOnceWith({ profileId: 'profile-1', bucket: 'bucket-a', key: 'other/child/' })
				expect(refreshTreeNode).toHaveBeenCalledExactlyOnceWith('other/')
				expect(messageSuccessMock).toHaveBeenCalledOnce()
				expect(result.current.newFolderOpen).toBe(false)
			} else {
				expect(result.current.newFolderError).toContain(outcome === 'validation' ? 'invalid folder name' : 'folder denied')
				expect(result.current.newFolderPartialKey).toBe(outcome === 'partial' ? 'other/one/' : null)
				expect(result.current.newFolderOpen).toBe(true)
				if (outcome === 'validation') expect(createFolder).not.toHaveBeenCalled()
			}
			expect(result.current.newFolderSubmitting).toBe(false)
		} finally {
			unmount()
			queryClient.clear()
		}
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

	it('does not let an old-scope pending create disable a newly opened folder dialog', async () => {
		const { Wrapper } = createWrapper()
		const oldCreateFolderRequest = deferred<void>()
		const createFolder = vi.fn().mockReturnValueOnce(oldCreateFolderRequest.promise).mockResolvedValueOnce(undefined)

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsNewFolder({
					api: {
						objects: {
							createFolder,
							listObjects: vi.fn().mockResolvedValue({ commonPrefixes: ['docs/second/'] }),
						},
					} as never,
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'docs/',
					typeFilter: 'all',
					favoritesOnly: false,
					searchText: '',
					onClearSearch: vi.fn(),
					onDisableFavoritesOnly: vi.fn(),
					onShowFolders: vi.fn(),
					refreshTreeNode: vi.fn(),
					onOpenPrefix: vi.fn(),
				}),
			{ initialProps: { apiToken: 'token-1' }, wrapper: Wrapper },
		)

		act(() => {
			result.current.openNewFolder()
		})
		await act(async () => {
			result.current.handleNewFolderSubmit({ name: 'first', allowPath: false })
		})
		await waitFor(() => expect(createFolder).toHaveBeenCalledTimes(1))

		rerender({ apiToken: 'token-2' })
		act(() => {
			result.current.openNewFolder()
		})

		expect(result.current.newFolderSubmitting).toBe(false)

		await act(async () => {
			result.current.handleNewFolderSubmit({ name: 'second', allowPath: false })
		})

		await waitFor(() => expect(createFolder).toHaveBeenCalledTimes(2))
	})
})
