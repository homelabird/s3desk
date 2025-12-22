import type { ReactNode } from 'react'
import type { MenuProps } from 'antd'

export type CommandItem = {
	id: string
	label: string
	icon?: ReactNode
	keywords?: string
	enabled: boolean
	run: () => void
}

export type UIAction = {
	id: string
	label: string
	shortLabel?: string
	icon?: ReactNode
	keywords?: string
	danger?: boolean
	enabled: boolean
	audience?: 'all' | 'advanced'
	run: () => void
}

export type UIActionOrDivider = UIAction | { type: 'divider' }

type MenuItems = NonNullable<MenuProps['items']>
type MenuItemEntry = MenuItems[number]
type MenuDivider = Extract<MenuItemEntry, { type: 'divider' }>
type MenuItem = Exclude<MenuItemEntry, MenuDivider>
type MenuItemOverrides = Partial<Omit<MenuItem, 'children' | 'type'>>

export function buildActionMenu(items: UIActionOrDivider[], isAdvanced?: boolean): MenuProps {
	const actionById = new Map<string, UIAction>()
	const visibleItems = typeof isAdvanced === 'boolean' ? filterActionItems(items, isAdvanced) : items
	const menuItems = compactMenuItems(
		visibleItems.map((item) => {
			if ('type' in item) return { type: 'divider' as const }
			actionById.set(item.id, item)
			return actionToMenuItem(item)
		}),
	)

	return {
		items: menuItems,
		onClick: ({ key }) => {
			const action = actionById.get(String(key))
			if (!action || !action.enabled) return
			action.run()
		},
	}
}

export function isActionVisible(action: UIAction | undefined, isAdvanced: boolean): boolean {
	if (!action) return false
	if (action.audience === 'advanced' && !isAdvanced) return false
	return true
}

export function filterActions(items: UIAction[], isAdvanced: boolean): UIAction[] {
	return items.filter((action) => isActionVisible(action, isAdvanced))
}

export function filterActionItems(items: UIActionOrDivider[], isAdvanced: boolean): UIActionOrDivider[] {
	const filtered = items.filter((item) => ('type' in item ? true : isActionVisible(item, isAdvanced)))
	return trimActionDividers(filtered)
}

export function actionToMenuItem(action: UIAction | undefined, overrides?: MenuItemOverrides, isAdvanced?: boolean): MenuItem | null {
	if (!action) return null
	if (typeof isAdvanced === 'boolean' && !isActionVisible(action, isAdvanced)) return null
	return {
		key: action.id,
		label: action.label,
		icon: action.icon,
		danger: action.danger,
		disabled: !action.enabled,
		type: 'item' as const,
		...overrides,
	}
}

export function compactMenuItems(items: Array<MenuItemEntry | null | undefined>): MenuItems {
	const filtered = items.filter(Boolean) as MenuItems
	const out: MenuItems = []
	let lastDivider = true
	for (const item of filtered) {
		const isDivider = (item as { type?: string }).type === 'divider'
		if (isDivider) {
			if (lastDivider) continue
			out.push(item)
			lastDivider = true
			continue
		}
		out.push(item)
		lastDivider = false
	}
	while (out.length > 0 && (out[out.length - 1] as { type?: string }).type === 'divider') {
		out.pop()
	}
	return out
}

export function trimActionDividers(items: UIActionOrDivider[]): UIActionOrDivider[] {
	const out: UIActionOrDivider[] = []
	let previousDivider = true
	for (const item of items) {
		if ('type' in item) {
			if (previousDivider) continue
			out.push(item)
			previousDivider = true
			continue
		}
		out.push(item)
		previousDivider = false
	}
	while (out.length > 0 && 'type' in out[out.length - 1]) {
		out.pop()
	}
	return out
}

export function commandItemsFromActions(items: UIActionOrDivider[], idPrefix: string): CommandItem[] {
	const out: CommandItem[] = []
	for (const item of items) {
		if ('type' in item) continue
		out.push({
			id: `${idPrefix}${item.id}`,
			label: item.label,
			icon: item.icon,
			keywords: item.keywords,
			enabled: item.enabled,
			run: item.run,
		})
	}
	return out
}
