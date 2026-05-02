import { useEffect, useRef, useState } from 'react'

export function useObjectsLayoutWidth() {
	const layoutRef = useRef<HTMLDivElement | null>(null)
	const [layoutWidthPx, setLayoutWidthPx] = useState(0)

	useEffect(() => {
		const el = layoutRef.current
		if (!el) return
		setLayoutWidthPx(Math.max(0, Math.round(el.getBoundingClientRect().width)))
		if (typeof ResizeObserver === 'undefined') return
		const ro = new ResizeObserver((entries) => {
			const next = entries[0]?.contentRect?.width ?? 0
			setLayoutWidthPx(Math.max(0, Math.round(next)))
		})
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	return {
		layoutRef,
		layoutWidthPx,
	}
}
