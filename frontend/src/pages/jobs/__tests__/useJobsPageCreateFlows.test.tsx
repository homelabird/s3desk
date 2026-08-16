import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import { useJobsPageCreateFlows } from '../useJobsPageCreateFlows'

const { messageSuccess, messageError } = vi.hoisted(() => ({ messageSuccess: vi.fn(), messageError: vi.fn() }))

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			...actual.message,
			success: (...args: unknown[]) => messageSuccess(...args),
			error: (...args: unknown[]) => messageError(...args),
		},
	}
})

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((res) => { resolve = res })
	return { promise, resolve }
}

function buildArgs(overrides: Partial<Parameters<typeof useJobsPageCreateFlows>[0]> = {}) {
	return {
		apiToken: 'token-a',
		profileId: 'profile-1' as string | null,
		queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
		createJobWithRetry: vi.fn(),
		setCreateDeleteOpen: vi.fn(),
		setDeleteJobPrefill: vi.fn(),
		beginDeleteRequest: vi.fn(() => 1),
		isCurrentDeleteRequest: vi.fn((token: number) => token === 1),
		...overrides,
	}
}

function createWrapper(queryClient: QueryClient) {
	return function Wrapper(props: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
	}
}

const payload = {
	bucket: 'bucket-a',
	prefix: 'logs/',
	deleteAll: false,
	allowUnsafePrefix: false,
	include: [],
	exclude: [],
	dryRun: false,
}

describe('useJobsPageCreateFlows', () => {
	beforeEach(() => {
		messageSuccess.mockReset()
		messageError.mockReset()
	})

	it('creates and invalidates a delete job', async () => {
		const args = buildArgs({ createJobWithRetry: vi.fn().mockResolvedValue({ id: 'job-delete-1' }) })
		const invalidateSpy = vi.spyOn(args.queryClient, 'invalidateQueries')
		const { result } = renderHook(() => useJobsPageCreateFlows(args), { wrapper: createWrapper(args.queryClient) })

		act(() => result.current.onCreateDelete(payload))

		await waitFor(() => expect(args.createJobWithRetry).toHaveBeenCalledWith({ type: 'transfer_delete_prefix', payload }))
		await waitFor(() => expect(messageSuccess).toHaveBeenCalledWith('Delete job created: job-delete-1'))
		expect(args.setCreateDeleteOpen).toHaveBeenCalledWith(false)
		expect(args.setDeleteJobPrefill).toHaveBeenCalledWith(null)
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.jobs.scope('profile-1', 'token-a'), exact: false })
		expect(messageError).not.toHaveBeenCalled()
	})

	it('ignores duplicate delete submits while the first request is pending', async () => {
		const pendingJob = deferred<{ id: string }>()
		const args = buildArgs({ createJobWithRetry: vi.fn().mockReturnValue(pendingJob.promise) })
		const { result } = renderHook(() => useJobsPageCreateFlows(args), { wrapper: createWrapper(args.queryClient) })

		act(() => {
			result.current.onCreateDelete(payload)
			result.current.onCreateDelete(payload)
		})
		await waitFor(() => expect(args.createJobWithRetry).toHaveBeenCalledTimes(1))
		await act(async () => { pendingJob.resolve({ id: 'job-delete-1' }); await Promise.resolve() })
	})
})
