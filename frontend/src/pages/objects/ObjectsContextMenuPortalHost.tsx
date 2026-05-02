import { Suspense } from 'react'

import { ObjectsContextMenuPortal } from './objectsPageLazy'
import type { ObjectsPagePanesProps } from './ObjectsPagePaneTypes'

type ContextMenuPortalProps = ObjectsPagePanesProps['contextMenuPortalProps']

export function ObjectsContextMenuPortalHost({
	contextMenuClassName,
	contextMenuRef,
	contextMenuVisible,
	contextMenuProps,
	contextMenuStyle,
}: ContextMenuPortalProps) {
	if (!contextMenuVisible || !contextMenuProps || !contextMenuStyle) return null

	return (
		<Suspense fallback={null}>
			<ObjectsContextMenuPortal
				contextMenuClassName={contextMenuClassName}
				contextMenuRef={contextMenuRef}
				contextMenuProps={contextMenuProps}
				contextMenuStyle={contextMenuStyle}
			/>
		</Suspense>
	)
}
