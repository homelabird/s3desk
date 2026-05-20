import type { MenuProps } from 'antd'
import { useCallback, useEffect, useRef, type CSSProperties, type Ref } from 'react'
import { createPortal } from 'react-dom'

import styles from './objects.module.css'
import { ObjectsMenuContent } from './ObjectsMenuPopover'

type ObjectsContextMenuPortalProps = {
	contextMenuClassName: string
	contextMenuRef: Ref<HTMLDivElement>
	contextMenuProps: MenuProps
	contextMenuStyle: CSSProperties
}

function assignRef<T>(ref: Ref<T>, value: T | null) {
	if (typeof ref === 'function') {
		ref(value)
		return
	}
	if (ref) {
		const mutableRef = ref as { current: T | null }
		mutableRef.current = value
	}
}

function focusFirstContextMenuItem(panel: HTMLDivElement | null) {
	panel?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus()
}

export function ObjectsContextMenuPortal({
	contextMenuClassName,
	contextMenuRef,
	contextMenuProps,
	contextMenuStyle,
}: ObjectsContextMenuPortalProps) {
	const panelRef = useRef<HTMLDivElement | null>(null)
	const setPanelRef = useCallback(
		(node: HTMLDivElement | null) => {
			panelRef.current = node
			assignRef(contextMenuRef, node)
		},
		[contextMenuRef],
	)

	useEffect(() => {
		if (typeof window === 'undefined') {
			focusFirstContextMenuItem(panelRef.current)
			return undefined
		}
		const frame = window.requestAnimationFrame(() => {
			focusFirstContextMenuItem(panelRef.current)
		})
		return () => window.cancelAnimationFrame(frame)
	}, [contextMenuProps])

	if (typeof document === 'undefined') return null

	return createPortal(
		<div
			ref={setPanelRef}
			className={`${contextMenuClassName} ${styles.contextMenuPanel}`.trim()}
			data-testid="objects-context-menu"
			data-objects-menu-root="true"
			style={contextMenuStyle}
			onContextMenu={(event) => event.preventDefault()}
		>
			<ObjectsMenuContent menu={contextMenuProps} close={() => {}} rootClassName={styles.contextMenuMenu} />
		</div>,
		document.body,
	)
}
