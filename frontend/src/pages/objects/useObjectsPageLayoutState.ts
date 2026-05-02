import type { Dispatch, SetStateAction } from 'react'

import { useObjectsLayout } from './useObjectsLayout'
import { useObjectsLayoutWidth } from './useObjectsLayoutWidth'

type UseObjectsPageLayoutStateArgs = {
	isDesktop: boolean
	isWideDesktop: boolean
	isAdvanced: boolean
	detailsOpen: boolean
	detailsDrawerOpen: boolean
	setDetailsDrawerOpen: Dispatch<SetStateAction<boolean>>
	setTreeDrawerOpen: Dispatch<SetStateAction<boolean>>
}

export function useObjectsPageLayoutState({
	isDesktop,
	isWideDesktop,
	isAdvanced,
	detailsOpen,
	detailsDrawerOpen,
	setDetailsDrawerOpen,
	setTreeDrawerOpen,
}: UseObjectsPageLayoutStateArgs) {
	const { layoutRef, layoutWidthPx } = useObjectsLayoutWidth()
	const layoutState = useObjectsLayout({
		layoutWidthPx,
		isDesktop,
		isWideDesktop,
		isAdvanced,
		detailsOpen,
		detailsDrawerOpen,
		setDetailsDrawerOpen,
		setTreeDrawerOpen,
	})

	return {
		layoutRef,
		...layoutState,
	}
}
