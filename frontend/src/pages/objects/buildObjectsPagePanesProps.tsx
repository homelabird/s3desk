import type { ObjectsPagePanesProps } from './ObjectsPagePanes'
import { buildObjectsDetailsPaneProps } from './buildObjectsDetailsPaneProps'
import { buildObjectsListPaneProps } from './buildObjectsListPaneProps'
import { buildObjectsTreePaneProps } from './buildObjectsTreePaneProps'
import type { BuildObjectsPagePanesPropsArgs } from './buildObjectsPagePanesPropsTypes'

export type { BuildObjectsPagePanesPropsArgs } from './buildObjectsPagePanesPropsTypes'

export function buildObjectsPagePanesProps(args: BuildObjectsPagePanesPropsArgs): Omit<ObjectsPagePanesProps, 'layoutRef'> {
	return {
		layoutProps: args.layoutProps,
		contextMenuPortalProps: args.contextMenuPortalProps,
		treeProps: buildObjectsTreePaneProps(args),
		listProps: buildObjectsListPaneProps(args),
		detailsProps: buildObjectsDetailsPaneProps(args),
	}
}
