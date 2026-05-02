import { RequestAbortedError, type APIClientShape } from '../../api/client'
import type { ObjectMeta } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import {
	buildThumbnailCacheKey,
	setPersistentThumbnailBlob,
	type ThumbnailCache,
} from '../../lib/thumbnailCache'
import { formatBytes } from '../../lib/transfer'
import { loadObjectPreviewAsset } from './loadObjectPreviewAsset'
import { loadObjectThumbnailAsset } from './loadObjectThumbnailAsset'
import {
	buildObjectThumbnailRequest,
	getThumbnailFailureTtlMs,
	shouldCacheThumbnailFailure,
} from './objectPreviewPolicy'
import { IMAGE_PREVIEW_MAX_BYTES, TEXT_PREVIEW_MAX_BYTES } from './objectPreviewLimits'
import { guessPreviewKind } from './objectsListUtils'
import type { ObjectPreview } from './objectsTypes'

const IMAGE_PREVIEW_THUMBNAIL_SIZE = 360
const VIDEO_PREVIEW_THUMBNAIL_SIZE = 360
const TEXT_PREVIEW_MAX_CHARS = 200_000

type LoadObjectPreviewRuntimeArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string
	bucket: string
	detailsMeta: ObjectMeta
	downloadLinkProxyEnabled: boolean
	presignedDownloadSupported: boolean
	thumbnailCache?: ThumbnailCache
	isStale: () => boolean
	commitPreview: (next: ObjectPreview | null) => boolean
	setPreviewAbort: (abort: (() => void) | null) => void
	setPreviewURL: (url: string | null, owned: boolean) => void
}

export async function loadObjectPreviewRuntime(args: LoadObjectPreviewRuntimeArgs): Promise<void> {
	const key = args.detailsMeta.key
	const kind = guessPreviewKind(args.detailsMeta.contentType, key)
	const contentType = args.detailsMeta.contentType ?? null
	const size = typeof args.detailsMeta.size === 'number' && Number.isFinite(args.detailsMeta.size) ? args.detailsMeta.size : 0

	if (kind === 'unsupported') {
		args.commitPreview({ key, status: 'unsupported', kind: 'unsupported', contentType, error: 'Preview not supported' })
		return
	}

	const maxBytes = kind === 'image' ? IMAGE_PREVIEW_MAX_BYTES : TEXT_PREVIEW_MAX_BYTES
	if (kind !== 'video' && size > maxBytes) {
		args.commitPreview({
			key,
			status: 'blocked',
			kind,
			contentType,
			error: `Preview is limited to ${formatBytes(maxBytes)}. This object is ${formatBytes(size)}.`,
		})
		return
	}

	args.commitPreview({ key, status: 'loading', kind, contentType })

	if (kind === 'video') {
		await loadVideoPreview(args, key, contentType)
		return
	}

	await loadTextOrImagePreview(args, key, kind, contentType, size, maxBytes)
}

async function loadVideoPreview(
	args: LoadObjectPreviewRuntimeArgs,
	key: string,
	contentType: string | null,
): Promise<void> {
	if (args.isStale()) return
	const thumbnailRequest = buildObjectThumbnailRequest({
		apiToken: args.apiToken,
		profileId: args.profileId,
		bucket: args.bucket,
		objectKey: key,
		size: VIDEO_PREVIEW_THUMBNAIL_SIZE,
		etag: args.detailsMeta.etag,
		lastModified: args.detailsMeta.lastModified,
	})
	const cacheKey = buildThumbnailCacheKey(thumbnailRequest)
	const handle = loadObjectThumbnailAsset({
		api: args.api,
		request: thumbnailRequest,
		cache: args.thumbnailCache,
		objectSize: args.detailsMeta.size,
		etag: args.detailsMeta.etag ?? undefined,
		lastModified: args.detailsMeta.lastModified ?? undefined,
		contentType: args.detailsMeta.contentType ?? undefined,
	})
	args.setPreviewAbort(handle.abort)
	try {
		const resp = await handle.promise
		if (args.isStale()) {
			if (resp.owned && typeof URL.revokeObjectURL === 'function') {
				URL.revokeObjectURL(resp.url)
			}
			return
		}
		args.setPreviewAbort(null)
		args.setPreviewURL(resp.url, resp.owned)
		args.commitPreview({ key, status: 'ready', kind: 'video', contentType: resp.contentType ?? contentType, url: resp.url })
	} catch (err) {
		args.setPreviewAbort(null)
		if (args.isStale()) return
		if (err instanceof RequestAbortedError) {
			args.commitPreview({ key, status: 'blocked', kind: 'video', contentType, error: 'Preview canceled.' })
			return
		}
		if (args.thumbnailCache && shouldCacheThumbnailFailure(err)) {
			args.thumbnailCache.markFailed(cacheKey, getThumbnailFailureTtlMs(err))
		}
		args.commitPreview({ key, status: 'error', kind: 'video', contentType, error: formatErr(err) })
	}
}

