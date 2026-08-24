import { describe, expect, it, vi } from 'vitest'

import { getBucketGovernance, getBucketPolicy, listBuckets } from '../domains/buckets'

describe('bucket GET cancellation', () => {
	it('forwards the caller abort signal to provider requests', async () => {
		const controller = new AbortController()
		const request = vi.fn().mockResolvedValue({})

		await listBuckets(request, 'profile-1', controller.signal)
		await getBucketGovernance(request, 'profile-1', 'bucket-a', controller.signal)
		await getBucketPolicy(request, 'profile-1', 'bucket-a', controller.signal)

		expect(request).toHaveBeenNthCalledWith(
			1,
			'/buckets',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
		expect(request).toHaveBeenNthCalledWith(
			2,
			'/buckets/bucket-a/governance',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
		expect(request).toHaveBeenNthCalledWith(
			3,
			'/buckets/bucket-a/policy',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
	})
})
