import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'

import { APIClient, RequestAbortedError } from '../../api/client'
import type { ObjectMeta } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { formatBytes } from '../../lib/transfer'
import type { ObjectPreview } from './objectsTypes'
import { guessPreviewKind } from './objectsListUtils'

type UseObjectPreviewArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	detailsKey: string | null
	detailsVisible: boolean
	detailsMeta: ObjectMeta | null
	downloadLinkProxyEnabled: boolean
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

	const cleanupPreview = useCallback(() => {
		previewAbortRef.current?.()
		previewAbortRef.current = null
		if (previewURLRef.current) {
			URL.revokeObjectURL(previewURLRef.current)
			previewURLRef.current = null
		}
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

		const maxBytes = kind === 'image' ? 10 * 1024 * 1024 : 2 * 1024 * 1024
		if (size > maxBytes) {
			message.info(`Preview is limited to ${formatBytes(maxBytes)} (object is ${formatBytes(size)})`)
			return
		}

		cleanupPreview()
		setPreview({ key, status: 'loading', kind, contentType })

		const controller = new AbortController()
		previewAbortRef.current = () => controller.abort()
		try {
			const fetchPreview = async (useProxy: boolean) => {
				const presigned = await args.api.getObjectDownloadURL({
					profileId: args.profileId!,
					bucket: args.bucket,
					key,
					proxy: useProxy,
				})
				const res = await fetch(presigned.url, { signal: controller.signal })
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

			let resp: { blob: Blob; contentType: string | null }
			if (args.downloadLinkProxyEnabled) {
				resp = await fetchPreview(true)
			} else {
				try {
					resp = await fetchPreview(false)
				} catch (err) {
					if (!shouldFallback(err)) {
						throw err
					}
					resp = await fetchPreview(true)
				}
			}
			previewAbortRef.current = null
			const effectiveContentType = resp.contentType ?? contentType

			if (kind === 'image') {
				const url = URL.createObjectURL(resp.blob)
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
				message.info('Preview canceled')
				setPreview(null)
				return
			}
			setPreview({ key, status: 'error', kind, contentType, error: formatErr(err) })
		}
	}, [args.api, args.bucket, args.detailsMeta, args.downloadLinkProxyEnabled, args.profileId, cleanupPreview, preview?.status])

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
