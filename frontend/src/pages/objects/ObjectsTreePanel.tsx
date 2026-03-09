import { Button } from 'antd'
import { FolderAddOutlined } from '@ant-design/icons'
import type { DragEvent, MouseEvent as ReactMouseEvent, PointerEvent } from 'react'

import styles from './objects.module.css'
import { ObjectsFavoritesPane } from './ObjectsFavoritesPane'
import { ObjectsOverlaySheet } from './ObjectsOverlaySheet'
import { ObjectsTreePane } from './ObjectsTreePane'
import { ObjectsTreeView } from './ObjectsTreeView'
import type { FavoriteObjectItem } from '../../api/types'
import type { TreeNode } from '../../lib/tree'

type ObjectsTreePanelProps = {
	dockTree: boolean
	treeDrawerOpen: boolean
	hasProfile: boolean
	hasBucket: boolean
	favorites: FavoriteObjectItem[]
	favoriteCount: number
	favoritesSearch: string
	onFavoritesSearchChange: (value: string) => void
	favoritesOnly: boolean
	onFavoritesOnlyChange: (value: boolean) => void
	favoritesOpenDetails: boolean
	onFavoritesOpenDetailsChange: (value: boolean) => void
	favoritesExpanded: boolean
	onFavoritesExpandedChange: (expanded: boolean) => void
	onSelectFavorite: (key: string) => void
	onSelectFavoriteFromDrawer: (key: string) => void
	favoritesLoading: boolean
	favoritesError?: string | null
	treeData: TreeNode[]
	loadingKeys?: string[]
	expandedKeys: string[]
	selectedKeys: string[]
	onExpandedKeysChange: (keys: string[]) => void
	onSelectKey: (key: string) => void
	onSelectKeyFromDrawer: (key: string) => void
	onLoadData: (nodeKey: string) => Promise<void>
	getDropTargetPrefix: (nodeKey: string) => string
	canDragDrop: boolean
	dndHoverPrefix: string | null
	onDndTargetDragOver: (event: DragEvent, nodeKey: string) => void
	onDndTargetDragLeave: (event: DragEvent, nodeKey: string) => void
	onDndTargetDrop: (event: DragEvent, nodeKey: string) => void
	onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void
	onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void
	onResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void
	canCreateFolder: boolean
	createFolderTooltipText: string
	onNewFolderAtPrefix: (prefixKey: string) => void
	onPrefixContextMenu: (event: ReactMouseEvent, prefixKey: string) => void
	onCloseDrawer: () => void
}

export function ObjectsTreePanel(props: ObjectsTreePanelProps) {
	const favoritesQuery = props.favoritesSearch.trim()
	const favoritesExpanded = props.favoritesExpanded || favoritesQuery.length > 0 || props.favoritesOnly

	const renderTreeView = (onSelectKey: (key: string) => void) => (
		<ObjectsTreeView
			hasProfile={props.hasProfile}
			hasBucket={props.hasBucket}
			treeData={props.treeData}
			loadingKeys={props.loadingKeys}
			onLoadData={props.onLoadData}
			selectedKeys={props.selectedKeys}
			expandedKeys={props.expandedKeys}
			onExpandedKeysChange={props.onExpandedKeysChange}
			onSelectKey={onSelectKey}
			getDropTargetPrefix={props.getDropTargetPrefix}
			canDragDrop={props.canDragDrop}
			dndHoverPrefix={props.dndHoverPrefix}
			onDndTargetDragOver={props.onDndTargetDragOver}
			onDndTargetDragLeave={props.onDndTargetDragLeave}
			onDndTargetDrop={props.onDndTargetDrop}
			onPrefixContextMenu={props.onPrefixContextMenu}
		/>
	)

	const renderPanel = (onSelectKey: (key: string) => void, onSelectFavorite: (key: string) => void) => {
		const selectedKey = String(props.selectedKeys[0] ?? '/')
		const newFolderLabel = selectedKey === '/' ? 'New folder' : 'New subfolder'
		return (
			<div className={styles.treeStack}>
				<ObjectsFavoritesPane
					hasProfile={props.hasProfile}
					hasBucket={props.hasBucket}
					favorites={props.favorites}
					favoriteCount={props.favoriteCount}
					favoritesOnly={props.favoritesOnly}
					onFavoritesOnlyChange={props.onFavoritesOnlyChange}
					openDetailsOnClick={props.favoritesOpenDetails}
					onOpenDetailsOnClickChange={props.onFavoritesOpenDetailsChange}
					query={props.favoritesSearch}
					onQueryChange={props.onFavoritesSearchChange}
					onSelectFavorite={onSelectFavorite}
					isLoading={props.favoritesLoading}
					errorMessage={props.favoritesError}
					expanded={favoritesExpanded}
					onExpandedChange={props.onFavoritesExpandedChange}
				/>
				<ObjectsTreePane
					title="Folders"
					testId="objects-folders-pane"
					extra={
						<span
							title={
								props.canCreateFolder
									? selectedKey === '/'
										? 'New folder (Ctrl+Shift+N)'
										: 'New subfolder'
									: props.createFolderTooltipText
							}
						>
							<Button
								size="small"
								type="text"
								icon={<FolderAddOutlined />}
								disabled={!props.canCreateFolder}
								aria-label={newFolderLabel}
								onClick={() => props.onNewFolderAtPrefix(selectedKey)}
							/>
						</span>
					}
				>
					{renderTreeView(onSelectKey)}
				</ObjectsTreePane>
			</div>
		)
	}

	return (
		<>
			{props.dockTree ? (
				<>
					<div className={`${styles.layoutPane} ${styles.layoutTreePane}`}>
						{renderPanel(props.onSelectKey, props.onSelectFavorite)}
					</div>

					<div
						onPointerDown={props.onResizePointerDown}
						onPointerMove={props.onResizePointerMove}
						onPointerUp={props.onResizePointerUp}
						onPointerCancel={props.onResizePointerUp}
						className={`${styles.resizeHandle} ${styles.layoutTreeHandle}`}
					>
						<div className={styles.resizeBar} />
					</div>
				</>
			) : null}

			<ObjectsOverlaySheet
				open={!props.dockTree && props.treeDrawerOpen}
				onClose={props.onCloseDrawer}
				title="Browse"
				placement="left"
				width="min(90vw, 420px)"
				dataTestId="objects-tree-sheet"
			>
				{renderPanel(props.onSelectKeyFromDrawer, props.onSelectFavoriteFromDrawer)}
			</ObjectsOverlaySheet>
		</>
	)
}
