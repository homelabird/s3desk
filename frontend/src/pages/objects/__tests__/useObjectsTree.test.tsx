import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { profileScopedStorageKey } from '../../../lib/profileScopedStorage'
import { createMockApiClient } from '../../../test/mockApiClient'
import { useObjectsTree } from '../useObjectsTree'

function getRootChildKeys(treeData: { children?: { key: string }[] }[]) {
	return (treeData[0]?.children ?? []).map((node) => String(node.key))
}

describe('useObjectsTree', () => {
	afterEach(() => {
		window.localStorage.clear()
	})

	it('reloads tree children when the profile changes for the same bucket', async () => {
		const listObjects = vi
			.fn()
			.mockResolvedValueOnce({
				commonPrefixes: ['docs/'],
				items: [],
				isTruncated: false,
			})
			.mockResolvedValueOnce({
				commonPrefixes: ['reports/'],
				items: [],
				isTruncated: false,
			})
		const api = createMockApiClient({
			objects: {
				listObjects,
			},
		})

		const { result, rerender } = renderHook(
			({ apiToken, profileId }: { apiToken: string; profileId: string | null }) =>
				useObjectsTree({
					api,
					apiToken,
					profileId,
					bucket: 'shared-bucket',
					prefix: '',
					debugEnabled: false,
					log: vi.fn(),
				}),
			{ initialProps: { apiToken: 'token-a', profileId: 'profile-1' } },
		)

		await act(async () => {
			await result.current.onTreeLoadData('/')
		})

		await waitFor(() => {
			expect(getRootChildKeys(result.current.treeData)).toEqual(['docs/'])
		})
		expect(listObjects).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				profileId: 'profile-1',
				bucket: 'shared-bucket',
				prefix: undefined,
				prefixesOnly: true,
			}),
		)

		rerender({ apiToken: 'token-a', profileId: 'profile-2' })

		await waitFor(() => {
			expect(getRootChildKeys(result.current.treeData)).toEqual([])
		})

		await act(async () => {
			await result.current.onTreeLoadData('/')
		})

		await waitFor(() => {
			expect(getRootChildKeys(result.current.treeData)).toEqual(['reports/'])
		})
		expect(listObjects).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				profileId: 'profile-2',
				bucket: 'shared-bucket',
				prefix: undefined,
				prefixesOnly: true,
			}),
		)
	})

	it('aborts stale tree pagination when the profile changes', async () => {
		let resolveFirstPage!: (value: {
			commonPrefixes: string[]
			items: []
			isTruncated: boolean
			nextContinuationToken?: string
		}) => void
		const firstPage = new Promise<Parameters<typeof resolveFirstPage>[0]>((resolve) => {
			resolveFirstPage = resolve
		})
		let resolveSecondPage!: (value: Parameters<typeof resolveFirstPage>[0]) => void
		const secondPage = new Promise<Parameters<typeof resolveFirstPage>[0]>((resolve) => {
			resolveSecondPage = resolve
		})
		const listObjects = vi.fn().mockImplementationOnce(() => firstPage).mockImplementationOnce(() => secondPage)
		const api = createMockApiClient({ objects: { listObjects } })

		const { result, rerender } = renderHook(
			({ profileId }: { profileId: string }) =>
				useObjectsTree({
					api,
					apiToken: 'token-a',
					profileId,
					bucket: 'shared-bucket',
					prefix: '',
					debugEnabled: false,
					log: vi.fn(),
				}),
			{ initialProps: { profileId: 'profile-1' } },
		)

		let loadPromise!: Promise<void>
		act(() => {
			loadPromise = result.current.onTreeLoadData('/')
		})
		await waitFor(() => expect(listObjects).toHaveBeenCalledTimes(1))
		const firstSignal = listObjects.mock.calls[0]?.[0]?.signal as AbortSignal | undefined

		rerender({ profileId: 'profile-2' })

		expect(firstSignal?.aborted).toBe(true)
		let secondLoadPromise!: Promise<void>
		act(() => {
			secondLoadPromise = result.current.onTreeLoadData('/')
		})
		await waitFor(() => expect(listObjects).toHaveBeenCalledTimes(2))

		await act(async () => {
			resolveFirstPage({
				commonPrefixes: ['docs/'],
				items: [],
				isTruncated: true,
				nextContinuationToken: 'page-2',
			})
			await loadPromise
		})

		expect(listObjects).toHaveBeenCalledTimes(2)
		expect(getRootChildKeys(result.current.treeData)).toEqual([])
		expect(result.current.treeErrorMessage).toBeNull()
		expect(result.current.treeLoadingKeys).toEqual(['/'])

		await act(async () => {
			resolveSecondPage({
				commonPrefixes: ['reports/'],
				items: [],
				isTruncated: false,
			})
			await secondLoadPromise
		})

		expect(getRootChildKeys(result.current.treeData)).toEqual(['reports/'])
		expect(result.current.treeLoadingKeys).toEqual([])
	})

	it('keeps expanded keys isolated per profile and clears collapsed bucket state', async () => {
		const api = createMockApiClient({
			objects: {
				listObjects: vi.fn(),
			},
		})

		const { result, rerender } = renderHook(
			({ apiToken, profileId, bucket }: { apiToken: string; profileId: string | null; bucket: string }) =>
				useObjectsTree({
					api,
					apiToken,
					profileId,
					bucket,
					prefix: '',
					debugEnabled: false,
					log: vi.fn(),
				}),
			{ initialProps: { apiToken: 'token-a', profileId: 'profile-1', bucket: 'shared-bucket' } },
		)

		act(() => {
			result.current.setTreeExpandedKeys(['/', 'docs/'])
		})

		await waitFor(() => {
			expect(window.localStorage.getItem(profileScopedStorageKey('objects', 'token-a', 'profile-1', 'treeExpandedByBucket'))).toBe(
				JSON.stringify({ 'shared-bucket': ['/', 'docs/'] }),
			)
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-2', bucket: 'shared-bucket' })

		await waitFor(() => {
			expect(result.current.treeExpandedKeys).toEqual([])
		})

		act(() => {
			result.current.setTreeExpandedKeys(['/', 'reports/'])
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-1', bucket: 'shared-bucket' })

		await waitFor(() => {
			expect(result.current.treeExpandedKeys).toEqual(['/', 'docs/'])
		})

		act(() => {
			result.current.setTreeExpandedKeys([])
		})

		await waitFor(() => {
			expect(window.localStorage.getItem(profileScopedStorageKey('objects', 'token-a', 'profile-1', 'treeExpandedByBucket'))).toBe(JSON.stringify({}))
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-1', bucket: 'other-bucket' })
		rerender({ apiToken: 'token-a', profileId: 'profile-1', bucket: 'shared-bucket' })

		await waitFor(() => {
			expect(result.current.treeExpandedKeys).toEqual([])
		})
	})

	it('reloads tree state when the api token changes for the same profile and bucket', async () => {
		const api = createMockApiClient({
			objects: {
				listObjects: vi.fn(),
			},
		})

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsTree({
					api,
					apiToken,
					profileId: 'profile-1',
					bucket: 'shared-bucket',
					prefix: '',
					debugEnabled: false,
					log: vi.fn(),
				}),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.setTreeExpandedKeys(['/', 'docs/'])
		})

		rerender({ apiToken: 'token-b' })

		await waitFor(() => {
			expect(result.current.treeExpandedKeys).toEqual([])
		})

		act(() => {
			result.current.setTreeExpandedKeys(['/', 'reports/'])
		})

		rerender({ apiToken: 'token-a' })

		await waitFor(() => {
			expect(result.current.treeExpandedKeys).toEqual(['/', 'docs/'])
		})
	})

	it('hides the tree drawer when the api token changes for the same profile and bucket', async () => {
		const api = createMockApiClient({
			objects: {
				listObjects: vi.fn(),
			},
		})

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsTree({
					api,
					apiToken,
					profileId: 'profile-1',
					bucket: 'shared-bucket',
					prefix: '',
					debugEnabled: false,
					log: vi.fn(),
				}),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.setTreeDrawerOpen(true)
		})

		expect(result.current.treeDrawerOpen).toBe(true)

		rerender({ apiToken: 'token-b' })

		expect(result.current.treeDrawerOpen).toBe(false)
	})
})
