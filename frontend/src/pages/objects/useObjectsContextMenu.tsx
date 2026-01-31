import type { CSSProperties } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MenuProps } from 'antd'

import type { ObjectItem } from '../../api/types'
import type { UIAction, UIActionOrDivider } from './objectsActions'
import { buildActionMenu, trimActionDividers } from './objectsActions'
import { clampNumber } from './objectsListUtils'

const CONTEXT_MENU_VIEWPORT_PADDING_PX = 8
const LIST_CONTEXT_MENU_MAX_HEIGHT_PX = 320
const CONTEXT_MENU_CLASS_NAME = 'objects-context-menu'

export type ContextMenuSource = 'context' | 'button'
export type ContextMenuKind = 'object' | 'prefix' | 'list'
export type ContextMenuState = {
	open: boolean
	source: ContextMenuSource | null
	kind: ContextMenuKind | null
	key: string | null
}
export type ContextMenuPoint = {
	x: number
	y: number
}
export type ContextMenuMatch = {
	source: ContextMenuSource
	kind: ContextMenuKind
	key: string
}

type LogFn = (enabled: boolean, message: string, context?: Record<string, unknown>) => void

type UseObjectsContextMenuArgs = {
	debugEnabled: boolean
	log: LogFn
	listScrollerEl: HTMLDivElement | null
	scrollContainerRef: React.RefObject<HTMLDivElement | null>
	selectedCount: number
	objectByKey: Map<string, ObjectItem>
	selectedKeys: Set<string>
	getObjectActions: (key: string, size?: number) => UIActionOrDivider[]
	getPrefixActions: (prefix: string) => UIActionOrDivider[]
	selectionContextMenuActions: UIActionOrDivider[]
	globalActionMap: Map<string, UIAction>
	selectionActionMap: Map<string, UIAction>
	isAdvanced: boolean
	ensureObjectSelected: (key: string) => void
}

