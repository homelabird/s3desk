import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'

import { APIClient, RequestAbortedError } from '../../api/client'
import type { ObjectMeta } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import {
	buildThumbnailCacheKey,
	getReusablePersistentThumbnailBlob,
	setPersistentThumbnailBlob,
	type ThumbnailCache,
} from '../../lib/thumbnailCache'
import { formatBytes } from '../../lib/transfer'
import type { ObjectPreview } from './objectsTypes'
import { guessPreviewKind } from './objectsListUtils'

export const IMAGE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024
export const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024
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
			message.info(`Preview is limited to ${formatBytes(maxBytes)} (object is ${formatBytes(size)})`)
			return
		}

		cleanupPreview()
		setPreview({ key, status: 'loading', kind, contentType })

		if (kind === 'video') {
			const thumbnailRequest = {
				profileId: args.profileId,
				bucket: args.bucket,
				objectKey: key,
				size: VIDEO_PREVIEW_THUMBNAIL_SIZE,
				cacheKeySuffix: args.detailsMeta.etag || args.detailsMeta.lastModified || undefined,
			}
			const cacheKey = buildThumbnailCacheKey(thumbnailRequest)
			const cachedMatch = args.thumbnailCache?.findBestMatch(thumbnailRequest) ?? null
			if (cachedMatch) {
				previewURLRef.current = cachedMatch.url
				previewURLOwnedRef.current = false
				setPreview({ key, status: 'ready', kind: 'video', contentType, url: cachedMatch.url })
				return
			}
			const cachedBlob = await getReusablePersistentThumbnailBlob(thumbnailRequest)
			if (cachedBlob) {
				const url = URL.createObjectURL(cachedBlob.blob)
				if (args.thumbnailCache) {
					args.thumbnailCache.set(cachedBlob.cacheKey, url)
					previewURLOwnedRef.current = false
				} else {
					previewURLOwnedRef.current = true
				}
				previewURLRef.current = url
				setPreview({ key, status: 'ready', kind: 'video', contentType: cachedBlob.blob.type || contentType, url })
				return
			}
			const handle = args.api.downloadObjectThumbnail({
				profileId: args.profileId!,
				bucket: args.bucket,
				key,
				size: VIDEO_PREVIEW_THUMBNAIL_SIZE,
			})
			previewAbortRef.current = handle.abort
			try {
				const resp = await handle.promise
				previewAbortRef.current = null
				await setPersistentThumbnailBlob(cacheKey, resp.blob)
				const url = URL.createObjectURL(resp.blob)
				if (args.thumbnailCache) {
					args.thumbnailCache.set(cacheKey, url)
					previewURLOwnedRef.current = false
				} else {
					previewURLOwnedRef.current = true
				}
				previewURLRef.current = url
				setPreview({ key, status: 'ready', kind: 'video', contentType: resp.contentType ?? contentType, url })
				return
			} catch (err) {
				previewAbortRef.current = null
				if (err instanceof RequestAbortedError) {
					message.info('Preview canceled')
					setPreview(null)
					return
				}
				setPreview({ key, status: 'error', kind, contentType, error: formatErr(err) })
				return
			}
		}

		const controller = new AbortController()
		previewAbortRef.current = () => controller.abort()
		try {
			const fetchPreview = async (useProxy: boolean, signal: AbortSignal) => {
				const presigned = await args.api.getObjectDownloadURL({
					profileId: args.profileId!,
					bucket: args.bucket,
					key,
					proxy: useProxy,
				})
				const res = await fetch(presigned.url, { signal })
				if (!res.ok) {
					throw new Error(`Download failed (HTTP ${res.status})`)
				}
				return {
					blob: await res.blob(),
					contentType: res.headers.get('content-type'),
				}
			}

			const shouldFallback = (err: unknown) => {
				if (controller.signal.aborted) return false
				if (err instanceof RequestAbortedError) return false
				if (err instanceof Error && err.name === 'AbortError') return false
				if (err instanceof TypeError) return true
				if (err instanceof Error && /cors|failed to fetch|network/i.test(err.message)) return true
				return false
			}

			const proxyFirst = args.downloadLinkProxyEnabled || !args.presignedDownloadSupported || size > maxBytes / 2
			const allowDirect = args.presignedDownloadSupported && !args.downloadLinkProxyEnabled
			const directTimeoutMs = 1500
			const fetchDirectWithTimeout = async () => {
				const directController = new AbortController()
				const onAbort = () => directController.abort()
				const timeoutId = setTimeout(() => directController.abort(), directTimeoutMs)
				controller.signal.addEventListener('abort', onAbort)
				try {
					return await fetchPreview(false, directController.signal)
				} catch (err) {
					if (controller.signal.aborted) throw err
					if (directController.signal.aborted) return null
					if (!shouldFallback(err)) throw err
					return null
				} finally {
					clearTimeout(timeoutId)
					controller.signal.removeEventListener('abort', onAbort)
				}
			}

			let resp: { blob: Blob; contentType: string | null } | null = null
			if (proxyFirst) {
				try {
					resp = await fetchPreview(true, controller.signal)
				} catch (err) {
					if (!shouldFallback(err) || !allowDirect) {
						throw err
					}
				}
			}

			if (!resp && allowDirect) {
				resp = await fetchDirectWithTimeout()
			}

			if (!resp) {
				resp = await fetchPreview(true, controller.signal)
			}
			previewAbortRef.current = null
			const effectiveContentType = resp.contentType ?? contentType

			if (kind === 'image') {
				const url = URL.createObjectURL(resp.blob)
				previewURLRef.current = url
				previewURLOwnedRef.current = true
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
				message.info('Preview canceled')
				setPreview(null)
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
