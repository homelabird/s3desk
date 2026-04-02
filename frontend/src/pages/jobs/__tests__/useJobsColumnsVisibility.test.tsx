import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useJobsColumnsVisibility } from '../useJobsColumnsVisibility'

describe('useJobsColumnsVisibility', () => {
	afterEach(() => {
		window.localStorage.clear()
	})

	it('migrates legacy global column visibility into a profile-scoped key', async () => {
		window.localStorage.setItem(
			'jobsColumnVisibility',
			JSON.stringify({
				id: false,
				type: true,
				summary: true,
				status: true,
				progress: false,
				errorCode: true,
				error: true,
				createdAt: true,
				actions: true,
			}),
		)

		const { result } = renderHook(() => useJobsColumnsVisibility('token-a', 'profile-1'))

		expect(result.current.mergedColumnVisibility.id).toBe(false)
		expect(result.current.mergedColumnVisibility.progress).toBe(false)
		expect(result.current.mergedColumnVisibility.actions).toBe(true)

		await waitFor(() => {
			expect(window.localStorage.getItem('jobs:token-a:profile-1:columnVisibility')).not.toBeNull()
		})
		expect(window.localStorage.getItem('jobsColumnVisibility')).toBeNull()
	})

	it('keeps column visibility isolated per profile', () => {
		const { result, rerender } = renderHook(
			({ apiToken, profileId }: { apiToken: string; profileId: string | null }) => useJobsColumnsVisibility(apiToken, profileId),
			{ initialProps: { apiToken: 'token-a', profileId: 'profile-1' } },
		)

		act(() => {
			result.current.setColumnVisible('id', false)
			result.current.setColumnVisible('progress', false)
		})

		expect(result.current.mergedColumnVisibility.id).toBe(false)
		expect(result.current.mergedColumnVisibility.progress).toBe(false)

		rerender({ apiToken: 'token-a', profileId: 'profile-2' })

		expect(result.current.mergedColumnVisibility.id).toBe(true)
		expect(result.current.mergedColumnVisibility.progress).toBe(true)

		act(() => {
			result.current.setColumnVisible('error', false)
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-1' })

		expect(result.current.mergedColumnVisibility.id).toBe(false)
		expect(result.current.mergedColumnVisibility.progress).toBe(false)
		expect(result.current.mergedColumnVisibility.error).toBe(true)
	})

	it('keeps column visibility isolated per api token for the same profile', () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) => useJobsColumnsVisibility(apiToken, 'profile-1'),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.setColumnVisible('id', false)
		})

		rerender({ apiToken: 'token-b' })

		expect(result.current.mergedColumnVisibility.id).toBe(true)

		act(() => {
			result.current.setColumnVisible('progress', false)
		})

		rerender({ apiToken: 'token-a' })

		expect(result.current.mergedColumnVisibility.id).toBe(false)
		expect(result.current.mergedColumnVisibility.progress).toBe(true)
	})
})
