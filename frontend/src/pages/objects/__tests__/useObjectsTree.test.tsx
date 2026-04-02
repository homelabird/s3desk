import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
			}),
		)
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
			expect(window.localStorage.getItem('objects:token-a:profile-1:treeExpandedByBucket')).toBe(
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
			expect(window.localStorage.getItem('objects:token-a:profile-1:treeExpandedByBucket')).toBe(JSON.stringify({}))
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
