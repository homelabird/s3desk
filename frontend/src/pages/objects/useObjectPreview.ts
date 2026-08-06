import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { APIClientShape } from '../../api/client'
import type { ObjectMeta } from '../../api/types'
import type { ThumbnailCache } from '../../lib/thumbnailCache'
import { guessPreviewKind } from './objectsListUtils'
import type { ObjectPreview } from './objectsTypes'

type UseObjectPreviewArgs = {
	api: APIClientShape
	apiToken: string
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
	const [previewState, setPreviewState] = useState<{ scopeKey: string | null; preview: ObjectPreview | null }>({
		scopeKey: null,
		preview: null,
	})
	const previewAbortRef = useRef<(() => void) | null>(null)
	const previewURLRef = useRef<string | null>(null)
	const previewURLOwnedRef = useRef(false)
	const previewScopeKey = `${args.apiToken}:${args.profileId ?? ''}:${args.bucket}:${args.detailsKey ?? ''}:${args.detailsVisible ? 'visible' : 'hidden'}`
	const previewScopeKeyRef = useRef(previewScopeKey)
	const previewRequestIdRef = useRef(0)

	const setPreviewAbort = useCallback((abort: (() => void) | null) => {
		previewAbortRef.current = abort
	}, [])

	const cleanupPreview = useCallback(() => {
		previewRequestIdRef.current += 1
		previewAbortRef.current?.()
		setPreviewAbort(null)
		if (previewURLRef.current && previewURLOwnedRef.current && typeof URL.revokeObjectURL === 'function') {
			URL.revokeObjectURL(previewURLRef.current)
		}
		previewURLRef.current = null
		previewURLOwnedRef.current = false
	}, [setPreviewAbort])

	useLayoutEffect(() => {
		previewScopeKeyRef.current = previewScopeKey
		cleanupPreview()
	}, [cleanupPreview, previewScopeKey])

	useEffect(() => () => cleanupPreview(), [cleanupPreview])

	const visiblePreview =
		args.detailsVisible &&
		args.detailsKey &&
		previewState.scopeKey === previewScopeKey &&
		previewState.preview?.key === args.detailsKey
			? previewState.preview
			: null

	const loadPreview = useCallback(async () => {
		if (!args.profileId || !args.bucket || !args.detailsMeta) return
		if (visiblePreview?.status === 'loading') return

		const key = args.detailsMeta.key
		const detailsMeta = args.detailsMeta
		const kind = guessPreviewKind(detailsMeta.contentType, key)
		const contentType = detailsMeta.contentType ?? null
		const requestScopeKey = `${args.apiToken}:${args.profileId}:${args.bucket}:${key}:${args.detailsVisible ? 'visible' : 'hidden'}`
		cleanupPreview()
		const requestId = previewRequestIdRef.current + 1
		previewRequestIdRef.current = requestId
		const isStale = () =>
			previewRequestIdRef.current !== requestId || previewScopeKeyRef.current !== requestScopeKey
		const commitPreview = (next: ObjectPreview | null) => {
			if (isStale()) return false
			setPreviewState({ scopeKey: requestScopeKey, preview: next })
			return true
		}
		if (kind !== 'unsupported') {
			commitPreview({ key, status: 'loading', kind, contentType })
			setPreviewAbort(() => {
				previewRequestIdRef.current += 1
				setPreviewAbort(null)
			})
		}
		const { loadObjectPreviewRuntime } = await import('./objectPreviewRuntime')
		if (isStale()) return
		await loadObjectPreviewRuntime({
			api: args.api,
			apiToken: args.apiToken,
			profileId: args.profileId,
			bucket: args.bucket,
			detailsMeta,
			downloadLinkProxyEnabled: args.downloadLinkProxyEnabled,
			presignedDownloadSupported: args.presignedDownloadSupported,
			thumbnailCache: args.thumbnailCache,
			isStale,
			commitPreview,
			setPreviewAbort,
			setPreviewURL: (url, owned) => {
				previewURLRef.current = url
				previewURLOwnedRef.current = owned
			},
		})
	}, [
		args.api,
		args.apiToken,
		args.bucket,
		args.detailsMeta,
		args.downloadLinkProxyEnabled,
		args.presignedDownloadSupported,
		args.profileId,
		args.thumbnailCache,
		cleanupPreview,
		args.detailsVisible,
		visiblePreview?.status,
		setPreviewAbort,
	])

	const cancelPreview = useCallback(() => {
		if (visiblePreview?.status === 'loading') {
			previewRequestIdRef.current += 1
		}
		previewAbortRef.current?.()
		setPreviewAbort(null)
		if (visiblePreview?.status !== 'loading') return
		setPreviewState((current) =>
			current.scopeKey === previewScopeKey &&
			current.preview?.key === visiblePreview.key &&
			current.preview.status === 'loading'
				? {
						scopeKey: previewScopeKey,
						preview: {
							key: visiblePreview.key,
							status: 'blocked',
							kind: visiblePreview.kind,
							contentType: visiblePreview.contentType,
							error: 'Preview canceled.',
						},
					}
				: current,
		)
	}, [previewScopeKey, setPreviewAbort, visiblePreview])

	return {
		preview: visiblePreview,
		loadPreview,
		cancelPreview,
		canCancelPreview: visiblePreview?.status === 'loading',
	}
}
