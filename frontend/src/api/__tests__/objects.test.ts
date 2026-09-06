// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { getObjectDownloadURL, getObjectIndexSummary, getObjectMeta, listObjectFavorites, listObjects, searchObjectsIndex } from '../domains/objects'

describe('listObjects', () => {
	it('forwards the caller abort signal to the request transport', async () => {
		const controller = new AbortController()
		const request = vi.fn().mockResolvedValue({
			bucket: 'bucket-a',
			prefix: '',
			items: [],
			commonPrefixes: [],
			isTruncated: false,
		})

		await listObjects(request, {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			signal: controller.signal,
		})

		expect(request).toHaveBeenCalledWith(
			'/buckets/bucket-a/objects',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
	})
})

describe('searchObjectsIndex', () => {
	it('forwards the caller abort signal to the request transport', async () => {
		const controller = new AbortController()
		const request = vi.fn().mockResolvedValue({
			bucket: 'bucket-a',
			query: 'report',
			prefix: '',
			items: [],
		})

		await searchObjectsIndex(request, {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			q: 'report',
			signal: controller.signal,
		})

		expect(request).toHaveBeenCalledWith(
			'/buckets/bucket-a/objects/search?q=report',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
	})
})

describe('getObjectIndexSummary', () => {
	it('forwards the caller abort signal to the request transport', async () => {
		const controller = new AbortController()
		const request = vi.fn().mockResolvedValue({ count: 0 })

		await getObjectIndexSummary(request, {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'reports/',
			signal: controller.signal,
		})

		expect(request).toHaveBeenCalledWith(
			'/buckets/bucket-a/objects/index-summary?prefix=reports%2F',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
	})
})

describe('getObjectMeta', () => {
	it('forwards the caller abort signal to the request transport', async () => {
		const controller = new AbortController()
		const request = vi.fn().mockResolvedValue({ key: 'report.txt', size: 1 })

		await getObjectMeta(request, {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'report.txt',
			signal: controller.signal,
		})

		expect(request).toHaveBeenCalledWith(
			'/buckets/bucket-a/objects/meta?key=report.txt',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
	})
})

describe('getObjectDownloadURL', () => {
	it('forwards the caller abort signal to the request transport', async () => {
		const controller = new AbortController()
		const request = vi.fn().mockResolvedValue({ url: 'https://storage.local/report.txt' })

		await getObjectDownloadURL(request, {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'report.txt',
			signal: controller.signal,
		})

		expect(request).toHaveBeenCalledWith(
			'/buckets/bucket-a/objects/download-url?key=report.txt',
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
	})
})

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

	it('stops before the next page when the caller aborts after a response', async () => {
		const controller = new AbortController()
		const request = vi
			.fn()
			.mockImplementationOnce(async () => {
				controller.abort()
				return {
					bucket: 'bucket-a',
					count: 1,
					keys: ['new.txt'],
					hydrated: true,
					items: [],
					nextCursor: 'page-2',
				}
			})
			.mockResolvedValueOnce({
				bucket: 'bucket-a',
				count: 1,
				keys: ['old.txt'],
				hydrated: true,
				items: [],
			})

		await expect(
			listObjectFavorites(request as Parameters<typeof listObjectFavorites>[0], {
				profileId: 'profile-1',
				bucket: 'bucket-a',
				hydrate: true,
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ name: 'AbortError' })

		expect(request).toHaveBeenCalledTimes(1)
		expect(request).toHaveBeenCalledWith(
			expect.stringContaining('/buckets/bucket-a/objects/favorites?'),
			{ method: 'GET', signal: controller.signal },
			{ profileId: 'profile-1' },
		)
	})
})
