import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { APIClient } from '../../api/client'
import type { ObjectItem, ObjectMeta } from '../../api/types'
import type { ThumbnailCache } from '../../lib/thumbnailCache'
import { ObjectThumbnail } from './ObjectThumbnail'
import { isImageKey, isThumbnailCandidate } from './objectsListUtils'
import type { ObjectPreview } from './objectsTypes'
import { useObjectPreview } from './useObjectPreview'

type PageLike = {
	items: ObjectItem[]
}

type Args = {
	api: APIClient
	apiToken: string
	profileId: string | null
	profileProvider?: string | null
	bucket: string
	selectedKeys: Set<string>
	selectedCount: number
	detailsVisible: boolean
	favoritesOnly: boolean
	favoriteItems: ObjectItem[]
	objectPages?: PageLike[]
	downloadLinkProxyEnabled: boolean
	presignedDownloadSupported: boolean
	showThumbnails: boolean
	thumbnailCache: ThumbnailCache
	setSelectedKeys: (next: Set<string>) => void
	setLastSelectedObjectKey: (key: string | null) => void
	setDetailsDrawerOpen: (open: boolean) => void
}

type PreviewState = {
	preview: ObjectPreview | null
	loadPreview: () => void
	cancelPreview: () => void
	canCancelPreview: boolean
}

type QueryState<T> = {
	data: T | null
	error: unknown | null
	isFetching: boolean
	isError: boolean
	refetch: () => void
}

