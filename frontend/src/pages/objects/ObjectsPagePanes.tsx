import { ObjectsContextMenuPortalHost } from './ObjectsContextMenuPortalHost'
import { ObjectsDetailsPaneHost } from './ObjectsDetailsPaneHost'
import { ObjectsLayout } from './ObjectsLayout'
import { ObjectsListPaneHost } from './ObjectsListPaneHost'
import type { ObjectsPagePanesProps } from './ObjectsPagePaneTypes'
import { ObjectsTreePaneHost } from './ObjectsTreePaneHost'

export type { ObjectsPagePanesProps } from './ObjectsPagePaneTypes'

export function ObjectsPagePanes({
	layoutRef,
	layoutProps,
	treeProps,
	contextMenuPortalProps,
	listProps,
	detailsProps,
}: ObjectsPagePanesProps) {
	return (
		<ObjectsLayout ref={layoutRef} {...layoutProps}>
			<ObjectsTreePaneHost treeProps={treeProps} />
			<ObjectsContextMenuPortalHost {...contextMenuPortalProps} />
			<ObjectsListPaneHost listProps={listProps} />
			<ObjectsDetailsPaneHost detailsProps={detailsProps} />
		</ObjectsLayout>
	)
}
