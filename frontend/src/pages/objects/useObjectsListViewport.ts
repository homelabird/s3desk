import type { Ref, RefObject } from 'react'

import { COMPACT_ROW_HEIGHT_PX, WIDE_ROW_HEIGHT_PX } from './objectsPageConstants'
import { useObjectsListVirtualizer } from './useObjectsListVirtualizer'

type UseObjectsListViewportArgs = {
	rowCount: number
	isCompactList: boolean
	bucket: string
	prefix: string
	search: string
	sort: string
	typeFilter: string
	favoritesOnly: boolean
	favoritesFirst: boolean
	extFilter: string
	minSize: number | null
	maxSize: number | null
	minModifiedMs: number | null
	maxModifiedMs: number | null
}

export type ObjectsViewportVirtualItem = {
	index: number
}

export type ObjectsViewportRenderItem = {
	index: number
	start: number
}

export type ObjectsListViewportState = {
	listScrollerEl: HTMLDivElement | null
	listScrollerRef: Ref<HTMLDivElement>
	scrollContainerRef: RefObject<HTMLDivElement | null>
	measureElement: (element: HTMLDivElement | null) => void
	rowVirtualizer: {
		scrollToIndex: (index: number) => void
	}
	virtualItems: ObjectsViewportVirtualItem[]
	virtualItemsForRender: ObjectsViewportRenderItem[]
	totalSize: number
}

export function useObjectsListViewport({
	rowCount,
	isCompactList,
	bucket,
	prefix,
	search,
	sort,
	typeFilter,
	favoritesOnly,
	favoritesFirst,
	extFilter,
	minSize,
	maxSize,
	minModifiedMs,
	maxModifiedMs,
}: UseObjectsListViewportArgs): ObjectsListViewportState {
	return useObjectsListVirtualizer({
		rowCount,
		isCompactList,
		rowHeightCompactPx: COMPACT_ROW_HEIGHT_PX,
		rowHeightWidePx: WIDE_ROW_HEIGHT_PX,
		overscan: 10,
		scrollToTopDeps: {
			bucket,
			prefix,
			search,
			sort,
			typeFilter,
			favoritesOnly,
			favoritesFirst,
			extFilter,
			minSize,
			maxSize,
			minModifiedMs,
			maxModifiedMs,
		},
	})
}
