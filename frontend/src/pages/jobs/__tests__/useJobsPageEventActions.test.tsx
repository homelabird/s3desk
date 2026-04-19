import { act, renderHook } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useJobsPageEventActions } from '../useJobsPageEventActions'

const { realtimeArgsRef, actionArgsRef, cancelMutate, retryMutate, deleteMutateAsync, retryRealtime } = vi.hoisted(() => ({
	realtimeArgsRef: { current: null as Parameters<typeof import('../useJobsRealtimeEvents').useJobsRealtimeEvents>[0] | null },
	actionArgsRef: { current: null as Parameters<typeof import('../useJobsActionMutations').useJobsActionMutations>[0] | null },
	cancelMutate: vi.fn(),
	retryMutate: vi.fn(),
	deleteMutateAsync: vi.fn().mockResolvedValue(undefined),
	retryRealtime: vi.fn(),
}))

vi.mock('../useJobsRealtimeEvents', () => ({
	useJobsRealtimeEvents: (args: Parameters<typeof import('../useJobsRealtimeEvents').useJobsRealtimeEvents>[0]) => {
		realtimeArgsRef.current = args
		return {
			eventsConnected: true,
			eventsTransport: 'ws' as const,
			eventsRetryCount: 1,
			eventsRetryThreshold: 3,
			retryRealtime,
		}
	},
}))

vi.mock('../useJobsActionMutations', () => ({
	useJobsActionMutations: (args: Parameters<typeof import('../useJobsActionMutations').useJobsActionMutations>[0]) => {
		actionArgsRef.current = args
		return {
			cancelingJobId: 'canceling-job',
			retryingJobId: 'retrying-job',
			deletingJobId: 'deleting-job',
			cancelMutation: { mutate: cancelMutate, isPending: false },
			retryMutation: { mutate: retryMutate, isPending: false },
			deleteJobMutation: { mutateAsync: deleteMutateAsync, isPending: false },
		}
	},
}))

function buildArgs() {
	return {
		api: {} as never,
		apiToken: 'token',
		profileId: 'profile-1',
		queryClient: new QueryClient(),
		setDetailsJobId: vi.fn(),
		setDetailsOpen: vi.fn(),
		setLogClearRequest: vi.fn(),
		setLogDrawerRequest: vi.fn(),
	}
}

describe('useJobsPageEventActions', () => {
	beforeEach(() => {
		realtimeArgsRef.current = null
		actionArgsRef.current = null
		cancelMutate.mockReset()
		retryMutate.mockReset()
		deleteMutateAsync.mockClear()
		retryRealtime.mockReset()
	})

	it('clears matching details and logs when realtime reports deleted jobs', () => {
		const args = buildArgs()

		renderHook(() => useJobsPageEventActions(args))

		act(() => {
			realtimeArgsRef.current?.onJobsDeleted?.(['job-1'])
		})

		expect(args.setDetailsJobId).toHaveBeenCalledTimes(1)
		const detailsUpdater = args.setDetailsJobId.mock.calls[0]?.[0] as (prev: string | null) => string | null
		expect(detailsUpdater('job-1')).toBeNull()
		expect(detailsUpdater('job-2')).toBe('job-2')
		expect(args.setDetailsOpen).toHaveBeenCalledWith(false)

		expect(args.setLogDrawerRequest).toHaveBeenCalledTimes(1)
		const logsUpdater = args.setLogDrawerRequest.mock.calls[0]?.[0] as (prev: { jobId: string | null; nonce: number }) => { jobId: string | null; nonce: number }
		expect(logsUpdater({ jobId: 'job-1', nonce: 7 })).toEqual({ jobId: null, nonce: 7 })
		expect(logsUpdater({ jobId: 'job-2', nonce: 7 })).toEqual({ jobId: 'job-2', nonce: 7 })

		expect(args.setLogClearRequest).toHaveBeenCalledTimes(1)
		const clearLogsUpdater = args.setLogClearRequest.mock.calls[0]?.[0] as (prev: { jobIds: string[]; nonce: number }) => { jobIds: string[]; nonce: number }
		expect(clearLogsUpdater({ jobIds: [], nonce: 7 })).toEqual({ jobIds: ['job-1'], nonce: 8 })
	})

	it('clears matching details and logs when delete mutation reports a deleted job', () => {
		const args = buildArgs()

		renderHook(() => useJobsPageEventActions(args))

		act(() => {
			actionArgsRef.current?.onJobDeleted?.('job-9')
		})

		const detailsUpdater = args.setDetailsJobId.mock.calls[0]?.[0] as (prev: string | null) => string | null
		expect(detailsUpdater('job-9')).toBeNull()
		expect(detailsUpdater('job-1')).toBe('job-1')

		const logsUpdater = args.setLogDrawerRequest.mock.calls[0]?.[0] as (prev: { jobId: string | null; nonce: number }) => { jobId: string | null; nonce: number }
		expect(logsUpdater({ jobId: 'job-9', nonce: 3 })).toEqual({ jobId: null, nonce: 3 })
		expect(logsUpdater({ jobId: 'job-1', nonce: 3 })).toEqual({ jobId: 'job-1', nonce: 3 })

		const clearLogsUpdater = args.setLogClearRequest.mock.calls[0]?.[0] as (prev: { jobIds: string[]; nonce: number }) => { jobIds: string[]; nonce: number }
		expect(clearLogsUpdater({ jobIds: [], nonce: 3 })).toEqual({ jobIds: ['job-9'], nonce: 4 })
	})

	it('proxies cancel, retry, and delete requests to the underlying mutations', async () => {
		const args = buildArgs()

		const { result } = renderHook(() => useJobsPageEventActions(args))

		act(() => {
			result.current.requestCancelJob('job-a')
			result.current.requestRetryJob('job-b')
		})
		await act(async () => {
			await result.current.requestDeleteJob('job-c')
		})

		expect(cancelMutate).toHaveBeenCalledWith('job-a')
		expect(retryMutate).toHaveBeenCalledWith('job-b')
		expect(deleteMutateAsync).toHaveBeenCalledWith('job-c')
		expect(result.current.eventsConnected).toBe(true)
		expect(result.current.retryRealtime).toBe(retryRealtime)
	})
})
