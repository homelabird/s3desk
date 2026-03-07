import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLocalVideoUploadPreview, isVideoUploadFile, pickVideoPreviewTime } from '../uploadPreview'

const originalCreateElement = document.createElement.bind(document)
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

afterEach(() => {
	document.createElement = originalCreateElement
	URL.createObjectURL = originalCreateObjectURL
	URL.revokeObjectURL = originalRevokeObjectURL
	vi.restoreAllMocks()
})

describe('uploadPreview', () => {
	it('detects video upload files from mime type or extension', () => {
		expect(isVideoUploadFile(new File(['video'], 'clip.mp4', { type: 'video/mp4' }))).toBe(true)
		expect(isVideoUploadFile(new File(['video'], 'clip.MOV', { type: '' }))).toBe(true)
		expect(isVideoUploadFile(new File(['text'], 'notes.txt', { type: 'text/plain' }))).toBe(false)
	})

	it('picks a safe preview timestamp near the beginning', () => {
		expect(pickVideoPreviewTime(12)).toBe(1)
		expect(pickVideoPreviewTime(0.2)).toBe(0)
		expect(pickVideoPreviewTime(0.7)).toBeCloseTo(0.6)
	})

	it('creates a scaled local video frame preview', async () => {
		const createObjectURL = vi.fn()
		createObjectURL
			.mockReturnValueOnce('blob:video-source')
			.mockReturnValueOnce('blob:video-preview')
		URL.createObjectURL = createObjectURL
		URL.revokeObjectURL = vi.fn()

		const video = createMockVideoElement()
		const drawImage = vi.fn()
		const canvas = createMockCanvasElement(drawImage)

		vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
			if (tagName === 'video') return video as unknown as HTMLElement
			if (tagName === 'canvas') return canvas as unknown as HTMLElement
			return originalCreateElement(tagName)
		}) as typeof document.createElement)

		const preview = await createLocalVideoUploadPreview(new File(['video'], 'clip.mp4', { type: 'video/mp4' }), {
			label: 'folder/clip.mp4',
		})

		expect(preview).toEqual({
			kind: 'video_frame',
			source: 'local',
			url: 'blob:video-preview',
			label: 'folder/clip.mp4',
			width: 240,
			height: 135,
		})
		expect(video.currentTime).toBe(1)
		expect(drawImage).toHaveBeenCalledTimes(1)
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video-source')
		expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:video-preview')
	})
})

function createMockVideoElement() {
	const listeners = new Map<string, Set<EventListener>>()
	let currentTimeValue = 0
	let srcValue = ''

	const addEventListener = vi.fn((eventName: string, handler: EventListener) => {
		const entry = listeners.get(eventName) ?? new Set<EventListener>()
		entry.add(handler)
		listeners.set(eventName, entry)
	})
	const removeEventListener = vi.fn((eventName: string, handler: EventListener) => {
		listeners.get(eventName)?.delete(handler)
	})
	const dispatch = (eventName: string) => {
		const handlers = Array.from(listeners.get(eventName) ?? [])
		for (const handler of handlers) {
			handler(new Event(eventName))
		}
	}

	const video = {
		preload: '',
		muted: false,
		playsInline: false,
		duration: 4,
		videoWidth: 1920,
		videoHeight: 1080,
		readyState: 0,
		pause: vi.fn(),
		load: vi.fn(),
		addEventListener,
		removeEventListener,
	} as unknown as HTMLVideoElement & {
		readyState: number
		duration: number
		videoWidth: number
		videoHeight: number
	}

	Object.defineProperty(video, 'src', {
		get: () => srcValue,
		set: (value: string) => {
			srcValue = value
			queueMicrotask(() => {
				video.readyState = 2
				dispatch('loadedmetadata')
				dispatch('loadeddata')
			})
		},
		configurable: true,
	})
	Object.defineProperty(video, 'currentTime', {
		get: () => currentTimeValue,
		set: (value: number) => {
			currentTimeValue = value
			queueMicrotask(() => dispatch('seeked'))
		},
		configurable: true,
	})

	return video
}

function createMockCanvasElement(drawImage: ReturnType<typeof vi.fn>) {
	return {
		width: 0,
		height: 0,
		getContext: vi.fn(() => ({ drawImage })),
		toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' }))),
	} as unknown as HTMLCanvasElement
}
