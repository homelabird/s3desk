import { useCallback, useEffect, useMemo, type SetStateAction } from 'react'

import {
	OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MAX_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MIN_HOURS,
} from '../../lib/objectIndexing'
import {
	createThumbnailCache,
	THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	THUMBNAIL_CACHE_MAX_ENTRIES,
	THUMBNAIL_CACHE_MIN_ENTRIES,
} from '../../lib/thumbnailCache'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { type ObjectsUIMode } from './objectsPageConstants'

type UseObjectsViewModeStateArgs = {
	thumbnailCacheSize: number
	autoIndexTtlHours: number
	setExtFilter: (next: string) => void
	setMinSize: (next: number | null) => void
	setMaxSize: (next: number | null) => void
	setDetailsDrawerOpen: (next: SetStateAction<boolean>) => void
}

export function useObjectsViewModeState({
	thumbnailCacheSize,
	autoIndexTtlHours,
	setExtFilter,
	setMinSize,
	setMaxSize,
	setDetailsDrawerOpen,
}: UseObjectsViewModeStateArgs) {
	const [uiMode, setUiMode] = useLocalStorageState<ObjectsUIMode>('objectsUIMode', 'simple')
	const [detailsOpen, setDetailsOpen] = useLocalStorageState<boolean>('objectsDetailsOpen', true)
	const [downloadLinkProxyEnabled] = useLocalStorageState<boolean>('downloadLinkProxyEnabled', false)
	const isAdvanced = uiMode === 'advanced'

	const handleToggleUiMode = useCallback(() => {
		if (isAdvanced) {
			setDetailsOpen(false)
			setDetailsDrawerOpen(false)
			setUiMode('simple')
			return
		}
		setUiMode('advanced')
	}, [isAdvanced, setDetailsDrawerOpen, setDetailsOpen, setUiMode])

	const normalizedThumbnailCacheSize = useMemo(() => {
		if (typeof thumbnailCacheSize !== 'number' || !Number.isFinite(thumbnailCacheSize)) {
			return THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES
		}
		return Math.min(
			THUMBNAIL_CACHE_MAX_ENTRIES,
			Math.max(THUMBNAIL_CACHE_MIN_ENTRIES, Math.round(thumbnailCacheSize)),
		)
	}, [thumbnailCacheSize])
	const thumbnailCache = useMemo(
		() => createThumbnailCache({ maxEntries: normalizedThumbnailCacheSize }),
		[normalizedThumbnailCacheSize],
	)
	const autoIndexTtlMs = useMemo(() => {
		if (typeof autoIndexTtlHours !== 'number' || !Number.isFinite(autoIndexTtlHours)) {
			return OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS * 60 * 60 * 1000
		}
		const clamped = Math.min(
			OBJECTS_AUTO_INDEX_TTL_MAX_HOURS,
			Math.max(OBJECTS_AUTO_INDEX_TTL_MIN_HOURS, Math.round(autoIndexTtlHours)),
		)
		return clamped * 60 * 60 * 1000
	}, [autoIndexTtlHours])

	useEffect(() => {
		if (uiMode !== 'simple') return
		setExtFilter('')
		setMinSize(null)
		setMaxSize(null)
	}, [setExtFilter, setMaxSize, setMinSize, uiMode])

	useEffect(() => {
		if (uiMode !== 'simple') return
		setDetailsOpen(false)
	}, [setDetailsOpen, uiMode])

	return {
		autoIndexTtlMs,
		detailsOpen,
		downloadLinkProxyEnabled,
		handleToggleUiMode,
		isAdvanced,
		setDetailsOpen,
		setUiMode,
		thumbnailCache,
	}
}
