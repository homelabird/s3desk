import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { APIError } from '../../../api/client'
import { createThumbnailCache } from '../../../lib/thumbnailCache'
import { ObjectThumbnail } from '../ObjectThumbnail'

afterEach(() => {
	vi.restoreAllMocks()
})

describe('ObjectThumbnail', () => {
	it('does not refetch thumbnails after a deterministic 413 failure', async () => {
		const cache = createThumbnailCache()
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.reject(new APIError({ status: 413, code: 'too_large', message: 'object is too large for thumbnail' })),
			abort: vi.fn(),
		}))
		const api = { downloadObjectThumbnail } as never

		const first = render(
			<ObjectThumbnail api={api} profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />,
		)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledTimes(1))
		first.unmount()

		render(<ObjectThumbnail api={api} profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />)

		await waitFor(() => expect(cache.isFailed('profile-1:bucket-a:clip.mp4:24')).toBe(true))
		expect(downloadObjectThumbnail).toHaveBeenCalledTimes(1)
	})

	it('retries thumbnail fetches after transient errors', async () => {
		const cache = createThumbnailCache()
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.reject(new Error('network error')),
			abort: vi.fn(),
		}))
		const api = { downloadObjectThumbnail } as never

		const first = render(
			<ObjectThumbnail api={api} profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />,
		)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledTimes(1))
		first.unmount()

		render(<ObjectThumbnail api={api} profileId="profile-1" bucket="bucket-a" objectKey="clip.mp4" size={24} cache={cache} />)

		await waitFor(() => expect(downloadObjectThumbnail).toHaveBeenCalledTimes(2))
	})
})
