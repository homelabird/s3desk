import { DownOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useState, type CSSProperties } from 'react'

import { PopoverSurface, type PopoverOpenSource } from './PopoverSurface'
import styles from './MenuPopover.module.css'

type MenuItems = NonNullable<MenuProps['items']>
type MenuEntry = MenuItems[number]
type MenuDivider = Extract<MenuEntry, { type: 'divider' }>
type MenuItemNode = Exclude<MenuEntry, null | undefined | MenuDivider>

type MenuContentProps = {
	menu: MenuProps
	close: (source?: PopoverOpenSource) => void
	rootClassName?: string
	rootStyle?: CSSProperties
}

type MenuPopoverProps = {
	menu: MenuProps
	align?: 'start' | 'end'
	className?: string
	menuClassName?: string
	scopeKey?: string
	open?: boolean
	onOpenChange?: (open: boolean, info?: { source: PopoverOpenSource }) => void
	children: Parameters<typeof PopoverSurface>[0]['children']
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

function invokeMenuItem(item: MenuItemNode, menu: MenuProps, close: (source?: PopoverOpenSource) => void) {
	if ('disabled' in item && item.disabled) return
	const key = String(item.key ?? '')
	const info = createMenuInfo(key)
	if (hasOnClick(item)) item.onClick(info)
	if (typeof menu.onClick === 'function') menu.onClick(info)
	close('menu')
}

function MenuList(props: {
	items: MenuItems
	menu: MenuProps
	close: (source?: PopoverOpenSource) => void
	level?: number
	rootClassName?: string
	rootStyle?: CSSProperties
}) {
	const level = props.level ?? 0
	const className = [level === 0 ? styles.menu : styles.submenu, level === 0 ? props.rootClassName ?? '' : ''].filter(Boolean).join(' ')
	return (
		<div role={level === 0 ? 'menu' : 'group'} className={className} style={level === 0 ? props.rootStyle : undefined}>
			{props.items.map((item, index) => {
				if (!item) return null
				if (isDivider(item)) return <div key={`divider-${level}-${index}`} className={styles.divider} />
				if (hasChildren(item)) {
					return <MenuSubmenu key={String(item.key ?? `submenu-${index}`)} item={item} menu={props.menu} close={props.close} level={level} />
				}
				return (
					<button
						key={String(item.key ?? `item-${index}`)}
						type="button"
						role="menuitem"
						className={[styles.item, 'danger' in item && item.danger ? styles.itemDanger : ''].filter(Boolean).join(' ')}
						disabled={'disabled' in item ? !!item.disabled : false}
						onClick={() => invokeMenuItem(item, props.menu, props.close)}
					>
						{'icon' in item && item.icon ? <span className={styles.itemIcon}>{item.icon}</span> : null}
						<span className={styles.itemLabel}>{item.label}</span>
					</button>
				)
			})}
		</div>
	)
}

function MenuSubmenu(props: {
	item: MenuItemNode & { children: MenuItems }
	menu: MenuProps
	close: (source?: PopoverOpenSource) => void
	level: number
}) {
	const [open, setOpen] = useState(false)
	return (
		<div className={styles.section}>
			<button
				type="button"
				role="menuitem"
				className={styles.item}
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
				disabled={'disabled' in props.item ? !!props.item.disabled : false}
			>
				{'icon' in props.item && props.item.icon ? <span className={styles.itemIcon}>{props.item.icon}</span> : null}
				<span className={styles.itemLabel}>{props.item.label}</span>
				<DownOutlined className={[styles.itemChevron, open ? styles.itemChevronOpen : ''].filter(Boolean).join(' ')} />
			</button>
			{open ? <MenuList items={props.item.children} menu={props.menu} close={props.close} level={props.level + 1} /> : null}
		</div>
	)
}

export function MenuContent(props: MenuContentProps) {
	return (
		<MenuList
			items={props.menu.items ?? []}
			menu={props.menu}
			close={props.close}
			rootClassName={props.rootClassName ?? props.menu.className}
			rootStyle={props.rootStyle ?? props.menu.style}
		/>
	)
}

export function MenuPopover(props: MenuPopoverProps) {
	const [internalOpen, setInternalOpen] = useState(false)
	const [internalScopeKey, setInternalScopeKey] = useState('')
	const isControlled = typeof props.open === 'boolean'
	const internalScopeMatches = !props.scopeKey || internalScopeKey === props.scopeKey
	const visibleOpen = isControlled ? !!props.open : internalOpen && internalScopeMatches
	const applyOpen = (nextOpen: boolean, source: PopoverOpenSource = 'outside') => {
		if (!isControlled) {
			setInternalOpen(nextOpen)
			setInternalScopeKey(nextOpen && props.scopeKey ? props.scopeKey : '')
		}
		props.onOpenChange?.(nextOpen, { source })
	}
	return (
		<PopoverSurface
			align={props.align}
			className={props.className}
			contentClassName={props.menuClassName}
			open={visibleOpen}
			onOpenChange={(nextOpen, info) => applyOpen(nextOpen, info?.source)}
			content={({ close }) => <MenuContent menu={props.menu} close={close} />}
		>
			{({ close, setOpen }) =>
				props.children({
					open: visibleOpen,
					close,
					setOpen,
					toggle: () => setOpen(!visibleOpen, 'trigger'),
				})
			}
		</PopoverSurface>
	)
}
