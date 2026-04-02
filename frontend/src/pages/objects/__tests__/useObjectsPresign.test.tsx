import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
import { useObjectsPresign } from '../useObjectsPresign'

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (error?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function buildWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})

	return function Wrapper(props: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
	}
}

describe('useObjectsPresign', () => {
	it('passes known object metadata hints to download-url generation', async () => {
		const getObjectDownloadURL = vi.fn().mockResolvedValue({
			url: 'https://example.com/download',
			expiresAt: '2026-03-11T00:00:00Z',
		})
		const api = createMockApiClient({
			objects: {
				getObjectDownloadURL,
			},
		})

		const { result } = renderHook(
			() =>
				useObjectsPresign({
					api,
					apiToken: 'token-a',
					profileId: 'profile-1',
					bucket: 'bucket-a',
					downloadLinkProxyEnabled: true,
					presignedDownloadSupported: false,
				}),
			{ wrapper: buildWrapper() },
		)

		await act(async () => {
			await result.current.presignMutation.mutateAsync({
				key: 'photos/cat.jpg',
				size: 128,
				lastModified: '2026-03-07T11:00:00Z',
			})
		})

		expect(getObjectDownloadURL).toHaveBeenCalledWith({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'photos/cat.jpg',
			proxy: true,
			size: 128,
			lastModified: '2026-03-07T11:00:00Z',
		})
		expect(result.current.presignKey).toBeNull()
		expect(result.current.presignOpen).toBe(true)
		expect(result.current.presign).toEqual({
			key: 'photos/cat.jpg',
			url: 'https://example.com/download',
			expiresAt: '2026-03-11T00:00:00Z',
		})
	})

	it('ignores stale presign responses after the modal closes', async () => {
		const presignRequest = deferred<{ url: string; expiresAt: string }>()
		const getObjectDownloadURL = vi.fn().mockReturnValueOnce(presignRequest.promise)
		const api = createMockApiClient({
			objects: {
				getObjectDownloadURL,
			},
		})

		const { result } = renderHook(
			() =>
				useObjectsPresign({
					api,
					apiToken: 'token-a',
					profileId: 'profile-1',
					bucket: 'bucket-a',
					downloadLinkProxyEnabled: true,
					presignedDownloadSupported: false,
				}),
			{ wrapper: buildWrapper() },
		)

		await act(async () => {
			result.current.presignMutation.mutate({ key: 'photos/cat.jpg' })
			await Promise.resolve()
		})

		act(() => {
			result.current.closePresign()
		})

		await act(async () => {
			presignRequest.resolve({
				url: 'https://example.com/stale-download',
				expiresAt: '2026-03-12T00:00:00Z',
			})
			await Promise.resolve()
		})

		expect(result.current.presignOpen).toBe(false)
		expect(result.current.presign).toBeNull()
		expect(result.current.presignKey).toBeNull()
	})

	it('ignores older presign responses after a newer request starts', async () => {
		const firstRequest = deferred<{ url: string; expiresAt: string }>()
		const secondRequest = deferred<{ url: string; expiresAt: string }>()
		const getObjectDownloadURL = vi
			.fn()
			.mockReturnValueOnce(firstRequest.promise)
			.mockReturnValueOnce(secondRequest.promise)
		const api = createMockApiClient({
			objects: {
				getObjectDownloadURL,
			},
		})

		const { result } = renderHook(
			() =>
				useObjectsPresign({
					api,
					apiToken: 'token-a',
					profileId: 'profile-1',
					bucket: 'bucket-a',
					downloadLinkProxyEnabled: true,
					presignedDownloadSupported: false,
				}),
			{ wrapper: buildWrapper() },
		)

		act(() => {
			result.current.presignMutation.mutate({ key: 'photos/old.jpg' })
			result.current.presignMutation.mutate({ key: 'photos/new.jpg' })
		})

		await act(async () => {
			secondRequest.resolve({
				url: 'https://example.com/new-download',
				expiresAt: '2026-03-13T00:00:00Z',
			})
			await Promise.resolve()
		})

		expect(result.current.presignOpen).toBe(true)
		expect(result.current.presign).toEqual({
			key: 'photos/new.jpg',
			url: 'https://example.com/new-download',
			expiresAt: '2026-03-13T00:00:00Z',
		})

		await act(async () => {
			firstRequest.resolve({
				url: 'https://example.com/old-download',
				expiresAt: '2026-03-14T00:00:00Z',
			})
			await Promise.resolve()
		})

		expect(result.current.presign).toEqual({
			key: 'photos/new.jpg',
			url: 'https://example.com/new-download',
			expiresAt: '2026-03-13T00:00:00Z',
		})
		expect(result.current.presignKey).toBeNull()
	})

	it('ignores stale presign responses after the api token changes', async () => {
		const presignRequest = deferred<{ url: string; expiresAt: string }>()
		const getObjectDownloadURL = vi.fn().mockReturnValueOnce(presignRequest.promise)
		const api = createMockApiClient({
			objects: {
				getObjectDownloadURL,
			},
		})

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsPresign({
					api,
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					downloadLinkProxyEnabled: true,
					presignedDownloadSupported: false,
				}),
			{ initialProps: { apiToken: 'token-a' }, wrapper: buildWrapper() },
		)

		await act(async () => {
			result.current.presignMutation.mutate({ key: 'photos/cat.jpg' })
			await Promise.resolve()
		})

		rerender({ apiToken: 'token-b' })

		await act(async () => {
			presignRequest.resolve({
				url: 'https://example.com/stale-download',
				expiresAt: '2026-03-12T00:00:00Z',
			})
			await Promise.resolve()
		})

		expect(result.current.presignOpen).toBe(false)
		expect(result.current.presign).toBeNull()
		expect(result.current.presignKey).toBeNull()
	})
})
