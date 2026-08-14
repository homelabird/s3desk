import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'

import styles from './ObjectsListView.module.css'

const ITEM_SELECTOR = '[data-object-key]'
const DRAG_THRESHOLD_PX = 4
const AUTO_SCROLL_EDGE_PX = 48
const AUTO_SCROLL_MAX_PX = 20

type Point = { x: number; y: number }

function intersects(a: DOMRect, b: DOMRect) {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function rectFromPoints(a: Point, b: Point) {
	const left = Math.min(a.x, b.x)
	const top = Math.min(a.y, b.y)
	return new DOMRect(left, top, Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function scrollSpeed(pointerY: number, top: number, bottom: number) {
	if (pointerY < top + AUTO_SCROLL_EDGE_PX) {
		return -Math.ceil(AUTO_SCROLL_MAX_PX * (1 - Math.max(0, pointerY - top) / AUTO_SCROLL_EDGE_PX))
	}
	if (pointerY > bottom - AUTO_SCROLL_EDGE_PX) {
		return Math.ceil(AUTO_SCROLL_MAX_PX * (1 - Math.max(0, bottom - pointerY) / AUTO_SCROLL_EDGE_PX))
	}
	return 0
}

type Args = {
	enabled: boolean
	listElement: HTMLDivElement | null
	scrollContainerRef: RefObject<HTMLDivElement | null>
	setSelectedKeys: Dispatch<SetStateAction<Set<string>>>
	setLastSelectedObjectKey: Dispatch<SetStateAction<string | null>>
	onStart?: () => void
}

export function useObjectsMarqueeSelection({
	enabled,
	listElement,
	scrollContainerRef,
	setSelectedKeys,
	setLastSelectedObjectKey,
	onStart,
}: Args) {
	useEffect(() => {
		if (!enabled || !listElement) return
		const scrollContainer = scrollContainerRef.current
		if (!scrollContainer) return

		let start: Point | null = null
		let pointer: Point | null = null
		let baseSelection = new Set<string>()
		let additive = false
		let dragging = false
		let frame = 0
		let overlay: HTMLDivElement | null = null
		const itemRects = new Map<string, DOMRect>()

		const viewportBounds = () => {
			const list = listElement.getBoundingClientRect()
			const scroll = scrollContainer.getBoundingClientRect()
			return {
				left: Math.max(list.left, scroll.left),
				right: Math.min(list.right, scroll.right),
				top: Math.max(list.top, scroll.top),
				bottom: Math.min(list.bottom, scroll.bottom),
			}
		}

		const update = () => {
			if (!start || !pointer || !overlay) return
			const current = { x: pointer.x + scrollContainer.scrollLeft, y: pointer.y + scrollContainer.scrollTop }
			const marqueeInContent = rectFromPoints(start, current)
			const marquee = rectFromPoints(
				{ x: start.x - scrollContainer.scrollLeft, y: start.y - scrollContainer.scrollTop },
				{ x: current.x - scrollContainer.scrollLeft, y: current.y - scrollContainer.scrollTop },
			)
			const bounds = viewportBounds()
			const left = Math.max(marquee.left, bounds.left)
			const top = Math.max(marquee.top, bounds.top)
			const right = Math.min(marquee.right, bounds.right)
			const bottom = Math.min(marquee.bottom, bounds.bottom)
			overlay.style.left = `${left}px`
			overlay.style.top = `${top}px`
			overlay.style.width = `${Math.max(0, right - left)}px`
			overlay.style.height = `${Math.max(0, bottom - top)}px`

			for (const item of listElement.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) {
				const key = item.dataset.objectKey
				if (!key) continue
				const rect = item.getBoundingClientRect()
				itemRects.set(key, new DOMRect(rect.left + scrollContainer.scrollLeft, rect.top + scrollContainer.scrollTop, rect.width, rect.height))
			}
			const next = additive ? new Set(baseSelection) : new Set<string>()
			for (const [key, rect] of itemRects) {
				if (intersects(marqueeInContent, rect)) next.add(key)
			}
			setSelectedKeys(next)
		}

		const tick = () => {
			if (!dragging || !pointer) return
			const bounds = viewportBounds()
			const speed = scrollSpeed(pointer.y, bounds.top, bounds.bottom)
			if (speed !== 0) {
				const before = scrollContainer.scrollTop
				scrollContainer.scrollTop += speed
				if (scrollContainer.scrollTop !== before) update()
			}
			frame = requestAnimationFrame(tick)
		}

		const finish = () => {
			if (!start) return
			cancelAnimationFrame(frame)
			overlay?.remove()
			overlay = null
			start = null
			pointer = null
			dragging = false
			document.documentElement.classList.remove(styles.marqueeSelecting)
		}

		const onPointerMove = (event: PointerEvent) => {
			if (!start || event.pointerId === undefined) return
			pointer = { x: event.clientX, y: event.clientY }
			if (!dragging && Math.hypot(pointer.x + scrollContainer.scrollLeft - start.x, pointer.y + scrollContainer.scrollTop - start.y) < DRAG_THRESHOLD_PX) return
			if (!dragging) {
				dragging = true
				overlay = document.createElement('div')
				overlay.className = styles.marqueeSelection
				overlay.dataset.testid = 'objects-marquee-selection'
				document.body.append(overlay)
				document.documentElement.classList.add(styles.marqueeSelecting)
				frame = requestAnimationFrame(tick)
			}
			update()
		}

		const onPointerUp = () => finish()
		const onPointerDown = (event: PointerEvent) => {
			if (event.button !== 0 || !event.isPrimary || event.pointerType !== 'mouse') return
			const target = event.target as HTMLElement
			if (target.closest(`${ITEM_SELECTOR}, button, input, [role="menu"], [role="dialog"]`)) return
			const bounds = viewportBounds()
			if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return

			event.preventDefault()
			onStart?.()
			additive = event.ctrlKey || event.metaKey || event.shiftKey
			itemRects.clear()
			setSelectedKeys((current) => {
				baseSelection = new Set(current)
				return additive ? current : new Set()
			})
			if (!additive) setLastSelectedObjectKey(null)
			start = { x: event.clientX + scrollContainer.scrollLeft, y: event.clientY + scrollContainer.scrollTop }
			pointer = { x: event.clientX, y: event.clientY }
		}

		listElement.addEventListener('pointerdown', onPointerDown)
		window.addEventListener('pointermove', onPointerMove)
		window.addEventListener('pointerup', onPointerUp)
		window.addEventListener('pointercancel', onPointerUp)
		return () => {
			finish()
			listElement.removeEventListener('pointerdown', onPointerDown)
			window.removeEventListener('pointermove', onPointerMove)
			window.removeEventListener('pointerup', onPointerUp)
			window.removeEventListener('pointercancel', onPointerUp)
		}
	}, [enabled, listElement, onStart, scrollContainerRef, setLastSelectedObjectKey, setSelectedKeys])
}
