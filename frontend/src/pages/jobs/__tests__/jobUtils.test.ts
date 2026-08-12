import { describe, expect, it } from 'vitest'

import type { InfiniteData } from '@tanstack/react-query'
import { queryKeys } from '../../../api/queryKeys'
import type { Job, JobsListResponse } from '../../../api/types'
import { jobMatchesQueryKey, joinKeyWithPrefix, normalizePrefix, statusColor, updateJob } from '../jobUtils'

describe('jobUtils', () => {
	it('formats status colors', () => {
		expect(statusColor('running')).toBe('processing')
		expect(statusColor('failed')).toBe('error')
	})

	it('updates job status in infinite data', () => {
		const job: Job = {
			id: '1',
			type: 'transfer_sync_local_to_s3',
			status: 'queued',
			payload: {},
			createdAt: '2024-01-01T00:00:00Z',
		}
		const data: InfiniteData<JobsListResponse, string | undefined> = {
			pages: [{ items: [job] }],
			pageParams: [undefined],
		}
		const updated = updateJob(data, '1', (current) => ({ ...current, status: 'failed' }))
		expect(updated?.pages[0].items[0].status).toBe('failed')
	})

	it('normalizes and joins prefixes', () => {
		expect(normalizePrefix('foo')).toBe('foo/')
		expect(joinKeyWithPrefix('foo/', '/bar.txt')).toBe('foo/bar.txt')
	})
})

describe('job cache filters', () => {
	it('rejects realtime patches from caches whose filters no longer match', () => {
		const completedJob = {
			id: 'job-1',
			type: 'transfer_copy_object',
			status: 'succeeded',
			createdAt: '2026-08-12T00:00:00Z',
			errorCode: null,
			payload: {},
		} as Job

		expect(jobMatchesQueryKey(completedJob, queryKeys.jobs.list('profile-1', 'token-a', 'active', '', ''))).toBe(false)
		expect(jobMatchesQueryKey(completedJob, queryKeys.jobs.list('profile-1', 'token-a', 'all', 'transfer_copy_object', ''))).toBe(true)
		expect(jobMatchesQueryKey(completedJob, queryKeys.jobs.list('profile-1', 'token-a', 'all', 'transfer_move_object', ''))).toBe(false)
	})
})
