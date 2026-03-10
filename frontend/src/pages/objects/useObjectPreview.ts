import { useCallback, useEffect, useRef, useState } from 'react'

import { APIClient, RequestAbortedError } from '../../api/client'
import type { ObjectMeta } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import {
	buildThumbnailCacheKey,
	setPersistentThumbnailBlob,
	type ThumbnailCache,
} from '../../lib/thumbnailCache'
import { formatBytes } from '../../lib/transfer'
import { buildObjectThumbnailRequest, getThumbnailFailureTtlMs, shouldCacheThumbnailFailure } from './objectPreviewPolicy'
import { loadObjectPreviewAsset } from './loadObjectPreviewAsset'
import { loadObjectThumbnailAsset } from './loadObjectThumbnailAsset'
import type { ObjectPreview } from './objectsTypes'
import { guessPreviewKind } from './objectsListUtils'

export const IMAGE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024
export const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024
const IMAGE_PREVIEW_THUMBNAIL_SIZE = 360
const VIDEO_PREVIEW_THUMBNAIL_SIZE = 360

type UseObjectPreviewArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	detailsKey: string | null
	detailsVisible: boolean
	detailsMeta: ObjectMeta | null
	downloadLinkProxyEnabled: boolean
	presignedDownloadSupported: boolean
	thumbnailCache?: ThumbnailCache
}

export type ObjectPreviewResult = {
	preview: ObjectPreview | null
	loadPreview: () => Promise<void>
	cancelPreview: () => void
	canCancelPreview: boolean
}

export function useObjectPreview(args: UseObjectPreviewArgs): ObjectPreviewResult {
	const [preview, setPreview] = useState<ObjectPreview | null>(null)
	const previewAbortRef = useRef<(() => void) | null>(null)
	const previewURLRef = useRef<string | null>(null)
	const previewURLOwnedRef = useRef(false)

	const cleanupPreview = useCallback(() => {
		previewAbortRef.current?.()
		previewAbortRef.current = null
		if (previewURLRef.current && previewURLOwnedRef.current) {
			URL.revokeObjectURL(previewURLRef.current)
		}
		previewURLRef.current = null
		previewURLOwnedRef.current = false
	}, [])

	useEffect(() => {
		cleanupPreview()
		setPreview(null)
	}, [cleanupPreview, args.detailsKey, args.detailsVisible])

	useEffect(() => () => cleanupPreview(), [cleanupPreview])

	const loadPreview = useCallback(async () => {
		if (!args.profileId || !args.bucket || !args.detailsMeta) return
		if (preview?.status === 'loading') return

		const key = args.detailsMeta.key
		const kind = guessPreviewKind(args.detailsMeta.contentType, key)
		const contentType = args.detailsMeta.contentType ?? null
		const size = typeof args.detailsMeta.size === 'number' && Number.isFinite(args.detailsMeta.size) ? args.detailsMeta.size : 0

		if (kind === 'unsupported') {
			setPreview({ key, status: 'unsupported', kind: 'unsupported', contentType, error: 'Preview not supported' })
			return
		}

		const maxBytes = kind === 'image' ? IMAGE_PREVIEW_MAX_BYTES : TEXT_PREVIEW_MAX_BYTES
		if (kind !== 'video' && size > maxBytes) {
			setPreview({
				key,
				status: 'blocked',
				kind,
				contentType,
				error: `Preview is limited to ${formatBytes(maxBytes)}. This object is ${formatBytes(size)}.`,
			})
			return
		}

		cleanupPreview()
		setPreview({ key, status: 'loading', kind, contentType })

		if (kind === 'video') {
			const thumbnailRequest = buildObjectThumbnailRequest({
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
			previewAbortRef.current = handle.abort
			try {
				const resp = await handle.promise
				previewAbortRef.current = null
				previewURLRef.current = resp.url
				previewURLOwnedRef.current = resp.owned
				setPreview({ key, status: 'ready', kind: 'video', contentType: resp.contentType ?? contentType, url: resp.url })
				return
			} catch (err) {
				previewAbortRef.current = null
				if (err instanceof RequestAbortedError) {
					setPreview({ key, status: 'blocked', kind, contentType, error: 'Preview canceled.' })
					return
				}
				if (args.thumbnailCache && shouldCacheThumbnailFailure(err)) {
					args.thumbnailCache.markFailed(cacheKey, getThumbnailFailureTtlMs(err))
				}
				setPreview({ key, status: 'error', kind, contentType, error: formatErr(err) })
				return
			}
		}

		const controller = new AbortController()
		previewAbortRef.current = () => controller.abort()
		try {
			const resp = await loadObjectPreviewAsset({
				api: args.api,
				profileId: args.profileId,
				bucket: args.bucket,
				key,
				size,
				contentType: args.detailsMeta?.contentType ?? undefined,
				lastModified: args.detailsMeta?.lastModified ?? undefined,
				maxBytes,
				downloadLinkProxyEnabled: args.downloadLinkProxyEnabled,
				presignedDownloadSupported: args.presignedDownloadSupported,
				signal: controller.signal,
			})
			previewAbortRef.current = null
			const effectiveContentType = resp.contentType ?? contentType

			if (kind === 'image') {
				const thumbnailRequest = buildObjectThumbnailRequest({
					profileId: args.profileId,
					bucket: args.bucket,
					objectKey: key,
					size: IMAGE_PREVIEW_THUMBNAIL_SIZE,
					etag: args.detailsMeta.etag,
					lastModified: args.detailsMeta.lastModified,
				})
				const thumbnailCacheKey = buildThumbnailCacheKey(thumbnailRequest)
				await setPersistentThumbnailBlob(thumbnailCacheKey, resp.blob)
				const url = URL.createObjectURL(resp.blob)
				if (args.thumbnailCache) {
					args.thumbnailCache.set(thumbnailCacheKey, url)
					previewURLOwnedRef.current = false
				} else {
					previewURLOwnedRef.current = true
				}
				previewURLRef.current = url
				setPreview({ key, status: 'ready', kind: 'image', contentType: effectiveContentType, url })
				return
			}

			const rawText = await resp.blob.text()
			const maxChars = 200_000
			const truncated = rawText.length > maxChars
			let text = truncated ? rawText.slice(0, maxChars) : rawText

			if (kind === 'json') {
				try {
					text = JSON.stringify(JSON.parse(text), null, 2)
				} catch {
					// keep raw text
				}
			}

			setPreview({ key, status: 'ready', kind, contentType: effectiveContentType, text, truncated })
		} catch (err) {
			previewAbortRef.current = null
			if (err instanceof RequestAbortedError || (err instanceof Error && err.name === 'AbortError')) {
				setPreview({ key, status: 'blocked', kind, contentType, error: 'Preview canceled.' })
				return
			}
			setPreview({ key, status: 'error', kind, contentType, error: formatErr(err) })
		}
	}, [
		args.api,
		args.bucket,
		args.detailsMeta,
		args.downloadLinkProxyEnabled,
		args.presignedDownloadSupported,
		args.profileId,
		args.thumbnailCache,
		cleanupPreview,
		preview?.status,
	])

	const cancelPreview = useCallback(() => {
		previewAbortRef.current?.()
	}, [])

	return {
		preview,
		loadPreview,
		cancelPreview,
		canCancelPreview: !!previewAbortRef.current,
	}
}
