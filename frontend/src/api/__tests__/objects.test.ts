import { describe, expect, it, vi } from 'vitest'

import { listObjectFavorites } from '../domains/objects'

describe('listObjectFavorites', () => {
	it('collects bounded favorite pages', async () => {
		const request = vi
			.fn()
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				count: 1,
				keys: ['new.txt'],
				hydrated: false,
				items: [],
				nextCursor: 'page-2',
			})
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				count: 1,
				keys: ['old.txt'],
				hydrated: false,
				items: [],
			})

		const response = await listObjectFavorites(request as Parameters<typeof listObjectFavorites>[0], {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			hydrate: false,
		})

		expect(request).toHaveBeenCalledTimes(2)
		expect(request.mock.calls[1][0]).toContain('cursor=page-2')
		expect(response).toMatchObject({ count: 2, keys: ['new.txt', 'old.txt'], items: [] })
		expect(response.nextCursor).toBeUndefined()
	})
})
