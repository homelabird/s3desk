import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { useId, useMemo, useRef, useState } from 'react'

import styles from './appTabs.module.css'

export type AppTabItem = {
	key: string
	label: ReactNode
	children?: ReactNode
	disabled?: boolean
	closable?: boolean
	ariaLabel?: string
}

export type AppTabsProps = {
	items: AppTabItem[]
	activeKey?: string
	defaultActiveKey?: string
	onChange?: (key: string) => void
	type?: 'line' | 'card' | 'editable-card'
	size?: 'small' | 'middle' | 'large'
	onEdit?: (targetKey: string | null, action: 'add' | 'remove') => void
	ariaLabel?: string
	className?: string
	style?: CSSProperties
}

function safeIdPart(value: string): string {
	return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function AppTabs(props: AppTabsProps) {
	const baseId = useId()
	const [uncontrolledKey, setUncontrolledKey] = useState(() => props.defaultActiveKey ?? props.items[0]?.key ?? '')

	const resolvedActiveKey = props.activeKey ?? uncontrolledKey
	const safeActiveKey = props.items.some((item) => item.key === resolvedActiveKey)
		? resolvedActiveKey
		: (props.items[0]?.key ?? resolvedActiveKey)

	const tabButtonByKeyRef = useRef(new Map<string, HTMLButtonElement | null>())
	const setTabButtonRef = (key: string) => (el: HTMLButtonElement | null) => {
		tabButtonByKeyRef.current.set(key, el)
	}

	const enabledKeys = useMemo(() => props.items.filter((item) => !item.disabled).map((item) => item.key), [props.items])

	const selectKey = (key: string) => {
		const item = props.items.find((i) => i.key === key)
		if (!item || item.disabled) return
		if (props.activeKey == null) setUncontrolledKey(key)
		props.onChange?.(key)
	}

	const focusKey = (key: string) => {
		tabButtonByKeyRef.current.get(key)?.focus()
	}

	const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
		if (enabledKeys.length === 0) return

		const currentIndex = enabledKeys.indexOf(key)
		if (currentIndex === -1) return

		const moveTo = (index: number) => {
			const nextKey = enabledKeys[index]
			if (!nextKey) return
			event.preventDefault()
			selectKey(nextKey)
			focusKey(nextKey)
		}

		switch (event.key) {
			case 'ArrowRight':
				moveTo((currentIndex + 1) % enabledKeys.length)
				break
			case 'ArrowLeft':
				moveTo((currentIndex - 1 + enabledKeys.length) % enabledKeys.length)
				break
			case 'Home':
				moveTo(0)
				break
			case 'End':
				moveTo(enabledKeys.length - 1)
				break
			default:
				break
		}
	}

	const isCard = props.type === 'card' || props.type === 'editable-card'
	const rootClasses = [styles.root, props.className ?? null].filter(Boolean).join(' ')
	const listClasses = [
		styles.tabList,
		isCard ? styles.tabListCard : styles.tabListLine,
		props.size === 'small' ? styles.sizeSmall : null,
		props.size === 'large' ? styles.sizeLarge : null,
	]
		.filter(Boolean)
		.join(' ')

	const activeItem = props.items.find((item) => item.key === safeActiveKey)
	const activePanelId = `${baseId}-panel-${safeIdPart(safeActiveKey)}`
	const activeTabId = `${baseId}-tab-${safeIdPart(safeActiveKey)}`

	return (
		<div className={rootClasses} style={props.style}>
			<div className={listClasses} role="tablist" aria-label={props.ariaLabel}>
				{props.items.map((item) => {
					const selected = item.key === safeActiveKey
					const tabId = `${baseId}-tab-${safeIdPart(item.key)}`
					const panelId = `${baseId}-panel-${safeIdPart(item.key)}`
					const tabButtonClasses = [
						styles.tabButton,
						isCard ? styles.tabButtonCard : styles.tabButtonLine,
						selected ? (isCard ? styles.tabButtonCardActive : styles.tabButtonLineActive) : null,
						item.disabled ? styles.tabButtonDisabled : null,
					]
						.filter(Boolean)
						.join(' ')

					return (
						<div key={item.key} className={styles.tabWrap} role="presentation">
							<button
								ref={setTabButtonRef(item.key)}
								type="button"
								role="tab"
								id={tabId}
								aria-selected={selected}
								aria-controls={panelId}
								tabIndex={selected ? 0 : -1}
								disabled={item.disabled}
								className={tabButtonClasses}
								onClick={() => selectKey(item.key)}
								onKeyDown={(e) => onTabKeyDown(e, item.key)}
							>
								{item.label}
							</button>
							{props.type === 'editable-card' && props.onEdit && item.closable ? (
								<button
									type="button"
									className={styles.closeButton}
									aria-label={item.ariaLabel ? `Close tab: ${item.ariaLabel}` : 'Close tab'}
									onClick={(e) => {
										e.preventDefault()
										e.stopPropagation()
										props.onEdit?.(item.key, 'remove')
									}}
								>
									x
								</button>
							) : null}
						</div>
					)
				})}

				{props.type === 'editable-card' && props.onEdit ? (
					<button
						type="button"
						className={styles.addButton}
						onClick={() => props.onEdit?.(null, 'add')}
						aria-label="Add tab"
					>
						+ Add
					</button>
				) : null}
			</div>

			{activeItem?.children != null ? (
				<div role="tabpanel" id={activePanelId} aria-labelledby={activeTabId} className={styles.panel}>
					{activeItem.children}
				</div>
			) : null}
		</div>
	)
}
