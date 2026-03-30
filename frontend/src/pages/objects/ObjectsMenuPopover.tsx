import { DownOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useState, type CSSProperties, type ReactNode } from 'react'

import { PopoverSurface, type PopoverOpenSource } from '../../components/PopoverSurface'
import styles from './objects.module.css'

type MenuItems = NonNullable<MenuProps['items']>
type MenuEntry = MenuItems[number]
type MenuDivider = Extract<MenuEntry, { type: 'divider' }>
type MenuItemNode = Exclude<MenuEntry, null | undefined | MenuDivider>
type ObjectsMenuOpenSource = PopoverOpenSource

type ObjectsMenuContentProps = {
	menu: MenuProps
	close: (source?: ObjectsMenuOpenSource) => void
	rootClassName?: string
	rootStyle?: CSSProperties
}

type ObjectsMenuPopoverProps = {
	menu: MenuProps
	align?: 'start' | 'end'
	className?: string
	menuClassName?: string
	scopeKey?: string
	open?: boolean
	onOpenChange?: (open: boolean, info?: { source: ObjectsMenuOpenSource }) => void
	children: (args: {
		open: boolean
		toggle: () => void
		close: () => void
		setOpen: (next: boolean, source?: ObjectsMenuOpenSource) => void
	}) => ReactNode
}

export const OBJECTS_MENU_ROOT_SELECTOR = '[data-objects-menu-root="true"]'
const menuRootDataAttrs = { 'data-objects-menu-root': 'true' }
const APP_CONTENT_VIEWPORT_SELECTOR = '[data-scroll-container="app-content"]'

function getAppContentViewportRect(anchorElement: HTMLDivElement) {
	const viewportElement = anchorElement.closest(APP_CONTENT_VIEWPORT_SELECTOR)
	return viewportElement instanceof HTMLElement ? viewportElement.getBoundingClientRect() : null
}

function isDivider(item: MenuEntry): item is MenuDivider {
	return !!item && typeof item === 'object' && 'type' in item && item.type === 'divider'
}

function hasChildren(item: MenuItemNode): item is MenuItemNode & { children: MenuItems } {
	return Array.isArray((item as { children?: MenuItems }).children) && ((item as { children?: MenuItems }).children?.length ?? 0) > 0
}

function hasOnClick(item: MenuItemNode): item is MenuItemNode & { onClick: (...args: never[]) => void } {
	return typeof (item as { onClick?: unknown }).onClick === 'function'
}

function createMenuInfo(key: string) {
	return {
		key,
		keyPath: [key],
		item: null,
		domEvent: new MouseEvent('click'),
	} as never
}

function scheduleMenuClose(close: (source?: ObjectsMenuOpenSource) => void) {
	if (typeof window === 'undefined') {
		close('menu')
		return
	}
	window.setTimeout(() => close('menu'), 0)
}

function invokeMenuItem(item: MenuItemNode, menu: MenuProps, close: (source?: ObjectsMenuOpenSource) => void) {
	if ('disabled' in item && item.disabled) return
	const key = String(item.key ?? '')
	const info = createMenuInfo(key)
	if (hasOnClick(item)) {
		item.onClick(info)
	}
	if (typeof menu.onClick === 'function') {
		menu.onClick(info)
	}
	scheduleMenuClose(close)
}

