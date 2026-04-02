import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
import { useJobsLogsState } from '../useJobsLogsState'

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
		const api = createMockApiClient({
			jobs: {
				getJobLogsTail,
				getJobLogsAfterOffset,
			},
		})

		const { result } = renderHook(() => useJobsLogsState({ api, apiToken: 'token-a', profileId: 'profile-1' }), {
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
		const api = createMockApiClient({
			jobs: {
				getJobLogsTail,
				getJobLogsAfterOffset,
			},
		})

		const { result } = renderHook(() => useJobsLogsState({ api, apiToken: 'token-a', profileId: 'profile-1' }), {
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

	it('clears active logs when the profile changes', async () => {
		const getJobLogsTail = vi.fn().mockResolvedValue({
			text: 'profile one log\n',
			nextOffset: 16,
		})
		const getJobLogsAfterOffset = vi.fn().mockResolvedValue({ text: '', nextOffset: 16 })
		const api = createMockApiClient({
			jobs: {
				getJobLogsTail,
				getJobLogsAfterOffset,
			},
		})

		const { result, rerender } = renderHook(
			({ apiToken, profileId }) => useJobsLogsState({ api, apiToken, profileId }),
			{
				initialProps: { apiToken: 'token-a', profileId: 'profile-1' as string | null },
				wrapper: createWrapper(),
			},
		)

		act(() => {
			result.current.openLogsForJob('job-1')
		})

		await waitFor(() => {
			expect(result.current.visibleLogEntries).toEqual(['profile one log'])
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-2' })

		expect(result.current.logsOpen).toBe(false)
		expect(result.current.activeLogJobId).toBeNull()
		expect(result.current.visibleLogEntries).toEqual([])
	})

	it('clears active logs when the api token changes', async () => {
		const getJobLogsTail = vi.fn().mockResolvedValue({
			text: 'token one log\n',
			nextOffset: 14,
		})
		const getJobLogsAfterOffset = vi.fn().mockResolvedValue({ text: '', nextOffset: 14 })
		const api = createMockApiClient({
			jobs: {
				getJobLogsTail,
				getJobLogsAfterOffset,
			},
		})

		const { result, rerender } = renderHook(
			({ apiToken }) => useJobsLogsState({ api, apiToken, profileId: 'profile-1' }),
			{
				initialProps: { apiToken: 'token-a' },
				wrapper: createWrapper(),
			},
		)

		act(() => {
			result.current.openLogsForJob('job-1')
		})

		await waitFor(() => {
			expect(result.current.visibleLogEntries).toEqual(['token one log'])
		})

		rerender({ apiToken: 'token-b' })

		expect(result.current.logsOpen).toBe(false)
		expect(result.current.activeLogJobId).toBeNull()
		expect(result.current.visibleLogEntries).toEqual([])
	})

	it('ignores stale initial log tail responses after the profile changes', async () => {
		const firstTail = deferred<{ text: string; nextOffset: number }>()
		const secondTail = deferred<{ text: string; nextOffset: number }>()
		const getJobLogsTail = vi
			.fn()
			.mockImplementationOnce(() => firstTail.promise)
			.mockImplementationOnce(() => secondTail.promise)
		const getJobLogsAfterOffset = vi.fn().mockResolvedValue({ text: '', nextOffset: 0 })
		const api = createMockApiClient({
			jobs: {
				getJobLogsTail,
				getJobLogsAfterOffset,
			},
		})

		const { result, rerender } = renderHook(
			({ apiToken, profileId }) => useJobsLogsState({ api, apiToken, profileId }),
			{
				initialProps: { apiToken: 'token-a', profileId: 'profile-1' as string | null },
				wrapper: createWrapper(),
			},
		)

		act(() => {
			result.current.openLogsForJob('job-1')
		})

		await waitFor(() => {
			expect(getJobLogsTail).toHaveBeenCalledWith('profile-1', 'job-1', 256 * 1024)
		})

		rerender({ apiToken: 'token-a', profileId: 'profile-2' })

		await act(async () => {
			firstTail.resolve({ text: 'stale line\n', nextOffset: 11 })
			await Promise.resolve()
		})

		act(() => {
			result.current.openLogsForJob('job-1')
		})

		expect(result.current.visibleLogEntries).toEqual([])
		await waitFor(() => {
			expect(getJobLogsTail).toHaveBeenLastCalledWith('profile-2', 'job-1', 256 * 1024)
		})

		await act(async () => {
			secondTail.resolve({ text: 'fresh line\n', nextOffset: 11 })
			await Promise.resolve()
		})

		await waitFor(() => {
			expect(result.current.visibleLogEntries).toEqual(['fresh line'])
		})
	})

	it('ignores stale initial log tail responses after the api token changes', async () => {
		const firstTail = deferred<{ text: string; nextOffset: number }>()
		const secondTail = deferred<{ text: string; nextOffset: number }>()
		const getJobLogsTail = vi
			.fn()
			.mockImplementationOnce(() => firstTail.promise)
			.mockImplementationOnce(() => secondTail.promise)
		const getJobLogsAfterOffset = vi.fn().mockResolvedValue({ text: '', nextOffset: 0 })
		const api = createMockApiClient({
			jobs: {
				getJobLogsTail,
				getJobLogsAfterOffset,
			},
		})

		const { result, rerender } = renderHook(
			({ apiToken }) => useJobsLogsState({ api, apiToken, profileId: 'profile-1' }),
			{
				initialProps: { apiToken: 'token-a' },
				wrapper: createWrapper(),
			},
		)

		act(() => {
			result.current.openLogsForJob('job-1')
		})

		await waitFor(() => {
			expect(getJobLogsTail).toHaveBeenCalledWith('profile-1', 'job-1', 256 * 1024)
		})

		rerender({ apiToken: 'token-b' })

		await act(async () => {
			firstTail.resolve({ text: 'stale line\n', nextOffset: 11 })
			await Promise.resolve()
		})

		act(() => {
			result.current.openLogsForJob('job-1')
		})

		expect(result.current.visibleLogEntries).toEqual([])
		await waitFor(() => {
			expect(getJobLogsTail).toHaveBeenLastCalledWith('profile-1', 'job-1', 256 * 1024)
		})

		await act(async () => {
			secondTail.resolve({ text: 'fresh line\n', nextOffset: 11 })
			await Promise.resolve()
		})

		await waitFor(() => {
			expect(result.current.visibleLogEntries).toEqual(['fresh line'])
		})
	})

	it('keeps the follow-logs preference isolated per profile', () => {
		const api = createMockApiClient({
			jobs: {
				getJobLogsTail: vi.fn(),
				getJobLogsAfterOffset: vi.fn(),
			},
		})

		const { result, rerender } = renderHook(
			({ profileId }) => useJobsLogsState({ api, apiToken: 'token-a', profileId }),
			{
				initialProps: { profileId: 'profile-1' as string | null },
				wrapper: createWrapper(),
			},
		)

		expect(result.current.followLogs).toBe(false)

		act(() => {
			result.current.setFollowLogs(true)
		})

		expect(result.current.followLogs).toBe(true)

		rerender({ profileId: 'profile-2' })

		expect(result.current.followLogs).toBe(true)

		act(() => {
			result.current.setFollowLogs(false)
		})

		expect(result.current.followLogs).toBe(false)

		rerender({ profileId: 'profile-1' })

		expect(result.current.followLogs).toBe(true)
	})
})
