import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

export function useAppContentVirtualizer(count: number, estimateSize: number) {
	const [host, setHost] = useState<HTMLElement | null>(null)
	const scrollContainerRef = useRef<HTMLElement | null>(null)
	const [scrollMargin, setScrollMargin] = useState(0)
	const hostRef = useCallback((node: HTMLElement | null) => {
		setHost(node)
		scrollContainerRef.current = node?.closest('[data-scroll-container="app-content"]') as HTMLElement | null
	}, [])

	useLayoutEffect(() => {
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
	}, [host])

	const virtualizer = useVirtualizer({
		count,
		getScrollElement: () => scrollContainerRef.current,
		estimateSize: () => estimateSize,
		overscan: 6,
		scrollMargin,
	})
	const measuredItems = virtualizer.getVirtualItems()
	const items = useMemo(
		() =>
			measuredItems.length > 0
				? measuredItems
				: Array.from({ length: Math.min(count, 20) }, (_, index) => ({
						index,
						key: index,
						start: index * estimateSize,
						size: estimateSize,
						end: (index + 1) * estimateSize,
						lane: 0,
					})),
		[count, estimateSize, measuredItems],
	)
	const firstStart = items.length ? Math.max(0, items[0]!.start - scrollMargin) : 0
	const lastEnd = items.length ? Math.max(0, items[items.length - 1]!.end - scrollMargin) : 0
	const totalSize = measuredItems.length > 0 ? virtualizer.getTotalSize() : count * estimateSize

	return {
		hostRef,
		items,
		measureElement: virtualizer.measureElement,
		paddingTop: firstStart,
		paddingBottom: Math.max(0, totalSize - lastEnd),
	}
}
