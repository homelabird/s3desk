import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Job } from '../../../api/types'
import {
	claimObjectJobCompletion,
	releaseObjectJobCompletion,
} from '../objectsQueryCache'
import { useObjectsPageEnvironment } from '../useObjectsPageEnvironment'

const { invalidateObjectQueriesForJobMock, realtimeArgsRef } = vi.hoisted(() => ({
	invalidateObjectQueriesForJobMock: vi.fn(),
	realtimeArgsRef: { current: null as Parameters<typeof import('../../jobs/useJobsRealtimeEvents').useJobsRealtimeEvents>[0] | null },
}))

vi.mock('antd', () => ({ Grid: { useBreakpoint: () => ({ md: true }) } }))
vi.mock('../../../api/useAPIClient', () => ({ useAPIClient: () => ({}) }))
vi.mock('../../../components/useTransfers', () => ({
	useTransfersCommands: () => ({}),
	useTransfersSummary: () => ({ activeTransferCount: 0 }),
}))
vi.mock('../../../lib/useIsOffline', () => ({ useIsOffline: () => false }))
vi.mock('../../jobs/useJobsRealtimeEvents', () => ({
	useJobsRealtimeEvents: (args: typeof realtimeArgsRef.current) => {
		realtimeArgsRef.current = args
		return { eventsConnected: true }
	},
}))
vi.mock('../objectsPageDebug', () => ({
	isContextMenuDebugEnabled: () => false,
	isObjectsListDebugEnabled: () => false,
}))
vi.mock('../useObjectsDeferredOpener', () => ({ useObjectsDeferredOpener: () => vi.fn() }))
vi.mock('../objectsQueryCache', async () => {
	const actual = await vi.importActual<typeof import('../objectsQueryCache')>('../objectsQueryCache')
	return {
		...actual,
		invalidateObjectQueriesForJob: (...args: unknown[]) => invalidateObjectQueriesForJobMock(...args),
	}
})

const scope = { apiToken: 'token-1', profileId: 'profile-1', jobId: 'job-delete' }

describe('useObjectsPageEnvironment', () => {
	afterEach(() => {
		releaseObjectJobCompletion(scope)
		invalidateObjectQueriesForJobMock.mockClear()
		realtimeArgsRef.current = null
	})

	it('hands cache-miss terminal payloads to a claimed watcher and handles an unclaimed job', () => {
		const queryClient = new QueryClient()
		function Wrapper({ children }: PropsWithChildren) {
			return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		}
		const { result } = renderHook(
			() => useObjectsPageEnvironment({ apiToken: scope.apiToken, profileId: scope.profileId }),
			{ wrapper: Wrapper },
		)
		expect(result.current.eventsConnected).toBe(true)
		const completedJob = {
			id: scope.jobId,
			type: 's3_delete_objects',
			status: 'succeeded',
			payload: { bucket: 'bucket-a', keys: ['logs/app.log'] },
			createdAt: '2026-08-24T00:00:00Z',
		} satisfies Job

		const handleClaimedCompletion = vi.fn()
		claimObjectJobCompletion(scope, handleClaimedCompletion)
		act(() => realtimeArgsRef.current?.onJobCompleted?.({
			job: null,
			jobId: completedJob.id,
			status: 'failed',
			error: 'failed detail',
		}))
		expect(invalidateObjectQueriesForJobMock).not.toHaveBeenCalled()
		expect(handleClaimedCompletion).toHaveBeenCalledWith({ status: 'failed', error: 'failed detail' })

		releaseObjectJobCompletion(scope)
		act(() => realtimeArgsRef.current?.onJobCompleted?.({
			job: completedJob,
			jobId: completedJob.id,
			status: 'succeeded',
		}))
		expect(invalidateObjectQueriesForJobMock).toHaveBeenCalledOnce()
		expect(invalidateObjectQueriesForJobMock).toHaveBeenCalledWith(
			queryClient,
			completedJob,
			scope.profileId,
			scope.apiToken,
		)
	})
})
