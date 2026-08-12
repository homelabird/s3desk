import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { APIClientShape } from '../api/client'
import { useFullAppProfileState } from '../useFullAppProfileState'

function wrapper({ children }: { children: ReactNode }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function buildApi(getMeta: () => Promise<unknown>, listProfiles: () => Promise<unknown>) {
	return {
		server: { getMeta },
		profiles: { listProfiles },
	} as unknown as APIClientShape
}

describe('useFullAppProfileState', () => {
	it('does not request profiles until server authentication succeeds', async () => {
		const listProfiles = vi.fn()
		const api = buildApi(vi.fn().mockRejectedValue(new Error('unauthorized')), listProfiles)

		const { result } = renderHook(
			() => useFullAppProfileState({ api, apiToken: '', pathname: '/' }),
			{ wrapper },
		)

		await waitFor(() => expect(result.current.metaQuery.isError).toBe(true))
		expect(listProfiles).not.toHaveBeenCalled()
	})

	it('loads profiles after server authentication succeeds', async () => {
		const listProfiles = vi.fn().mockResolvedValue([])
		const api = buildApi(vi.fn().mockResolvedValue({}), listProfiles)

		renderHook(
			() => useFullAppProfileState({ api, apiToken: 'demo-token', pathname: '/' }),
			{ wrapper },
		)

		await waitFor(() => expect(listProfiles).toHaveBeenCalledTimes(1))
	})
})