async function loadTextOrImagePreview(
	args: LoadObjectPreviewRuntimeArgs,
	key: string,
	kind: 'image' | 'json' | 'text',
	contentType: string | null,
	size: number,
	maxBytes: number,
): Promise<void> {
	const controller = new AbortController()
	args.setPreviewAbort(() => controller.abort())
	try {
		const resp = await loadObjectPreviewAsset({
			api: args.api,
			profileId: args.profileId,
			bucket: args.bucket,
			key,
			size,
			contentType: args.detailsMeta.contentType ?? undefined,
			lastModified: args.detailsMeta.lastModified ?? undefined,
			maxBytes,
			downloadLinkProxyEnabled: args.downloadLinkProxyEnabled,
			presignedDownloadSupported: args.presignedDownloadSupported,
			signal: controller.signal,
		})
		if (args.isStale()) return
		args.setPreviewAbort(null)
		const effectiveContentType = resp.contentType ?? contentType

		if (kind === 'image') {
			await commitImagePreview(args, key, effectiveContentType, resp.blob)
			return
		}

		const rawText = await resp.blob.text()
		const truncated = rawText.length > TEXT_PREVIEW_MAX_CHARS
		let text = truncated ? rawText.slice(0, TEXT_PREVIEW_MAX_CHARS) : rawText

		if (kind === 'json') {
			try {
				text = JSON.stringify(JSON.parse(text), null, 2)
			} catch {
				// Keep the raw text when the object advertises JSON but is not parseable.
			}
		}

		args.commitPreview({ key, status: 'ready', kind, contentType: effectiveContentType, text, truncated })
	} catch (err) {
		args.setPreviewAbort(null)
		if (args.isStale()) return
		if (err instanceof RequestAbortedError || (err instanceof Error && err.name === 'AbortError')) {
			args.commitPreview({ key, status: 'blocked', kind, contentType, error: 'Preview canceled.' })
			return
		}
		args.commitPreview({ key, status: 'error', kind, contentType, error: formatErr(err) })
	}
}

async function commitImagePreview(
	args: LoadObjectPreviewRuntimeArgs,
	key: string,
	contentType: string | null,
	blob: Blob,
): Promise<void> {
	const thumbnailRequest = buildObjectThumbnailRequest({
		apiToken: args.apiToken,
		profileId: args.profileId,
		bucket: args.bucket,
		objectKey: key,
		size: IMAGE_PREVIEW_THUMBNAIL_SIZE,
		etag: args.detailsMeta.etag,
		lastModified: args.detailsMeta.lastModified,
	})
	const thumbnailCacheKey = buildThumbnailCacheKey(thumbnailRequest)
	await setPersistentThumbnailBlob(thumbnailCacheKey, blob)
	if (args.isStale()) return
	const url = URL.createObjectURL(blob)
	if (args.thumbnailCache) {
		args.thumbnailCache.set(thumbnailCacheKey, url)
		args.setPreviewURL(url, false)
	} else {
		args.setPreviewURL(url, true)
	}
	if (!args.commitPreview({ key, status: 'ready', kind: 'image', contentType, url }) && !args.thumbnailCache) {
		URL.revokeObjectURL(url)
	}
}
