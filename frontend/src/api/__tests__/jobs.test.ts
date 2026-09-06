// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { getJobLogsAfterOffset, getJobLogsTail, listJobs } from '../domains/jobs'

describe('jobs GET contracts', () => {
	it('serializes repeated ids and forwards the list abort signal', async () => {
		const controller = new AbortController()
		const request = vi.fn().mockResolvedValue({ items: [] })

		await listJobs(request, 'profile-1', {
			ids: ['job/1', 'job 2'],
			limit: 2,
			signal: controller.signal,
		})

		expect(request).toHaveBeenCalledWith(
			'/jobs?id=job%2F1&id=job+2&limit=2',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
	})

	it('forwards abort signals to initial and offset log reads', async () => {
		const controller = new AbortController()
		const fetchResponse = vi.fn().mockResolvedValue({
			status: 204,
			headers: new Headers({ 'X-Log-Next-Offset': '9' }),
			text: vi.fn().mockResolvedValue(''),
		})

		await getJobLogsTail(fetchResponse, 'profile-1', 'job-1', 1024, { signal: controller.signal })
		await getJobLogsAfterOffset(fetchResponse, 'profile-1', 'job-1', 9, 2048, { signal: controller.signal })

		expect(fetchResponse).toHaveBeenNthCalledWith(
			1,
			'/jobs/job-1/logs?tailBytes=1024',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
		expect(fetchResponse).toHaveBeenNthCalledWith(
			2,
			'/jobs/job-1/logs?afterOffset=9&maxBytes=2048',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
	})
})