export function useObjectsScreenPreviewState({
	api,
	apiToken,
	profileId,
	bucket,
	selectedKeys,
	selectedCount,
	detailsVisible,
	favoritesOnly,
	favoriteItems,
	objectPages,
	downloadLinkProxyEnabled,
	presignedDownloadSupported,
	showThumbnails,
	thumbnailCache,
	setSelectedKeys,
	setLastSelectedObjectKey,
	setDetailsDrawerOpen,
}: Args) {
	const previewScopeKey = `${profileId ?? ''}:${bucket}`
	const [largePreviewSession, setLargePreviewSession] = useState<{ scopeKey: string; key: string | null; open: boolean }>({
		scopeKey: previewScopeKey,
		key: null,
		open: false,
	})
	const largePreviewScopeMatches = largePreviewSession.scopeKey === previewScopeKey
	const largePreviewKey = largePreviewScopeMatches ? largePreviewSession.key : null
	const largePreviewOpen = largePreviewScopeMatches ? largePreviewSession.open : false

	const objectByKey = useMemo(() => {
		const out = new Map<string, ObjectItem>()
		if (favoritesOnly) {
			for (const obj of favoriteItems) out.set(obj.key, obj)
			return out
		}
		for (const page of objectPages ?? []) {
			for (const obj of page.items) out.set(obj.key, obj)
		}
		return out
	}, [favoriteItems, favoritesOnly, objectPages])

	const singleSelectedKey = selectedCount === 1 ? Array.from(selectedKeys)[0] : null
	const singleSelectedItem = singleSelectedKey ? objectByKey.get(singleSelectedKey) : undefined
	const detailsKey = detailsVisible ? singleSelectedKey : null

	const detailsMetaQueryRaw = useQuery({
		queryKey: ['objectMeta', profileId, bucket, detailsKey, apiToken],
		enabled: !!profileId && !!bucket && !!detailsKey && detailsVisible,
		queryFn: () => api.objects.getObjectMeta({ profileId: profileId!, bucket, key: detailsKey! }),
		retry: false,
	})
	const detailsMetaQuery: QueryState<ObjectMeta> = {
		data: detailsMetaQueryRaw.data ?? null,
		error: detailsMetaQueryRaw.error ?? null,
		isFetching: detailsMetaQueryRaw.isFetching,
		isError: detailsMetaQueryRaw.isError,
		refetch: () => void detailsMetaQueryRaw.refetch(),
	}
	const detailsMeta = detailsMetaQuery.data

	const detailsPreview: PreviewState = useObjectPreview({
		api,
		profileId,
		bucket,
		detailsKey,
		detailsVisible,
		detailsMeta,
		downloadLinkProxyEnabled,
		presignedDownloadSupported,
		thumbnailCache,
	})

	const largePreviewMetaQueryRaw = useQuery({
		queryKey: ['objectMeta', profileId, bucket, largePreviewKey, apiToken],
		enabled: !!profileId && !!bucket && !!largePreviewKey && largePreviewOpen,
		queryFn: () => api.objects.getObjectMeta({ profileId: profileId!, bucket, key: largePreviewKey! }),
		retry: false,
	})
	const largePreviewMeta = largePreviewMetaQueryRaw.data ?? null
	const largePreviewPreviewState: PreviewState = useObjectPreview({
		api,
		profileId,
		bucket,
		detailsKey: largePreviewKey,
		detailsVisible: largePreviewOpen,
		detailsMeta: largePreviewMeta,
		downloadLinkProxyEnabled,
		presignedDownloadSupported,
		thumbnailCache,
	})

	const openLargePreviewForKey = useCallback(
		(key: string) => {
			setSelectedKeys(new Set([key]))
			setLastSelectedObjectKey(key)
			setDetailsDrawerOpen(false)
			setLargePreviewSession({
				scopeKey: previewScopeKey,
				key,
				open: true,
			})
		},
		[previewScopeKey, setDetailsDrawerOpen, setLastSelectedObjectKey, setSelectedKeys],
	)
	const closeLargePreview = useCallback(() => {
		setLargePreviewSession({
			scopeKey: previewScopeKey,
			key: null,
			open: false,
		})
	}, [previewScopeKey])

	useEffect(() => {
		if (!largePreviewOpen) return
		setDetailsDrawerOpen(false)
	}, [largePreviewOpen, setDetailsDrawerOpen])

	useEffect(() => {
		return () => {
			thumbnailCache.clear()
		}
	}, [bucket, profileId, thumbnailCache])

	useEffect(() => {
		if (!showThumbnails) {
			thumbnailCache.clear()
		}
	}, [showThumbnails, thumbnailCache])

	const detailsThumbnailSize = 160
	const detailsThumbnailFileName = detailsKey?.split('/').pop() ?? detailsKey ?? null
	const detailsThumbnailCacheKeySuffix = detailsMeta?.etag || detailsMeta?.lastModified || undefined
	const shouldRenderInlineDetailsThumbnail =
		showThumbnails &&
		detailsMeta &&
		detailsKey &&
		profileId &&
		bucket &&
		isThumbnailCandidate(detailsMeta.contentType, detailsKey)
	const detailsThumbnail =
		shouldRenderInlineDetailsThumbnail ? (
			<ObjectThumbnail
				api={api}
				profileId={profileId}
				bucket={bucket}
				objectKey={detailsKey}
				size={detailsThumbnailSize}
				cache={thumbnailCache}
				cacheKeySuffix={detailsThumbnailCacheKeySuffix}
				objectSize={detailsMeta.size}
				etag={detailsMeta.etag ?? undefined}
				lastModified={detailsMeta.lastModified ?? undefined}
				contentType={detailsMeta.contentType ?? undefined}
				fit="contain"
			/>
		) : null
	const detailsPreviewThumbnail =
		shouldRenderInlineDetailsThumbnail ? (
			<ObjectThumbnail
				api={api}
				profileId={profileId}
				bucket={bucket}
				objectKey={detailsKey}
				size={detailsThumbnailSize}
				cache={thumbnailCache}
				cacheKeySuffix={detailsThumbnailCacheKeySuffix}
				objectSize={detailsMeta.size}
				etag={detailsMeta.etag ?? undefined}
				lastModified={detailsMeta.lastModified ?? undefined}
				contentType={detailsMeta.contentType ?? undefined}
				fit="contain"
				altText={`Thumbnail preview of ${detailsThumbnailFileName ?? detailsKey}`}
			/>
		) : null

	const largePreviewThumbnail: ReactNode =
		largePreviewKey &&
		profileId &&
		bucket &&
		isImageKey(largePreviewKey) ? (
			<ObjectThumbnail
				api={api}
				profileId={profileId}
				bucket={bucket}
				objectKey={largePreviewKey}
				size={512}
				cache={thumbnailCache}
				cacheKeySuffix={largePreviewMeta?.etag || largePreviewMeta?.lastModified || undefined}
				objectSize={largePreviewMeta?.size}
				etag={largePreviewMeta?.etag ?? undefined}
				lastModified={largePreviewMeta?.lastModified ?? undefined}
				contentType={largePreviewMeta?.contentType ?? undefined}
				fit="contain"
			/>
		) : null

	return {
		objectByKey,
		singleSelectedKey,
		singleSelectedItem,
		detailsKey,
		detailsMeta,
		detailsMetaQuery,
		preview: detailsPreview.preview,
		loadPreview: detailsPreview.loadPreview,
		cancelPreview: detailsPreview.cancelPreview,
		canCancelPreview: detailsPreview.canCancelPreview,
		largePreviewKey,
		largePreviewOpen,
		largePreviewMeta,
		largePreviewMetaIsFetching: largePreviewMetaQueryRaw.isFetching,
		largePreviewThumbnail,
		largePreview: largePreviewPreviewState.preview,
		loadLargePreview: largePreviewPreviewState.loadPreview,
		cancelLargePreview: largePreviewPreviewState.cancelPreview,
		canCancelLargePreview: largePreviewPreviewState.canCancelPreview,
		detailsThumbnail,
		detailsPreviewThumbnail,
		openLargePreviewForKey,
		closeLargePreview,
	}
}

export type ObjectsScreenPreviewState = ReturnType<typeof useObjectsScreenPreviewState>
