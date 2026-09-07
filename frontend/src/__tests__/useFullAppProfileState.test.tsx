import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { APIError, type APIClientShape } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { serverScopedStorageKey } from '../lib/profileScopedStorage'
import { useFullAppProfileState } from '../useFullAppProfileState'

function wrapper({ children }: { children: ReactNode }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function buildApi(
	getBootstrap: () => Promise<unknown>,
	listProfiles: () => Promise<unknown>,
	getMeta: () => Promise<unknown> = vi.fn(),
) {
	return {
		server: { getBootstrap, getMeta },
		profiles: { listProfiles },
	} as unknown as APIClientShape
}

describe('useFullAppProfileState', () => {
	it.each(['keep', 'fallback', 'empty'] as const)('reconciles a refreshed profile list with %s selection', async (outcome) => {
		const profiles = ['profile-a', 'profile-b', 'profile-c'].map((id) => ({ id, name: id, provider: 's3_compatible' }))
		const apiToken = `selection-${outcome}`
		const api = buildApi(vi.fn().mockResolvedValue({ meta: {}, profiles }), vi.fn().mockResolvedValue(profiles))
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const { result, unmount } = renderHook(() => useFullAppProfileState({ api, apiToken, pathname: '/profiles' }), {
			wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
		})
		try {
			await waitFor(() => expect(result.current.safeProfileId).toBe('profile-a'))
			if (outcome === 'keep') act(() => result.current.setProfileId('profile-c'))
			act(() => queryClient.setQueryData(queryKeys.profiles.list(apiToken), outcome === 'empty' ? [] : profiles.slice(1)))
			const expected = outcome === 'keep' ? 'profile-c' : outcome === 'fallback' ? 'profile-b' : null
			await waitFor(() => expect(result.current.safeProfileId).toBe(expected))
			await waitFor(() => expect(JSON.parse(window.localStorage.getItem(serverScopedStorageKey('app', apiToken, 'profileId'))!)).toBe(expected))
		} finally {
			unmount()
			queryClient.clear()
			window.localStorage.removeItem(serverScopedStorageKey('app', apiToken, 'profileId'))
		}
	})

	it('does not request bootstrap or profiles before a token is available', () => {
		const getBootstrap = vi.fn()
		const listProfiles = vi.fn()
		const api = buildApi(getBootstrap, listProfiles)

		renderHook(
			() => useFullAppProfileState({ api, apiToken: '', pathname: '/' }),
			{ wrapper },
		)

		expect(getBootstrap).not.toHaveBeenCalled()
		expect(listProfiles).not.toHaveBeenCalled()
	})

	it('seeds profiles from the authenticated bootstrap response', async () => {
		const listProfiles = vi.fn().mockResolvedValue([])
		const api = buildApi(vi.fn().mockResolvedValue({ meta: {}, profiles: [] }), listProfiles)

		const { result } = renderHook(
			() => useFullAppProfileState({ api, apiToken: 'demo-token', pathname: '/' }),
			{ wrapper },
		)

		await waitFor(() => expect(result.current.metaQuery.isSuccess).toBe(true))
		expect(listProfiles).not.toHaveBeenCalled()
	})

	it('falls back to legacy endpoints when bootstrap is unavailable', async () => {
		const listProfiles = vi.fn().mockResolvedValue([])
		const getMeta = vi.fn().mockResolvedValue({})
		const api = buildApi(
			vi.fn().mockRejectedValue(new APIError({ status: 404, code: 'not_found', message: 'not found' })),
			listProfiles,
			getMeta,
		)

		const { result } = renderHook(
			() => useFullAppProfileState({ api, apiToken: 'demo-token', pathname: '/' }),
			{ wrapper },
		)

		await waitFor(() => expect(result.current.metaQuery.isSuccess).toBe(true))
		expect(getMeta).toHaveBeenCalledOnce()
		expect(listProfiles).toHaveBeenCalledOnce()
	})
})
