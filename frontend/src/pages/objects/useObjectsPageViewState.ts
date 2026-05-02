import type { Dispatch, SetStateAction } from 'react'

import { buildObjectsPageViewState } from './buildObjectsPageViewState'
import { useObjectsAutoScanReadiness } from './useObjectsAutoScanReadiness'
import { useObjectsPageLayoutState } from './useObjectsPageLayoutState'
import { useObjectsPageViewFilters } from './useObjectsPageViewFilters'
import { useObjectsPathKeyboardShortcut } from './useObjectsPathKeyboardShortcut'
import { useObjectsScopedDrawers } from './useObjectsScopedDrawers'
import { useObjectsViewModeState } from './useObjectsViewModeState'

type ScreensState = Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', boolean>>

type Args = {
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	isOffline: boolean
	screens: ScreensState
	openPathModal: () => void
	setTreeDrawerOpen: Dispatch<SetStateAction<boolean>>
}

export function useObjectsPageViewState({
	apiToken,
	profileId,
	bucket,
	prefix,
	isOffline,
	screens,
	openPathModal,
	setTreeDrawerOpen,
}: Args) {
	const isDesktop = !!screens.lg
	const isWideDesktop = !!screens.xl
	const canDragDrop = isDesktop && !isOffline

	const filters = useObjectsPageViewFilters({ apiToken, profileId, bucket })

	const currentOverlayScopeKey = `${apiToken || '__no_server__'}:${profileId?.trim() || '__no_profile__'}`
	const drawers = useObjectsScopedDrawers({ scopeKey: currentOverlayScopeKey })
	const autoScan = useObjectsAutoScanReadiness({
		apiToken,
		profileId,
		bucket,
		prefix,
	})
	const viewMode = useObjectsViewModeState({
		thumbnailCacheSize: filters.thumbnailCacheSize,
		autoIndexTtlHours: filters.autoIndexTtlHours,
		setExtFilter: filters.setExtFilter,
		setMinSize: filters.setMinSize,
		setMaxSize: filters.setMaxSize,
		setDetailsDrawerOpen: drawers.setDetailsDrawerOpen,
	})
	const layout = useObjectsPageLayoutState({
		isDesktop,
		isWideDesktop,
		isAdvanced: viewMode.isAdvanced,
		detailsOpen: viewMode.detailsOpen,
		detailsDrawerOpen: drawers.detailsDrawerOpen,
		setDetailsDrawerOpen: drawers.setDetailsDrawerOpen,
		setTreeDrawerOpen,
	})

	useObjectsPathKeyboardShortcut(openPathModal)

	return buildObjectsPageViewState({
		autoScan,
		drawers,
		filters,
		layout,
		responsive: { canDragDrop, isDesktop },
		viewMode,
	})
}
