import { Suspense } from 'react'

import { ObjectsDetailsPaneHost } from './ObjectsDetailsPaneHost'
import { ObjectsLayout } from './ObjectsLayout'
import { ObjectsListPaneHost } from './ObjectsListPaneHost'
import type { ObjectsPagePanesProps } from './ObjectsPagePaneTypes'
import { ObjectsTreePaneHost } from './ObjectsTreePaneHost'
import { ObjectsContextMenuPortal } from './objectsPageLazy'

export type { ObjectsPagePanesProps } from './ObjectsPagePaneTypes'

export function ObjectsPagePanes({
	layoutRef,
	layoutProps,
	treeProps,
	contextMenuPortalProps,
	listProps,
	detailsProps,
}: ObjectsPagePanesProps) {
	if (!treeProps.hasBucket) return null
	const {
		contextMenuClassName,
		contextMenuRef,
		contextMenuVisible,
		contextMenuProps,
		contextMenuStyle,
	} = contextMenuPortalProps

	return (
		<ObjectsLayout ref={layoutRef} {...layoutProps}>
			<ObjectsTreePaneHost treeProps={treeProps} />
			{contextMenuVisible && contextMenuProps && contextMenuStyle ? (
				<Suspense fallback={null}>
					<ObjectsContextMenuPortal
						contextMenuClassName={contextMenuClassName}
						contextMenuRef={contextMenuRef}
						contextMenuProps={contextMenuProps}
						contextMenuStyle={contextMenuStyle}
					/>
				</Suspense>
			) : null}
			<ObjectsListPaneHost listProps={listProps} />
			<ObjectsDetailsPaneHost detailsProps={detailsProps} />
		</ObjectsLayout>
	)
}
