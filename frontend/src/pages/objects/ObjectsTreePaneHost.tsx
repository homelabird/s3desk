import { Suspense } from 'react'

import {
	loadingFavoritesTitle,
	loadingFoldersTitle,
} from '../../lib/actionHints'
import { ObjectsOverlaySheet } from './ObjectsOverlaySheet'
import { ObjectsTreePane } from './ObjectsTreePane'
import { ShellText } from './ObjectsPaneShellText'
import { OBJECTS_TREE_DRAWER_ID } from './objectsOverlayIds'
import shellStyles from './ObjectsShell.module.css'
import styles from './objects.module.css'
import { ObjectsTreeSection } from './objectsPageLazy'
import type { ObjectsPagePanesProps } from './ObjectsPagePaneTypes'

type ObjectsTreeSectionProps = ObjectsPagePanesProps['treeProps']

type TreeSectionFallbackProps = {
	dockTree: boolean
	treeDrawerOpen: boolean
	onClose: () => void
}

function TreeSectionFallback(props: TreeSectionFallbackProps) {
	const compactPaneSkeletonStyle = {
		minHeight: 52,
		padding: '10px 12px',
	}
	const content = (
		<div className={styles.treeStack} data-testid="objects-tree-content">
			<ObjectsTreePane title="Favorites" testId="objects-favorites-pane">
				<div className={shellStyles.paneSkeleton} data-testid="objects-favorites-pane-loading" style={compactPaneSkeletonStyle}>
					<ShellText>{loadingFavoritesTitle()}</ShellText>
				</div>
			</ObjectsTreePane>
			<ObjectsTreePane title="Folders" testId="objects-folders-pane">
				<div className={shellStyles.paneSkeleton} data-testid="objects-folders-pane-loading" style={compactPaneSkeletonStyle}>
					<ShellText>{loadingFoldersTitle()}</ShellText>
				</div>
			</ObjectsTreePane>
		</div>
	)

	if (props.dockTree) {
		return (
			<>
				<div className={`${shellStyles.layoutPane} ${shellStyles.layoutTreePane}`}>{content}</div>
				<div className={`${shellStyles.resizeHandle} ${shellStyles.layoutTreeHandle}`} aria-hidden="true">
					<div className={shellStyles.resizeBar} />
				</div>
			</>
		)
	}

	if (props.treeDrawerOpen) {
		return (
			<ObjectsOverlaySheet
				open
				onClose={props.onClose}
				title="Browse"
				placement="left"
				sheetId={OBJECTS_TREE_DRAWER_ID}
				width="min(100vw, 420px)"
				dataTestId="objects-tree-sheet"
				backdropInteractive={false}
				compactMobile
			>
				{content}
			</ObjectsOverlaySheet>
		)
	}

	return null
}

export function ObjectsTreePaneHost({ treeProps }: { treeProps: ObjectsTreeSectionProps }) {
	if (!treeProps.dockTree && !treeProps.treeDrawerOpen) return null

	return (
		<Suspense
			fallback={
				<TreeSectionFallback
					dockTree={treeProps.dockTree}
					treeDrawerOpen={treeProps.treeDrawerOpen}
					onClose={treeProps.onCloseDrawer}
				/>
			}
		>
			<ObjectsTreeSection {...treeProps} />
		</Suspense>
	)
}
