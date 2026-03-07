import type { UploadTaskPreview } from './transferTypes'

const READY_METADATA = 1
const READY_CURRENT_DATA = 2
const MAX_PREVIEW_SIDE = 240
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi'])

export function isVideoUploadFile(file: File): boolean {
	const type = (file.type ?? '').trim().toLowerCase()
	if (type.startsWith('video/')) return true
	const parts = file.name.toLowerCase().split('.')
	return parts.length > 1 ? VIDEO_EXTENSIONS.has(parts[parts.length - 1] ?? '') : false
}

export function pickVideoPreviewTime(durationSeconds: number): number {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0.25) return 0
	const safeEnd = Math.max(0, durationSeconds - 0.1)
	if (safeEnd <= 0) return 0
	return Math.min(1, safeEnd)
}

export async function createLocalVideoUploadPreview(
	file: File,
	args?: { label?: string },
): Promise<UploadTaskPreview | null> {
	if (!isVideoUploadFile(file)) return null
	if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null

	const sourceUrl = URL.createObjectURL(file)
	const video = document.createElement('video')
	video.preload = 'metadata'
	video.muted = true
	video.playsInline = true

	try {
		video.src = sourceUrl
		if (video.readyState < READY_METADATA) {
			await waitForMediaEvent(video, 'loadedmetadata')
		}

		const targetTime = pickVideoPreviewTime(video.duration)
		if (targetTime > 0.05) {
			video.currentTime = targetTime
			await waitForMediaEvent(video, 'seeked')
		} else if (video.readyState < READY_CURRENT_DATA) {
			await waitForMediaEvent(video, 'loadeddata')
		}

		const width = video.videoWidth || 0
		const height = video.videoHeight || 0
		if (width <= 0 || height <= 0) return null

		const { width: canvasWidth, height: canvasHeight } = scaleWithin(width, height, MAX_PREVIEW_SIDE)
		const canvas = document.createElement('canvas')
		canvas.width = canvasWidth
		canvas.height = canvasHeight
		const ctx = canvas.getContext('2d')
		if (!ctx) return null
		ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight)

		const blob = await canvasToBlob(canvas)
		if (!blob) return null

		return {
			kind: 'video_frame',
			source: 'local',
			url: URL.createObjectURL(blob),
			label: args?.label?.trim() || file.name,
			width: canvasWidth,
			height: canvasHeight,
		}
	} catch {
		return null
	} finally {
		try {
			video.pause()
		} catch {
			// ignore
		}
		video.src = ''
		revokeObjectURLSafe(sourceUrl)
	}
}

function waitForMediaEvent(video: HTMLVideoElement, eventName: 'loadedmetadata' | 'loadeddata' | 'seeked'): Promise<void> {
	return new Promise((resolve, reject) => {
		const onDone = () => {
			cleanup()
			resolve()
		}
		const onError = () => {
			cleanup()
			reject(new Error(`video ${eventName} failed`))
		}
		const cleanup = () => {
			video.removeEventListener(eventName, onDone)
			video.removeEventListener('error', onError)
		}
		video.addEventListener(eventName, onDone, { once: true })
		video.addEventListener('error', onError, { once: true })
	})
}

function scaleWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
	const scale = Math.min(1, maxSide / width, maxSide / height)
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	}
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
	return new Promise((resolve) => {
		if (typeof canvas.toBlob !== 'function') {
			resolve(null)
			return
		}
		canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82)
	})
}

export function revokeObjectURLSafe(url?: string | null) {
	if (!url || typeof URL.revokeObjectURL !== 'function') return
	URL.revokeObjectURL(url)
}
