import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { APIClient } from '../../../api/client'
import { useObjectsPresign } from '../useObjectsPresign'

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
		const api = {
			getObjectDownloadURL: vi.fn().mockResolvedValue({
				url: 'https://example.com/download',
				expiresAt: '2026-03-11T00:00:00Z',
			}),
		} as unknown as APIClient

		const { result } = renderHook(
			() =>
				useObjectsPresign({
					api,
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

		expect(api.getObjectDownloadURL).toHaveBeenCalledWith({
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
})
