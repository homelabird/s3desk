import type { MenuProps } from 'antd'
import type { CSSProperties, Ref } from 'react'
import { createPortal } from 'react-dom'

import styles from './objects.module.css'
import { ObjectsMenuContent } from './ObjectsMenuPopover'

type ObjectsContextMenuPortalProps = {
	contextMenuClassName: string
	contextMenuRef: Ref<HTMLDivElement>
	contextMenuProps: MenuProps
	contextMenuStyle: CSSProperties
}

export function ObjectsContextMenuPortal({
	contextMenuClassName,
	contextMenuRef,
	contextMenuProps,
	contextMenuStyle,
}: ObjectsContextMenuPortalProps) {
	if (typeof document === 'undefined') return null

	return createPortal(
		<div
			ref={contextMenuRef}
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
