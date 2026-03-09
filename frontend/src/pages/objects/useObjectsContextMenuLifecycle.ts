import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { clampNumber } from './objectsListUtils'
import { OBJECTS_MENU_ROOT_SELECTOR } from './ObjectsMenuPopover'
import type { ContextMenuMatch, ContextMenuPoint, ContextMenuState } from './objectsContextMenuTypes'
import { CONTEXT_MENU_CLASS_NAME, CONTEXT_MENU_VIEWPORT_PADDING_PX } from './useObjectsContextMenuMenu'

type UseObjectsContextMenuLifecycleArgs = {
	listScrollerEl: HTMLDivElement | null
	scrollContainerRef: React.RefObject<HTMLDivElement | null>
	selectedCount: number
	contextMenuState: ContextMenuState
	contextMenuPoint: ContextMenuPoint | null
	contextMenuVisible: boolean
	recordContextMenuPoint: (event: React.MouseEvent) => ContextMenuPoint
	openListContextMenu: (point?: ContextMenuPoint) => void
	closeContextMenu: (match?: ContextMenuMatch, reason?: string) => void
}

export function useObjectsContextMenuLifecycle(args: UseObjectsContextMenuLifecycleArgs) {
	const {
		closeContextMenu,
		contextMenuPoint,
		contextMenuState,
		contextMenuVisible,
		listScrollerEl,
		openListContextMenu,
		recordContextMenuPoint,
		scrollContainerRef,
		selectedCount,
	} = args
	const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenuPoint | null>(null)
	const contextMenuRef = useRef<HTMLDivElement | null>(null)
	const openedAtRef = useRef(0)

	const getListScrollerElement = useCallback(() => {
		if (listScrollerEl) return listScrollerEl
		if (scrollContainerRef.current) return scrollContainerRef.current
		return document.querySelector<HTMLDivElement>('[data-testid="objects-upload-dropzone"] [tabindex="0"]')
	}, [listScrollerEl, scrollContainerRef])

	const shouldIgnoreContextMenuClose = useCallback((event?: Event) => {
		const target = event?.target
		if (!target || !(target instanceof HTMLElement)) return false
		return !!target.closest(`.${CONTEXT_MENU_CLASS_NAME}, ${OBJECTS_MENU_ROOT_SELECTOR}`)
	}, [])

	const positionContextMenu = useCallback(() => {
		if (!contextMenuState.open || contextMenuState.source !== 'context' || !contextMenuPoint) return
		const menu = contextMenuRef.current
		if (!menu) return
		const padding = CONTEXT_MENU_VIEWPORT_PADDING_PX
		const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
		const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
		const rect = menu.getBoundingClientRect()
		const maxX = Math.max(padding, viewportWidth - rect.width - padding)
		const maxY = Math.max(padding, viewportHeight - rect.height - padding)
		const nextX = clampNumber(contextMenuPoint.x, padding, maxX)
		const nextY = clampNumber(contextMenuPoint.y, padding, maxY)
		setContextMenuPosition((prev) => {
			if (prev && prev.x === nextX && prev.y === nextY) return prev
			return { x: nextX, y: nextY }
		})
	}, [contextMenuPoint, contextMenuState.open, contextMenuState.source])

	useLayoutEffect(() => {
		positionContextMenu()
	}, [contextMenuState.key, contextMenuState.kind, positionContextMenu, selectedCount])

	useEffect(() => {
		if (!contextMenuState.open) return
		openedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
	}, [contextMenuState.key, contextMenuState.kind, contextMenuState.open, contextMenuState.source])

	useEffect(() => {
		if (!contextMenuState.open || contextMenuState.source !== 'context') return
		const handleResize = () => {
			positionContextMenu()
		}
		window.addEventListener('resize', handleResize)
		return () => {
			window.removeEventListener('resize', handleResize)
		}
	}, [contextMenuState.open, contextMenuState.source, positionContextMenu])

	useEffect(() => {
		if (!contextMenuState.open) return
		const el = getListScrollerElement()
		const shouldIgnoreTransientClose = (eventType: string) => {
			if (eventType !== 'scroll' && eventType !== 'wheel') return false
			const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
			return now - openedAtRef.current < 150
		}
		const handleClose = (event: Event) => {
			if (shouldIgnoreContextMenuClose(event)) return
			if (shouldIgnoreTransientClose(event.type)) return
			closeContextMenu(undefined, event.type)
		}
		const handlePointerDown = (event: Event) => {
			if (shouldIgnoreContextMenuClose(event)) return
			closeContextMenu(undefined, 'pointerdown')
		}
		const handleKeyDown = (event: Event) => {
			if (!(event instanceof KeyboardEvent)) return
			if (event.key !== 'Escape') return
			closeContextMenu(undefined, 'escape')
		}
		if (el) {
			el.addEventListener('scroll', handleClose, { passive: true })
			el.addEventListener('wheel', handleClose, { passive: true })
		}
		window.addEventListener('scroll', handleClose, true)
		window.addEventListener('wheel', handleClose, { passive: true, capture: true })
		document.addEventListener('scroll', handleClose, true)
		document.addEventListener('wheel', handleClose, { passive: true, capture: true })
		document.addEventListener('pointerdown', handlePointerDown, true)
		document.addEventListener('keydown', handleKeyDown, true)
		return () => {
			if (el) {
				el.removeEventListener('scroll', handleClose)
				el.removeEventListener('wheel', handleClose)
			}
			window.removeEventListener('scroll', handleClose, true)
			window.removeEventListener('wheel', handleClose, true)
			document.removeEventListener('scroll', handleClose, true)
			document.removeEventListener('wheel', handleClose, true)
			document.removeEventListener('pointerdown', handlePointerDown, true)
			document.removeEventListener('keydown', handleKeyDown, true)
		}
	}, [closeContextMenu, contextMenuState.open, getListScrollerElement, shouldIgnoreContextMenuClose])

	const handleListScrollerContextMenu = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			const target = event.target as HTMLElement | null
			if (target?.closest('[data-objects-row="true"]')) return
			if (target?.closest(OBJECTS_MENU_ROOT_SELECTOR)) {
				event.preventDefault()
				event.stopPropagation()
				return
			}
			event.preventDefault()
			event.stopPropagation()
			const point = recordContextMenuPoint(event)
			openListContextMenu(point)
		},
		[openListContextMenu, recordContextMenuPoint],
	)

	const contextMenuAnchor = contextMenuPosition ?? contextMenuPoint
	const contextMenuStyle: CSSProperties | null =
		contextMenuVisible && contextMenuAnchor
			? {
					position: 'fixed',
					left: contextMenuAnchor.x,
					top: contextMenuAnchor.y,
					zIndex: 2000,
					opacity: contextMenuPosition ? 1 : 0,
					pointerEvents: contextMenuPosition ? 'auto' : 'none',
			  }
			: null

	return {
		contextMenuRef,
		contextMenuStyle,
		getListScrollerElement,
		handleListScrollerContextMenu,
	}
}