function ObjectsMenuList(props: {
	items: MenuItems
	menu: MenuProps
	close: (source?: ObjectsMenuOpenSource) => void
	level?: number
	rootClassName?: string
	rootStyle?: CSSProperties
}) {
	const level = props.level ?? 0
	const className = [
		level === 0 ? styles.toolbarMenu : styles.toolbarSubmenu,
		level === 0 ? props.rootClassName ?? '' : '',
	]
		.filter(Boolean)
		.join(' ')
	return (
		<div role={level === 0 ? 'menu' : 'group'} className={className} style={level === 0 ? props.rootStyle : undefined}>
			{props.items.map((item, index) => {
				if (!item) return null
				if (isDivider(item)) return <div key={`divider-${level}-${index}`} className={styles.toolbarMenuDivider} />
				if (hasChildren(item)) {
					return (
						<ObjectsMenuSubmenu
							key={String(item.key ?? `submenu-${index}`)}
							item={item}
							menu={props.menu}
							close={props.close}
							level={level}
						/>
					)
				}
				return (
					<button
						key={String(item.key ?? `item-${index}`)}
						type="button"
						role="menuitem"
						className={`${styles.toolbarMenuItem} ${'danger' in item && item.danger ? styles.toolbarMenuItemDanger : ''}`}
						disabled={'disabled' in item ? !!item.disabled : false}
						onClick={(event) => {
							event.stopPropagation()
							invokeMenuItem(item, props.menu, props.close)
						}}
					>
						{'icon' in item && item.icon ? <span className={styles.toolbarMenuItemIcon}>{item.icon}</span> : null}
						<span className={styles.toolbarMenuItemLabel}>{item.label}</span>
					</button>
				)
			})}
		</div>
	)
}

function ObjectsMenuSubmenu(props: {
	item: MenuItemNode & { children: MenuItems }
	menu: MenuProps
	close: (source?: ObjectsMenuOpenSource) => void
	level: number
}) {
	const [open, setOpen] = useState(false)

	return (
		<div className={styles.toolbarMenuSection}>
			<button
				type="button"
				role="menuitem"
				className={styles.toolbarMenuItem}
				aria-expanded={open}
				onClick={(event) => {
					event.stopPropagation()
					setOpen((value) => !value)
				}}
				disabled={'disabled' in props.item ? !!props.item.disabled : false}
			>
				{'icon' in props.item && props.item.icon ? <span className={styles.toolbarMenuItemIcon}>{props.item.icon}</span> : null}
				<span className={styles.toolbarMenuItemLabel}>{props.item.label}</span>
				<DownOutlined className={`${styles.toolbarMenuItemChevron} ${open ? styles.toolbarMenuItemChevronOpen : ''}`} />
			</button>
			{open ? <ObjectsMenuList items={props.item.children} menu={props.menu} close={props.close} level={props.level + 1} /> : null}
		</div>
	)
}

export function ObjectsMenuContent(props: ObjectsMenuContentProps) {
	return (
		<ObjectsMenuList
			items={props.menu.items ?? []}
			menu={props.menu}
			close={props.close}
			rootClassName={props.rootClassName ?? props.menu.className}
			rootStyle={props.rootStyle ?? props.menu.style}
		/>
	)
}

export function ObjectsMenuPopover(props: ObjectsMenuPopoverProps) {
	const { align, children, className, menu, menuClassName, onOpenChange, open, scopeKey } = props
	const [internalOpen, setInternalOpen] = useState(false)
	const [internalScopeKey, setInternalScopeKey] = useState('')
	const isControlled = typeof open === 'boolean'
	const internalScopeMatches = !scopeKey || internalScopeKey === scopeKey
	const visibleOpen = isControlled ? !!open : internalOpen && internalScopeMatches
	const applyOpen = (nextOpen: boolean, source: ObjectsMenuOpenSource = 'outside') => {
		if (!isControlled) {
			setInternalOpen(nextOpen)
			setInternalScopeKey(nextOpen && scopeKey ? scopeKey : '')
		}
		onOpenChange?.(nextOpen, { source })
	}
	return (
		<PopoverSurface
			align={align}
			className={`${styles.toolbarMenuRoot} ${className ?? ''}`.trim()}
			contentClassName={`${styles.toolbarMenuPopover} ${align === 'end' ? styles.toolbarMenuPopoverEnd : ''} ${menuClassName ?? ''}`.trim()}
			rootProps={menuRootDataAttrs}
			contentProps={menuRootDataAttrs}
			getViewportRect={getAppContentViewportRect}
			open={visibleOpen}
			onOpenChange={(nextOpen, info) => applyOpen(nextOpen, info?.source)}
			content={({ close }) => <ObjectsMenuContent menu={menu} close={close} />}
		>
			{({ close, setOpen }) =>
				children({
					open: visibleOpen,
					close,
					setOpen,
					toggle: () => setOpen(!visibleOpen, 'trigger'),
				})
			}
		</PopoverSurface>
	)
}
