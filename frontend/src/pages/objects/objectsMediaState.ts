import type { ObjectPreview } from './objectsTypes'

export type ObjectMediaStateKey =
	| 'thumbnail-loading'
	| 'thumbnail-unavailable'
	| 'preview-not-requested'
	| 'preview-loading'
	| 'preview-blocked'
	| 'preview-canceled'
	| 'preview-unsupported'
	| 'preview-failed'
	| 'ready-image'
	| 'ready-video'
	| 'ready-text'
	| 'ready-json'
	| 'fallback-thumbnail-shown'

export type ObjectMediaStateTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type ObjectMediaStateDescriptor = {
	key: ObjectMediaStateKey
	title: string
	shortLabel: string
	tone: ObjectMediaStateTone
	recoveryHint: string
	actionLabel?: string
}

const OBJECT_MEDIA_STATE_DESCRIPTORS: Record<ObjectMediaStateKey, ObjectMediaStateDescriptor> = {
	'thumbnail-loading': {
		key: 'thumbnail-loading',
		title: 'Thumbnail loading',
		shortLabel: 'Loading',
		tone: 'neutral',
		recoveryHint: 'Fetching thumbnail.',
	},
	'thumbnail-unavailable': {
		key: 'thumbnail-unavailable',
		title: 'Thumbnail unavailable',
		shortLabel: 'Unavailable',
		tone: 'warning',
		recoveryHint: 'Open large preview or use Download.',
		actionLabel: 'Open large preview',
	},
	'preview-not-requested': {
		key: 'preview-not-requested',
		title: 'Preview not loaded',
		shortLabel: 'Not loaded',
		tone: 'neutral',
		recoveryHint: 'Use Load preview to fetch a larger preview.',
		actionLabel: 'Load preview',
	},
	'preview-loading': {
		key: 'preview-loading',
		title: 'Preview loading',
		shortLabel: 'Loading',
		tone: 'neutral',
		recoveryHint: 'Fetching preview.',
		actionLabel: 'Cancel preview',
	},
	'preview-blocked': {
		key: 'preview-blocked',
		title: 'Preview too large',
		shortLabel: 'Too large',
		tone: 'info',
		recoveryHint: 'Use Download or URL to view the original file.',
		actionLabel: 'Use Download',
	},
	'preview-canceled': {
		key: 'preview-canceled',
		title: 'Preview canceled',
		shortLabel: 'Canceled',
		tone: 'neutral',
		recoveryHint: 'Retry preview or use Download.',
		actionLabel: 'Retry preview',
	},
	'preview-unsupported': {
		key: 'preview-unsupported',
		title: 'Unsupported preview type',
		shortLabel: 'Unsupported',
		tone: 'neutral',
		recoveryHint: 'Use Download for this file type.',
		actionLabel: 'Unsupported for this type',
	},
	'preview-failed': {
		key: 'preview-failed',
		title: 'Preview failed',
		shortLabel: 'Failed',
		tone: 'danger',
		recoveryHint: 'Retry preview or use Download.',
		actionLabel: 'Retry preview',
	},
	'ready-image': {
		key: 'ready-image',
		title: 'Image preview ready',
		shortLabel: 'Ready',
		tone: 'success',
		recoveryHint: 'Open large preview for zoom and pan controls.',
		actionLabel: 'Open large preview',
	},
	'ready-video': {
		key: 'ready-video',
		title: 'Video thumbnail ready',
		shortLabel: 'Ready',
		tone: 'success',
		recoveryHint: 'Preview shows an extracted thumbnail frame.',
		actionLabel: 'Open large preview',
	},
	'ready-text': {
		key: 'ready-text',
		title: 'Text preview ready',
		shortLabel: 'Ready',
		tone: 'success',
		recoveryHint: 'Use Download for the original file.',
	},
	'ready-json': {
		key: 'ready-json',
		title: 'JSON preview ready',
		shortLabel: 'Ready',
		tone: 'success',
		recoveryHint: 'Use Download for the original file.',
	},
	'fallback-thumbnail-shown': {
		key: 'fallback-thumbnail-shown',
		title: 'Fallback thumbnail shown',
		shortLabel: 'Fallback',
		tone: 'info',
		recoveryHint: 'Use Load preview to fetch a larger thumbnail frame.',
		actionLabel: 'Load preview',
	},
}

export function getObjectMediaStateDescriptor(key: ObjectMediaStateKey): ObjectMediaStateDescriptor {
	return OBJECT_MEDIA_STATE_DESCRIPTORS[key]
}

export function getObjectPreviewStateKey(preview: ObjectPreview | null, hasFallbackThumbnail = false): ObjectMediaStateKey {
	if (!preview) return hasFallbackThumbnail ? 'fallback-thumbnail-shown' : 'preview-not-requested'
	if (preview.status === 'loading') return 'preview-loading'
	if (preview.status === 'blocked') return preview.error === 'Preview canceled.' ? 'preview-canceled' : 'preview-blocked'
	if (preview.status === 'error') return 'preview-failed'
	if (preview.status === 'unsupported') return 'preview-unsupported'
	if (preview.kind === 'image') return 'ready-image'
	if (preview.kind === 'video') return 'ready-video'
	if (preview.kind === 'json') return 'ready-json'
	if (preview.kind === 'text') return 'ready-text'
	return 'preview-unsupported'
}

export function getObjectPreviewDescriptor(
	preview: ObjectPreview | null,
	hasFallbackThumbnail = false,
): ObjectMediaStateDescriptor {
	return getObjectMediaStateDescriptor(getObjectPreviewStateKey(preview, hasFallbackThumbnail))
}

export function getObjectPreviewLoadActionLabel(preview: ObjectPreview | null): string {
	if (!preview) return 'Load preview'
	if (preview.status === 'error') return 'Retry preview'
	if (preview.status === 'blocked' && preview.error === 'Preview canceled.') return 'Retry preview'
	if (preview.status === 'ready') return 'Reload preview'
	return 'Load preview'
}

export function getObjectPreviewLoadButtonText(preview: ObjectPreview | null): string {
	const label = getObjectPreviewLoadActionLabel(preview)
	if (label === 'Retry preview') return 'Retry'
	if (label === 'Reload preview') return 'Reload'
	return 'Load'
}
