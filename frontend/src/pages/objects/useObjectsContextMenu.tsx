import { useCallback, useState } from 'react'

import {
	type ContextMenuMatch,
	type ContextMenuPoint,
	type ContextMenuState,
	type UseObjectsContextMenuArgs,
} from './objectsContextMenuTypes'
import { CONTEXT_MENU_CLASS_NAME, useObjectsContextMenuMenu } from './useObjectsContextMenuMenu'
import { useObjectsContextMenuLifecycle } from './useObjectsContextMenuLifecycle'

export type {
	ContextMenuKind,
	ContextMenuMatch,
	ContextMenuPoint,
	ContextMenuSource,
	ContextMenuState,
} from './objectsContextMenuTypes'

export function useObjectsContextMenu({
	scopeKey,
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
	const [contextMenuScopeKey, setContextMenuScopeKey] = useState('')
	const contextMenuScopeMatches = contextMenuScopeKey === scopeKey
	const visibleContextMenuState = contextMenuScopeMatches
		? contextMenuState
		: {
				open: false,
				source: null,
				kind: null,
				key: null,
			}
	const visibleContextMenuPoint = contextMenuScopeMatches ? contextMenuPoint : null

	const recordContextMenuPoint = useCallback((event: React.MouseEvent) => {
		const nextPoint = { x: event.clientX, y: event.clientY }
		setContextMenuPoint(nextPoint)
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
				setContextMenuScopeKey('')
				setContextMenuPoint(null)
			}
		},
		[debugEnabled, log],
	)

	const openObjectContextMenu = useCallback(
		(key: string, source: 'context' | 'button', point?: ContextMenuPoint) => {
			if (point) setContextMenuPoint(point)
			ensureObjectSelected(key)
			log(debugEnabled, 'open', {
				kind: 'object',
				key,
				source,
				point: point ?? contextMenuPoint ?? undefined,
			})
			setContextMenuScopeKey(scopeKey)
			setContextMenuState({ open: true, source, kind: 'object', key })
		},
		[contextMenuPoint, debugEnabled, ensureObjectSelected, log, scopeKey],
	)

	const openPrefixContextMenu = useCallback(
		(key: string, source: 'context' | 'button', point?: ContextMenuPoint) => {
			if (point) setContextMenuPoint(point)
			log(debugEnabled, 'open', {
				kind: 'prefix',
				key,
				source,
				point: point ?? contextMenuPoint ?? undefined,
			})
			setContextMenuScopeKey(scopeKey)
			setContextMenuState({ open: true, source, kind: 'prefix', key })
		},
		[contextMenuPoint, debugEnabled, log, scopeKey],
	)

	const openListContextMenu = useCallback(
		(point?: ContextMenuPoint) => {
			if (point) setContextMenuPoint(point)
			log(debugEnabled, 'open', {
				kind: 'list',
				key: 'list',
				source: 'context',
				point: point ?? contextMenuPoint ?? undefined,
			})
			setContextMenuScopeKey(scopeKey)
			setContextMenuState({ open: true, source: 'context', kind: 'list', key: 'list' })
		},
		[contextMenuPoint, debugEnabled, log, scopeKey],
	)

	const { contextMenuVisible, contextMenuProps, withContextMenuClassName } = useObjectsContextMenuMenu({
		contextMenuState: visibleContextMenuState,
		contextMenuPoint: visibleContextMenuPoint,
		getObjectActions,
		getPrefixActions,
		globalActionMap,
		isAdvanced,
		objectByKey,
		selectedCount,
		selectedKeys,
		selectionActionMap,
		selectionContextMenuActions,
		closeContextMenu,
	})

	const { contextMenuRef, contextMenuStyle, getListScrollerElement, handleListScrollerContextMenu } =
		useObjectsContextMenuLifecycle({
			listScrollerEl,
			scrollContainerRef,
			selectedCount,
			contextMenuState: visibleContextMenuState,
			contextMenuPoint: visibleContextMenuPoint,
			contextMenuVisible,
			recordContextMenuPoint,
			openListContextMenu,
			closeContextMenu,
		})

	return {
		contextMenuClassName: CONTEXT_MENU_CLASS_NAME,
		contextMenuRef,
		contextMenuState: visibleContextMenuState,
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
