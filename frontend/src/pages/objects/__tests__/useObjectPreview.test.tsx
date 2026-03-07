import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectPreview } from '../useObjectPreview'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

describe('useObjectPreview', () => {
	beforeEach(() => {
		URL.createObjectURL = vi.fn(() => 'blob:video-thumb')
		URL.revokeObjectURL = vi.fn()
	})

	afterEach(() => {
		URL.createObjectURL = originalCreateObjectURL
		URL.revokeObjectURL = originalRevokeObjectURL
		vi.restoreAllMocks()
	})

	it('loads a larger thumbnail preview for video objects', async () => {
		const abort = vi.fn()
		const downloadObjectThumbnail = vi.fn(() => ({
			promise: Promise.resolve({
				blob: new Blob(['thumb'], { type: 'image/jpeg' }),
				contentType: 'image/jpeg',
			}),
			abort,
		}))
		const getObjectDownloadURL = vi.fn()
		const api = { downloadObjectThumbnail, getObjectDownloadURL } as never

		const { result, unmount } = renderHook(() =>
			useObjectPreview({
				api,
				profileId: 'profile-1',
				bucket: 'bucket-a',
				detailsKey: 'clip.mp4',
				detailsVisible: true,
				detailsMeta: {
					key: 'clip.mp4',
					contentType: 'video/mp4',
					size: 52_386_776,
				} as never,
				downloadLinkProxyEnabled: false,
			}),
		)

		await act(async () => {
			await result.current.loadPreview()
		})

		await waitFor(() => expect(result.current.preview?.status).toBe('ready'))
		expect(result.current.preview).toMatchObject({
			key: 'clip.mp4',
			status: 'ready',
			kind: 'video',
			contentType: 'image/jpeg',
			url: 'blob:video-thumb',
		})
		expect(downloadObjectThumbnail).toHaveBeenCalledWith({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'clip.mp4',
			size: 360,
		})
		expect(getObjectDownloadURL).not.toHaveBeenCalled()

		unmount()
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video-thumb')
	})
})
