import { describe, expect, it } from 'vitest'

import {
	getObjectMediaStateDescriptor,
	getObjectPreviewDescriptor,
	getObjectPreviewLoadActionLabel,
	getObjectPreviewLoadButtonText,
	getObjectPreviewStateKey,
} from '../objectsMediaState'

describe('objectsMediaState', () => {
	it('uses distinct descriptors for failed thumbnails and failed previews', () => {
		expect(getObjectMediaStateDescriptor('thumbnail-unavailable')).toMatchObject({
			title: 'Thumbnail unavailable',
			shortLabel: 'Unavailable',
			recoveryHint: 'Open large preview or use Download.',
		})
		expect(getObjectMediaStateDescriptor('preview-failed')).toMatchObject({
			title: 'Preview failed',
			shortLabel: 'Failed',
			recoveryHint: 'Retry preview or use Download.',
		})
	})

	it('maps preview status to shared descriptor keys', () => {
		expect(getObjectPreviewStateKey(null)).toBe('preview-not-requested')
		expect(getObjectPreviewStateKey(null, true)).toBe('fallback-thumbnail-shown')
		expect(getObjectPreviewStateKey({ key: 'hero.png', status: 'loading', kind: 'image', contentType: 'image/png' })).toBe(
			'preview-loading',
		)
		expect(getObjectPreviewStateKey({ key: 'hero.png', status: 'blocked', kind: 'image', contentType: 'image/png' })).toBe(
			'preview-blocked',
		)
		expect(getObjectPreviewStateKey({ key: 'hero.png', status: 'blocked', kind: 'image', contentType: 'image/png', error: 'Preview canceled.' })).toBe(
			'preview-canceled',
		)
		expect(getObjectPreviewStateKey({ key: 'archive.zip', status: 'unsupported', kind: 'unsupported', contentType: null })).toBe(
			'preview-unsupported',
		)
		expect(getObjectPreviewStateKey({ key: 'hero.png', status: 'error', kind: 'image', contentType: 'image/png' })).toBe(
			'preview-failed',
		)
		expect(getObjectPreviewStateKey({ key: 'hero.png', status: 'ready', kind: 'image', contentType: 'image/png', url: 'blob:hero' })).toBe(
			'ready-image',
		)
		expect(getObjectPreviewStateKey({ key: 'clip.mp4', status: 'ready', kind: 'video', contentType: 'image/jpeg', url: 'blob:clip' })).toBe(
			'ready-video',
		)
		expect(getObjectPreviewStateKey({ key: 'config.json', status: 'ready', kind: 'json', contentType: 'application/json', text: '{}' })).toBe(
			'ready-json',
		)
		expect(getObjectPreviewStateKey({ key: 'readme.txt', status: 'ready', kind: 'text', contentType: 'text/plain', text: 'hello' })).toBe(
			'ready-text',
		)
	})

	it('exposes recovery labels for preview controls', () => {
		expect(getObjectPreviewDescriptor(null).title).toBe('Preview not loaded')
		expect(getObjectPreviewLoadActionLabel(null)).toBe('Load preview')
		expect(getObjectPreviewLoadButtonText(null)).toBe('Load')

		expect(getObjectPreviewLoadActionLabel({ key: 'hero.png', status: 'error', kind: 'image', contentType: 'image/png' })).toBe(
			'Retry preview',
		)
		expect(getObjectPreviewLoadButtonText({ key: 'hero.png', status: 'error', kind: 'image', contentType: 'image/png' })).toBe('Retry')

		expect(
			getObjectPreviewLoadActionLabel({
				key: 'hero.png',
				status: 'blocked',
				kind: 'image',
				contentType: 'image/png',
				error: 'Preview canceled.',
			}),
		).toBe('Retry preview')

		expect(getObjectPreviewLoadActionLabel({ key: 'hero.png', status: 'ready', kind: 'image', contentType: 'image/png', url: 'blob:hero' })).toBe(
			'Reload preview',
		)
		expect(getObjectPreviewLoadButtonText({ key: 'hero.png', status: 'ready', kind: 'image', contentType: 'image/png', url: 'blob:hero' })).toBe(
			'Reload',
		)
	})
})
