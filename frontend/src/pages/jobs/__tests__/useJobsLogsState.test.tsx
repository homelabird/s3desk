import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { APIClient } from '../../../api/client'
import { useJobsLogsState } from '../useJobsLogsState'

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})
	return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useJobsLogsState', () => {
	beforeEach(() => {
		window.localStorage.clear()
		window.localStorage.setItem('jobsFollowLogs', JSON.stringify(false))
	})

	it('opens logs and refreshes the active job logs', async () => {
		const getJobLogsTail = vi.fn().mockResolvedValue({
			text: 'first line\nsecond line\n',
			nextOffset: 12,
		})
		const getJobLogsAfterOffset = vi.fn().mockResolvedValue({ text: '', nextOffset: 12 })
		const api = {
			getJobLogsTail,
			getJobLogsAfterOffset,
		} as unknown as APIClient

		const { result } = renderHook(() => useJobsLogsState({ api, profileId: 'profile-1' }), {
			wrapper: createWrapper(),
		})

		act(() => {
			result.current.openLogsForJob('job-1')
		})

		await waitFor(() => {
			expect(getJobLogsTail).toHaveBeenCalledWith('profile-1', 'job-1', 256 * 1024)
		})
		expect(result.current.logsOpen).toBe(true)
		expect(result.current.activeLogJobId).toBe('job-1')
		expect(result.current.visibleLogEntries).toEqual(['first line', 'second line'])

		act(() => {
			result.current.refreshActiveLogs()
		})
		await waitFor(() => {
			expect(getJobLogsTail).toHaveBeenCalledTimes(2)
		})
	})

	it('clears logs and closes drawer for deleted active job', async () => {
		const getJobLogsTail = vi.fn().mockResolvedValue({
			text: 'line one\nline two\n',
			nextOffset: 8,
		})
		const getJobLogsAfterOffset = vi.fn().mockResolvedValue({ text: '', nextOffset: 8 })
		const api = {
			getJobLogsTail,
			getJobLogsAfterOffset,
		} as unknown as APIClient

		const { result } = renderHook(() => useJobsLogsState({ api, profileId: 'profile-1' }), {
			wrapper: createWrapper(),
		})

		act(() => {
			result.current.openLogsForJob('job-1')
		})

		await waitFor(() => {
			expect(result.current.visibleLogEntries.length).toBe(2)
		})

		act(() => {
			result.current.clearLogsForJob('job-1')
		})

		expect(result.current.logsOpen).toBe(false)
		expect(result.current.activeLogJobId).toBeNull()
		expect(result.current.visibleLogEntries).toEqual([])
	})
})
