import { useMemo } from 'react'
import type { MenuProps } from 'antd'

import { buildActionMenu, trimActionDividers } from './objectsActions'
import type { ContextMenuMatch, ContextMenuPoint, ContextMenuState, UseObjectsContextMenuArgs, WithContextMenuClassName } from './objectsContextMenuTypes'

export const CONTEXT_MENU_VIEWPORT_PADDING_PX = 8
const LIST_CONTEXT_MENU_MAX_HEIGHT_PX = 320
export const CONTEXT_MENU_CLASS_NAME = 'objects-context-menu'

type UseObjectsContextMenuMenuArgs = Pick<
	UseObjectsContextMenuArgs,
	| 'getObjectActions'
	| 'getPrefixActions'
	| 'globalActionMap'
	| 'isAdvanced'
	| 'objectByKey'
	| 'selectedCount'
	| 'selectedKeys'
	| 'selectionActionMap'
	| 'selectionContextMenuActions'
> & {
	contextMenuState: ContextMenuState
	contextMenuPoint: ContextMenuPoint | null
	closeContextMenu: (match?: ContextMenuMatch, reason?: string) => void
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined
}

export function useObjectsContextMenuMenu(args: UseObjectsContextMenuMenuArgs) {
	const {
		closeContextMenu,
		contextMenuPoint,
		contextMenuState,
		getObjectActions,
		getPrefixActions,
		globalActionMap,
		isAdvanced,
		objectByKey,
		selectedCount,
		selectedKeys,
		selectionActionMap,
		selectionContextMenuActions,
	} = args

	const withContextMenuClassName: WithContextMenuClassName = (menu) => ({
		...menu,
		className: menu.className,
		style: {
			...menu.style,
			maxHeight: menu.style?.maxHeight ?? `calc(100vh - ${CONTEXT_MENU_VIEWPORT_PADDING_PX * 2}px)`,
			overflowY: menu.style?.overflowY ?? 'auto',
		},
	})

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
				].filter(isDefined),
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
		[listContextMenuBase],
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
			const menuActions =
				selectedCount > 1 && selectedKeys.has(contextMenuState.key)
					? selectionContextMenuActions
					: getObjectActions(contextMenuState.key, item?.size)
			return withContextMenuClassName(buildActionMenu(menuActions, isAdvanced))
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
	])

	const contextMenuVisible = contextMenuOpen && !!contextMenuMenu && !!contextMenuPoint
	const contextMenuProps: MenuProps | null = useMemo(() => {
		if (!contextMenuMenu) return null
		return {
			...contextMenuMenu,
			onClick: (info) => {
				contextMenuMenu.onClick?.(info)
				closeContextMenu(undefined, 'menu')
			},
		}
	}, [closeContextMenu, contextMenuMenu])

	return {
		contextMenuVisible,
		contextMenuProps,
		withContextMenuClassName,
	}
}
