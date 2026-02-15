import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

type UseObjectsListVirtualizerArgs = {
	rowCount: number
	isCompactList: boolean
	rowHeightCompactPx: number
	rowHeightWidePx: number
	overscan?: number
	scrollToTopDeps: {
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
}

export function useObjectsListVirtualizer({
	rowCount,
	isCompactList,
	rowHeightCompactPx,
	rowHeightWidePx,
	overscan = 10,
	scrollToTopDeps,
}: UseObjectsListVirtualizerArgs) {
	const [listScrollerEl, setListScrollerEl] = useState<HTMLDivElement | null>(null)
	const scrollContainerRef = useRef<HTMLDivElement | null>(null)
	const [scrollMargin, setScrollMargin] = useState(0)

	useLayoutEffect(() => {
		const container = scrollContainerRef.current
		const listEl = listScrollerEl
		if (!container || !listEl) return
		const listRect = listEl.getBoundingClientRect()
		const containerRect = container.getBoundingClientRect()
		const next = Math.max(0, Math.round(listRect.top - containerRect.top + container.scrollTop))
		setScrollMargin((prev) => (prev === next ? prev : next))
	}, [listScrollerEl])

	const rowVirtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollContainerRef.current,
		estimateSize: () => (isCompactList ? rowHeightCompactPx : rowHeightWidePx),
		overscan,
		scrollMargin,
	})

	const virtualItems = rowVirtualizer.getVirtualItems()
	const virtualItemsForRender = useMemo(
		() => virtualItems.map((vi) => ({ index: vi.index, start: vi.start - scrollMargin })),
		[scrollMargin, virtualItems],
	)
	const totalSize = rowVirtualizer.getTotalSize()

	useEffect(() => {
		scrollContainerRef.current?.scrollTo({ top: 0 })
	}, [
		scrollToTopDeps.bucket,
		scrollToTopDeps.extFilter,
		scrollToTopDeps.favoritesFirst,
		scrollToTopDeps.favoritesOnly,
		scrollToTopDeps.maxModifiedMs,
		scrollToTopDeps.maxSize,
		scrollToTopDeps.minModifiedMs,
		scrollToTopDeps.minSize,
		scrollToTopDeps.prefix,
		scrollToTopDeps.search,
		scrollToTopDeps.sort,
		scrollToTopDeps.typeFilter,
	])

	return {
		listScrollerEl,
		setListScrollerEl,
		scrollContainerRef,
		rowVirtualizer,
		virtualItems,
		virtualItemsForRender,
		totalSize,
	}
}

