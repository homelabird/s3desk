import type { ObjectsPagePanesProps } from './ObjectsPagePanes'
import type { BuildObjectsPagePanesPropsArgs } from './buildObjectsPagePanesPropsTypes'

type TreeProps = ObjectsPagePanesProps['treeProps']

export function buildObjectsTreePaneProps(args: BuildObjectsPagePanesPropsArgs): TreeProps {
	const hasProfile = !!args.profileId
	const hasBucket = !!args.bucket

	return {
		dockTree: args.dockTree,
		treeDrawerOpen: args.treeDrawerOpen,
		hasProfile,
		hasBucket,
		favorites: args.favoriteItems,
		favoriteCount: args.favoriteCount,
		favoritesSearch: args.favoritesSearch,
		onFavoritesSearchChange: args.setFavoritesSearch,
		favoritesOnly: args.favoritesOnly,
		onFavoritesOnlyChange: args.setFavoritesOnly,
		favoritesExpanded: args.favoritesPaneExpanded,
		onFavoritesExpandedChange: args.setFavoritesPaneExpanded,
		onSelectFavorite: (key) => args.handleFavoriteSelect(key, false),
		onSelectFavoriteFromDrawer: (key) => args.handleFavoriteSelect(key, true),
		favoritesLoading: args.favoritesLoading,
		favoritesError: args.favoritesErrorMessage,
		treeData: args.treeData,
		treeError: args.treeErrorMessage,
		loadingKeys: args.treeLoadingKeys,
		onLoadData: args.onTreeLoadData,
		selectedKeys: args.treeSelectedKeys,
		expandedKeys: args.treeExpandedKeys,
		onExpandedKeysChange: args.setTreeExpandedKeys,
		onSelectKey: (key) => args.handleTreeSelect(key, false),
		onSelectKeyFromDrawer: (key) => args.handleTreeSelect(key, true),
		getDropTargetPrefix: args.normalizeDropTargetPrefix,
		canDragDrop: args.canDragDrop,
		dndHoverPrefix: args.dndHoverPrefix,
		onDndTargetDragOver: args.onDndTargetDragOver,
		onDndTargetDragLeave: args.onDndTargetDragLeave,
		onDndTargetDrop: args.onDndTargetDrop,
		onResizePointerDown: args.onTreeResizePointerDown,
		onResizePointerMove: args.onTreeResizePointerMove,
		onResizePointerUp: args.onTreeResizePointerUp,
		onResizeKeyDown: args.onTreeResizeKeyDown,
		resizeMinWidth: args.treeResizeMinWidth,
		resizeMaxWidth: args.treeResizeMaxWidth,
		resizeValue: args.treeWidthUsed,
		canCreateFolder: args.canCreateFolder,
		createFolderTooltipText: args.createFolderTooltipText,
		onNewFolderAtPrefix: args.openNewFolder,
		onPrefixContextMenu: args.handleTreePrefixContextMenu,
		onCloseDrawer: () => args.setTreeDrawerOpen(false),
	}
}
