import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

const MIN_VIRTUALIZED_ITEMS = 20
const INITIAL_WINDOW_ITEMS = 10

export function useAppContentVirtualizer(count: number, estimateSize: number) {
	const shouldVirtualize = count > MIN_VIRTUALIZED_ITEMS
	const [host, setHost] = useState<HTMLElement | null>(null)
	const scrollContainerRef = useRef<HTMLElement | null>(null)
	const [scrollMargin, setScrollMargin] = useState(0)
	const hostRef = useCallback((node: HTMLElement | null) => {
		if (!shouldVirtualize) {
			setHost(null)
			scrollContainerRef.current = null
			return
		}
		setHost(node)
		scrollContainerRef.current = node?.closest('[data-scroll-container="app-content"]') as HTMLElement | null
	}, [shouldVirtualize])

	useLayoutEffect(() => {
		if (!shouldVirtualize) return
		const container = scrollContainerRef.current
		if (!container || !host) return
		const updateGeometry = () => {
			const hostRect = host.getBoundingClientRect()
			const containerRect = container.getBoundingClientRect()
			const next = Math.max(0, Math.round(hostRect.top - containerRect.top + container.scrollTop))
			setScrollMargin((current) => (current === next ? current : next))
		}
		updateGeometry()
		if (typeof ResizeObserver === 'undefined') return
		const observer = new ResizeObserver(updateGeometry)
		observer.observe(host)
		observer.observe(container)
		return () => observer.disconnect()
	}, [host, shouldVirtualize])

	const virtualizer = useVirtualizer({
		count,
		enabled: shouldVirtualize,
		getScrollElement: () => scrollContainerRef.current,
		estimateSize: () => estimateSize,
		overscan: 6,
		scrollMargin,
	})
	const measuredItems = virtualizer.getVirtualItems()
	const items = useMemo(
		() =>
			shouldVirtualize && measuredItems.length > 0
				? measuredItems
				: Array.from({ length: shouldVirtualize ? Math.min(count, INITIAL_WINDOW_ITEMS) : count }, (_, index) => ({
						index,
						key: index,
						start: index * estimateSize,
						size: estimateSize,
						end: (index + 1) * estimateSize,
						lane: 0,
					})),
		[count, estimateSize, measuredItems, shouldVirtualize],
	)
	const firstStart = items.length ? Math.max(0, items[0]!.start - scrollMargin) : 0
	const lastEnd = items.length ? Math.max(0, items[items.length - 1]!.end - scrollMargin) : 0
	const totalSize = shouldVirtualize && measuredItems.length > 0 ? virtualizer.getTotalSize() : count * estimateSize

	return {
		hostRef,
		items,
		measureElement: shouldVirtualize ? virtualizer.measureElement : undefined,
		paddingTop: shouldVirtualize ? firstStart : 0,
		paddingBottom: shouldVirtualize ? Math.max(0, totalSize - lastEnd) : 0,
	}
}
