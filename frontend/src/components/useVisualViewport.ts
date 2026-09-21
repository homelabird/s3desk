import { useEffect, type RefObject } from 'react'
import { getVisualViewportGeometry } from '../lib/visualViewportGeometry'

/** Applied to each overlay's backdrop, so nested panels do not fight over root styles. */
export function useVisualViewport(open: boolean, containerRef: RefObject<HTMLElement | null>) {
	useEffect(() => {
		if (!open || typeof window === 'undefined') return
		const viewport = window.visualViewport
		const container = containerRef.current
		const backdrop = container?.parentElement
		if (!container || !backdrop) return
		let frame = 0
		const heightBefore = backdrop.style.getPropertyValue('--s3d-visual-viewport-height')
		const topBefore = backdrop.style.getPropertyValue('--s3d-visual-viewport-top')
		const update = () => {
			frame = 0
			const geometry = getVisualViewportGeometry(window.innerHeight, viewport)
			backdrop.style.setProperty('--s3d-visual-viewport-height', `${geometry.height}px`)
			backdrop.style.setProperty('--s3d-visual-viewport-top', `${geometry.top}px`)
			if (viewport && Math.abs(viewport.scale - 1) > 0.05) return
			const active = document.activeElement
			if (!(active instanceof HTMLElement) || !container.contains(active)) return
			if (!active.matches('input, textarea, [contenteditable="true"]')) return
			const rect = active.getBoundingClientRect()
			if (rect.bottom > geometry.top + geometry.height || rect.top < geometry.top) {
				active.scrollIntoView({ block: 'nearest', inline: 'nearest' })
			}
		}
		const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update) }
		update()
		viewport?.addEventListener('resize', schedule)
		viewport?.addEventListener('scroll', schedule)
		window.addEventListener('resize', schedule)
		window.addEventListener('orientationchange', schedule)
		container.addEventListener('focusin', schedule)
		return () => {
			window.cancelAnimationFrame(frame)
			viewport?.removeEventListener('resize', schedule)
			viewport?.removeEventListener('scroll', schedule)
			window.removeEventListener('resize', schedule)
			window.removeEventListener('orientationchange', schedule)
			container.removeEventListener('focusin', schedule)
			if (heightBefore) backdrop.style.setProperty('--s3d-visual-viewport-height', heightBefore)
			else backdrop.style.removeProperty('--s3d-visual-viewport-height')
			if (topBefore) backdrop.style.setProperty('--s3d-visual-viewport-top', topBefore)
			else backdrop.style.removeProperty('--s3d-visual-viewport-top')
		}
	}, [containerRef, open])
}
