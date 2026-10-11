import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ServerStagedRestore } from '../../api/types'
import { createMockApiClient } from '../../test/mockApiClient'
import { useStagedRestoreInventory } from '../useStagedRestoreInventory'

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((res) => { resolve = res })
	return { promise, resolve }
}

describe('useStagedRestoreInventory', () => {
	it.each(['delete', 'cleanup'] as const)('does not invoke callbacks or refresh after unmount during %s', async (operation) => {
		const deletion = deferred<void>()
		const listServerRestores = vi.fn().mockResolvedValue({ items: [
			{ id: 'restore-1', stagedAt: '2000-01-01T00:00:00Z' } as ServerStagedRestore,
		] })
		const deleteServerRestore = vi.fn(() => deletion.promise)
		const onRestoreDeleted = vi.fn()
		const api = createMockApiClient({ server: { listServerRestores, deleteServerRestore } })
		const { result, unmount } = renderHook(() => useStagedRestoreInventory({ api, open: true, metaLoaded: true, onRestoreDeleted }), { wrapper: StrictMode })
		await waitFor(() => expect(result.current.stagedRestores).toHaveLength(1))
		let request!: Promise<void>
		act(() => {
			request = operation === 'delete' ? result.current.handleDeleteRestore('restore-1') : result.current.handleDeleteStaleRestores()
		})
		expect(deleteServerRestore).toHaveBeenCalledWith('restore-1')
		listServerRestores.mockClear()
		unmount()
		await act(async () => { deletion.resolve(); await request })
		expect(onRestoreDeleted).not.toHaveBeenCalled()
		expect(listServerRestores).not.toHaveBeenCalled()
	})

	it('keeps the current API inventory when the former API list resolves late', async () => {
		const oldList = deferred<{ items: ServerStagedRestore[] }>()
		const oldApi = createMockApiClient({ server: { listServerRestores: vi.fn(() => oldList.promise) } })
		const currentApi = createMockApiClient({ server: { listServerRestores: vi.fn().mockResolvedValue({ items: [
			{ id: 'current', stagedAt: '2026-10-11T00:00:00Z' } as ServerStagedRestore,
		] }) } })
		const { result, rerender } = renderHook(({ api }) => useStagedRestoreInventory({ api, open: true, metaLoaded: true }), { initialProps: { api: oldApi }, wrapper: StrictMode })
		rerender({ api: currentApi })
		await waitFor(() => expect(result.current.stagedRestores[0]?.id).toBe('current'))
		await act(async () => { oldList.resolve({ items: [] }) })
		expect(result.current.stagedRestores[0]?.id).toBe('current')
	})
})
