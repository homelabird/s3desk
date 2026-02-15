import type { MenuProps } from 'antd'
import { Alert, Menu, Typography } from 'antd'
import type {
	CSSProperties,
	DragEvent,
	KeyboardEvent,
	MouseEvent,
	Ref,
	UIEvent,
	WheelEvent,
} from 'react'
import { Suspense } from 'react'
import { createPortal } from 'react-dom'

import { ObjectsLayout, type ObjectsLayoutProps } from './ObjectsLayout'
import { ObjectsListHeader } from './ObjectsListHeader'
import { ObjectsListSectionContainer } from './ObjectsListSectionContainer'
import { ObjectsSelectionBarSection } from './ObjectsSelectionBarSection'
import styles from './objects.module.css'
import { ObjectsDetailsPanelSection, ObjectsListContent, ObjectsListControls, ObjectsTreeSection } from './objectsPageLazy'

type ObjectsTreeSectionProps = Parameters<typeof import('./ObjectsTreeSection').ObjectsTreeSection>[0]
type ObjectsListControlsProps = Parameters<typeof import('./ObjectsListControls').ObjectsListControls>[0]
type ObjectsListContentProps = Parameters<typeof import('./ObjectsListContent').ObjectsListContent>[0]
type ObjectsSelectionBarSectionProps = Parameters<typeof import('./ObjectsSelectionBarSection').ObjectsSelectionBarSection>[0]
type ObjectsListHeaderProps = Parameters<typeof import('./ObjectsListHeader').ObjectsListHeader>[0]
type ObjectsDetailsPanelSectionProps = Parameters<typeof import('./ObjectsDetailsPanelSection').ObjectsDetailsPanelSection>[0]

type ContextMenuPortalProps = {
	contextMenuClassName: string
	contextMenuRef: Ref<HTMLDivElement>
	contextMenuVisible: boolean
	contextMenuProps: MenuProps | null
	contextMenuStyle: CSSProperties | null
}

type ObjectsListPaneProps = {
	controlsProps: ObjectsListControlsProps
	isOffline: boolean
	favoritesOnly: boolean
	favoritesErrorMessage: string | null
	objectsErrorMessage: string | null
	hasBucket: boolean
	uploadDropActive: boolean
	uploadDropLabel: string
	onUploadDragEnter: (e: DragEvent) => void
	onUploadDragLeave: (e: DragEvent) => void
	onUploadDragOver: (e: DragEvent) => void
	onUploadDrop: (e: DragEvent) => void
	selectionBarProps: ObjectsSelectionBarSectionProps
	listHeaderProps: ObjectsListHeaderProps
	listScrollerRef: Ref<HTMLDivElement>
	listScrollerTabIndex?: number
	onListScrollerClick?: (e: MouseEvent<HTMLDivElement>) => void
	onListScrollerKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
	onListScrollerScroll?: (e: UIEvent<HTMLDivElement>) => void
	onListScrollerWheel?: (e: WheelEvent<HTMLDivElement>) => void
	onListScrollerContextMenu?: (e: MouseEvent<HTMLDivElement>) => void
	contentProps: ObjectsListContentProps
}

export type ObjectsPagePanesProps = {
	layoutRef: Ref<HTMLDivElement>
	layoutProps: Omit<ObjectsLayoutProps, 'children'>
	treeProps: ObjectsTreeSectionProps
	contextMenuPortalProps: ContextMenuPortalProps
	listProps: ObjectsListPaneProps
	detailsProps: ObjectsDetailsPanelSectionProps
}

export function ObjectsPagePanes({ layoutRef, layoutProps, treeProps, contextMenuPortalProps, listProps, detailsProps }: ObjectsPagePanesProps) {
	const { contextMenuClassName, contextMenuRef, contextMenuVisible, contextMenuProps, contextMenuStyle } = contextMenuPortalProps

	const paneFallback = (
		<div className={styles.paneSkeleton}>
			<Typography.Text type="secondary">Loading…</Typography.Text>
		</div>
	)
	const listFallback = (
		<div className={styles.listSkeleton}>
			<Typography.Text type="secondary">Loading list…</Typography.Text>
		</div>
	)
	const controlsFallback = (
		<div className={styles.controlsSkeleton}>
			<Typography.Text type="secondary">Loading controls…</Typography.Text>
		</div>
	)

	const contextMenuPortal =
		contextMenuVisible &&
		contextMenuProps &&
		contextMenuStyle &&
		typeof document !== 'undefined'
			? createPortal(
					<div
						ref={contextMenuRef}
						className={`${contextMenuClassName} ant-dropdown`}
						style={contextMenuStyle}
						onContextMenu={(event) => event.preventDefault()}
					>
						<Menu {...contextMenuProps} selectable={false} />
					</div>,
					document.body,
				)
			: null

	const listAlerts = (
		<>
			{listProps.isOffline ? <Alert type="warning" showIcon title="Offline: object actions are disabled." /> : null}
			{listProps.favoritesOnly ? (
				listProps.favoritesErrorMessage ? (
					<Alert type="error" showIcon title="Failed to load favorites" description={listProps.favoritesErrorMessage} />
				) : null
			) : listProps.objectsErrorMessage ? (
				<Alert type="error" showIcon title="Failed to list objects" description={listProps.objectsErrorMessage} />
			) : null}
			{listProps.hasBucket ? null : <Alert type="info" showIcon title="Select a bucket to browse objects." />}
		</>
	)

	const listControls = (
		<Suspense fallback={controlsFallback}>
			<ObjectsListControls {...listProps.controlsProps} />
		</Suspense>
	)
	const listContent = (
		<Suspense fallback={listFallback}>
			<ObjectsListContent {...listProps.contentProps} />
		</Suspense>
	)

	return (
		<ObjectsLayout ref={layoutRef} {...layoutProps}>
			<Suspense fallback={paneFallback}>
				<ObjectsTreeSection {...treeProps} />
			</Suspense>

			{contextMenuPortal}

			<ObjectsListSectionContainer
				controls={listControls}
				alerts={listAlerts}
				uploadDropActive={listProps.uploadDropActive}
				uploadDropLabel={listProps.uploadDropLabel}
				onUploadDragEnter={listProps.onUploadDragEnter}
				onUploadDragLeave={listProps.onUploadDragLeave}
				onUploadDragOver={listProps.onUploadDragOver}
				onUploadDrop={listProps.onUploadDrop}
				selectionBar={<ObjectsSelectionBarSection {...listProps.selectionBarProps} />}
				listHeader={<ObjectsListHeader {...listProps.listHeaderProps} />}
				listScrollerRef={listProps.listScrollerRef}
				listScrollerTabIndex={listProps.listScrollerTabIndex}
				onListScrollerClick={listProps.onListScrollerClick}
				onListScrollerKeyDown={listProps.onListScrollerKeyDown}
				onListScrollerScroll={listProps.onListScrollerScroll}
				onListScrollerWheel={listProps.onListScrollerWheel}
				onListScrollerContextMenu={listProps.onListScrollerContextMenu}
				listContent={listContent}
			/>

			<Suspense fallback={paneFallback}>
				<ObjectsDetailsPanelSection {...detailsProps} />
			</Suspense>
		</ObjectsLayout>
	)
}