export function useObjectsContextMenu({
	debugEnabled,
	log,
	listScrollerEl,
	scrollContainerRef,
	selectedCount,
	objectByKey,
	selectedKeys,
	getObjectActions,
	getPrefixActions,
	selectionContextMenuActions,
	globalActionMap,
	selectionActionMap,
	isAdvanced,
	ensureObjectSelected,
}: UseObjectsContextMenuArgs) {
	const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
		open: false,
		source: null,
		kind: null,
		key: null,
	})
	const [contextMenuPoint, setContextMenuPoint] = useState<ContextMenuPoint | null>(null)
	const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenuPoint | null>(null)
	const contextMenuRef = useRef<HTMLDivElement | null>(null)

	const recordContextMenuPoint = useCallback((event: React.MouseEvent) => {
		const nextPoint = { x: event.clientX, y: event.clientY }
		setContextMenuPoint(nextPoint)
		setContextMenuPosition(null)
		return nextPoint
	}, [])

	const closeContextMenu = useCallback(
		(match?: ContextMenuMatch, reason?: string) => {
			let cleared = false
			setContextMenuState((prev) => {
				if (!prev.open) return prev
				if (match) {
					if (prev.source !== match.source || prev.kind !== match.kind || prev.key !== match.key) {
						return prev
					}
				}
				log(debugEnabled, 'close', {
					reason: reason ?? 'unknown',
					kind: prev.kind,
					key: prev.key,
					source: prev.source,
				})
				cleared = true
				return { open: false, source: null, kind: null, key: null }
			})
			if (cleared) {
				setContextMenuPoint(null)
				setContextMenuPosition(null)
			}
		},
		[debugEnabled, log],
	)

	const openObjectContextMenu = useCallback(
		(key: string, source: ContextMenuSource, point?: ContextMenuPoint) => {
			ensureObjectSelected(key)
			log(debugEnabled, 'open', {
				kind: 'object',
				key,
				source,
				point: point ?? contextMenuPoint ?? undefined,
			})
			setContextMenuState({ open: true, source, kind: 'object', key })
		},
		[contextMenuPoint, debugEnabled, ensureObjectSelected, log],
	)

	const openPrefixContextMenu = useCallback(
		(key: string, source: ContextMenuSource, point?: ContextMenuPoint) => {
			log(debugEnabled, 'open', {
				kind: 'prefix',
				key,
				source,
				point: point ?? contextMenuPoint ?? undefined,
			})
			setContextMenuState({ open: true, source, kind: 'prefix', key })
		},
		[contextMenuPoint, debugEnabled, log],
	)

	const openListContextMenu = useCallback(
		(point?: ContextMenuPoint) => {
			log(debugEnabled, 'open', {
				kind: 'list',
				key: 'list',
				source: 'context',
				point: point ?? contextMenuPoint ?? undefined,
			})
			setContextMenuState({ open: true, source: 'context', kind: 'list', key: 'list' })
		},
		[contextMenuPoint, debugEnabled, log],
	)

	const withContextMenuClassName = useCallback((menu: MenuProps) => ({
		...menu,
		className: menu.className,
		style: {
			...menu.style,
			maxHeight: menu.style?.maxHeight ?? `calc(100vh - ${CONTEXT_MENU_VIEWPORT_PADDING_PX * 2}px)`,
			overflowY: menu.style?.overflowY ?? 'auto',
		},
	}), [])

	const listContextMenuActions = useMemo(
		() =>
			trimActionDividers(
				[
					globalActionMap.get('upload_files'),
					globalActionMap.get('upload_folder'),
					globalActionMap.get('new_folder'),
					{ type: 'divider' as const },
					selectionActionMap.get('paste_keys'),
					{ type: 'divider' as const },
					globalActionMap.get('refresh'),
					globalActionMap.get('go_to_path'),
					globalActionMap.get('global_search'),
					{ type: 'divider' as const },
					globalActionMap.get('commands'),
					globalActionMap.get('transfers'),
					globalActionMap.get('ui_mode'),
				].filter(Boolean) as UIActionOrDivider[],
			),
		[globalActionMap, selectionActionMap],
	)
	const listContextMenuBase = useMemo(
		() => buildActionMenu(listContextMenuActions, isAdvanced),
		[listContextMenuActions, isAdvanced],
	)
	const listContextMenu = useMemo(
		() =>
			withContextMenuClassName({
				...listContextMenuBase,
				style: {
					...listContextMenuBase.style,
					maxHeight: `min(${LIST_CONTEXT_MENU_MAX_HEIGHT_PX}px, calc(100vh - ${CONTEXT_MENU_VIEWPORT_PADDING_PX * 2}px))`,
					overflowY: 'auto',
					overflowX: 'hidden',
				},
			}),
		[listContextMenuBase, withContextMenuClassName],
	)

	const contextMenuOpen = contextMenuState.open && contextMenuState.source === 'context'
	const contextMenuMenu = useMemo(() => {
		if (!contextMenuOpen) return null
		if (contextMenuState.kind === 'list') return listContextMenu
		if (contextMenuState.kind === 'prefix' && contextMenuState.key) {
			return withContextMenuClassName(buildActionMenu(getPrefixActions(contextMenuState.key), isAdvanced))
		}
		if (contextMenuState.kind === 'object' && contextMenuState.key) {
			const item = objectByKey.get(contextMenuState.key)
			const actions =
				selectedCount > 1 && selectedKeys.has(contextMenuState.key)
					? selectionContextMenuActions
					: getObjectActions(contextMenuState.key, item?.size)
			return withContextMenuClassName(buildActionMenu(actions, isAdvanced))
		}
		return null
	}, [
		contextMenuOpen,
		contextMenuState.key,
		contextMenuState.kind,
		getObjectActions,
		getPrefixActions,
		isAdvanced,
		listContextMenu,
		objectByKey,
		selectedCount,
		selectedKeys,
		selectionContextMenuActions,
		withContextMenuClassName,
	])

	const contextMenuVisible = contextMenuOpen && !!contextMenuMenu && !!contextMenuPoint
	const contextMenuProps: MenuProps | null = useMemo(() => {
		if (!contextMenuMenu) return null
		return {
			...contextMenuMenu,
			className: [contextMenuMenu.className, 'ant-dropdown-menu'].filter(Boolean).join(' '),
			onClick: (info: Parameters<NonNullable<MenuProps['onClick']>>[0]) => {
				contextMenuMenu.onClick?.(info)
				closeContextMenu(undefined, 'menu')
			},
		}
	}, [closeContextMenu, contextMenuMenu])

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

	const getListScrollerElement = useCallback(() => {
		if (listScrollerEl) return listScrollerEl
		if (scrollContainerRef.current) return scrollContainerRef.current
		return document.querySelector<HTMLDivElement>('[data-testid="objects-upload-dropzone"] [tabindex="0"]')
	}, [listScrollerEl, scrollContainerRef])

	const shouldIgnoreContextMenuClose = useCallback((event?: Event) => {
		const target = event?.target
		if (!target || !(target instanceof HTMLElement)) return false
		return !!target.closest(`.${CONTEXT_MENU_CLASS_NAME}`)
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
	}, [positionContextMenu, contextMenuState.kind, contextMenuState.key, selectedCount])

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
		const handleClose = (event: Event) => {
			if (shouldIgnoreContextMenuClose(event)) return
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
			if (target?.closest('.ant-dropdown')) {
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

	return {
		contextMenuClassName: CONTEXT_MENU_CLASS_NAME,
		contextMenuRef,
		contextMenuState,
		contextMenuVisible,
		contextMenuProps,
		contextMenuStyle,
		withContextMenuClassName,
		getListScrollerElement,
		recordContextMenuPoint,
		openObjectContextMenu,
		openPrefixContextMenu,
		openListContextMenu,
		closeContextMenu,
		handleListScrollerContextMenu,
	}
}
