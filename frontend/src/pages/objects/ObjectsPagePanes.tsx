import type { MenuProps } from 'antd'
import type {
	CSSProperties,
	DragEvent,
	KeyboardEvent,
	MouseEvent,
	Ref,
	UIEvent,
	WheelEvent,
} from 'react'
import { Suspense, useEffect, useState } from 'react'

import { ObjectsLayout, type ObjectsLayoutProps } from './ObjectsLayout'
import { ObjectsListHeader } from './ObjectsListHeader'
import { ObjectsListSectionContainer } from './ObjectsListSectionContainer'
import { ObjectsSelectionBarSection } from './ObjectsSelectionBarSection'
import shellStyles from './ObjectsShell.module.css'
import styles from './objects.module.css'
import {
	ObjectsContextMenuPortal,
	ObjectsDetailsPanelSection,
	ObjectsListContent,
	ObjectsListControls,
	ObjectsTreeSection,
} from './objectsPageLazy'

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

type IdleWindow = typeof window & {
	requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
	cancelIdleCallback?: (handle: number) => void
}

function scheduleIdleLoad(callback: () => void) {
	if (typeof window === 'undefined') return () => undefined

	const idleWindow = window as IdleWindow
	if (idleWindow.requestIdleCallback) {
		const handle = idleWindow.requestIdleCallback(callback, { timeout: 1200 })
		return () => idleWindow.cancelIdleCallback?.(handle)
	}

	const handle = window.setTimeout(callback, 0)
	return () => window.clearTimeout(handle)
}

function ShellText({ children }: { children: string }) {
	return <span className={shellStyles.shellTextMuted}>{children}</span>
}

function InlineAlert(props: { tone: 'info' | 'warning' | 'error'; title: string; description?: string | null }) {
	return (
		<div
			className={[
				shellStyles.inlineAlert,
				props.tone === 'info' ? shellStyles.inlineAlertInfo : null,
				props.tone === 'warning' ? shellStyles.inlineAlertWarning : null,
				props.tone === 'error' ? shellStyles.inlineAlertError : null,
			]
				.filter(Boolean)
				.join(' ')}
			role={props.tone === 'error' ? 'alert' : undefined}
		>
			<strong className={shellStyles.inlineAlertTitle}>{props.title}</strong>
			{props.description ? <span className={shellStyles.inlineAlertDescription}>{props.description}</span> : null}
		</div>
	)
}

export function ObjectsPagePanes({ layoutRef, layoutProps, treeProps, contextMenuPortalProps, listProps, detailsProps }: ObjectsPagePanesProps) {
	const { contextMenuClassName, contextMenuRef, contextMenuVisible, contextMenuProps, contextMenuStyle } = contextMenuPortalProps
	const [listControlsReady, setListControlsReady] = useState(false)
	const shouldLoadTreePane = treeProps.dockTree || treeProps.treeDrawerOpen
	const shouldLoadDetailsPane =
		(detailsProps.dockDetails && detailsProps.detailsOpen) ||
		(detailsProps.detailsDrawerOpen && !detailsProps.detailsDrawerSuspended)
	const shouldShowCollapsedDetails = detailsProps.dockDetails && !detailsProps.detailsOpen
	const shouldDeferListControls = listProps.hasBucket

	useEffect(() => {
		if (listControlsReady) return
		if (!shouldDeferListControls) return
		return scheduleIdleLoad(() => setListControlsReady(true))
	}, [listControlsReady, shouldDeferListControls])

	const paneFallback = (
		<div className={shellStyles.paneSkeleton}>
			<ShellText>Loading…</ShellText>
		</div>
	)
	const listFallback = (
		<div className={shellStyles.listSkeleton}>
			<ShellText>Loading list…</ShellText>
		</div>
	)
	const controlsFallback = (
		<div className={shellStyles.controlsSkeleton}>
			<ShellText>Loading controls…</ShellText>
		</div>
	)

	const contextMenuPortal =
		contextMenuVisible &&
		contextMenuProps &&
		contextMenuStyle ? (
			<Suspense fallback={null}>
				<ObjectsContextMenuPortal
					contextMenuClassName={contextMenuClassName}
					contextMenuRef={contextMenuRef}
					contextMenuProps={contextMenuProps}
					contextMenuStyle={contextMenuStyle}
				/>
			</Suspense>
		)
			: null

	const listAlerts = (
		<div className={shellStyles.inlineAlertStack}>
			{listProps.isOffline ? <InlineAlert tone="warning" title="Offline: object actions are disabled." /> : null}
			{listProps.favoritesOnly ? (
				listProps.favoritesErrorMessage ? (
					<InlineAlert tone="error" title="Failed to load favorites" description={listProps.favoritesErrorMessage} />
				) : null
			) : listProps.objectsErrorMessage ? (
				<InlineAlert tone="error" title="Failed to list objects" description={listProps.objectsErrorMessage} />
			) : null}
			{listProps.hasBucket ? null : <InlineAlert tone="info" title="Select a bucket to browse objects." />}
		</div>
	)

	const listControls = (
		shouldDeferListControls ? (
			listControlsReady ? (
				<Suspense fallback={controlsFallback}>
					<ObjectsListControls {...listProps.controlsProps} />
				</Suspense>
			) : (
				controlsFallback
			)
		) : null
	)
	const listContent = (
		<Suspense fallback={listFallback}>
			<ObjectsListContent {...listProps.contentProps} />
		</Suspense>
	)
	const listHeader = listProps.controlsProps.viewMode === 'grid' ? null : <ObjectsListHeader {...listProps.listHeaderProps} />
	const detailsPane = shouldLoadDetailsPane ? (
		<Suspense fallback={paneFallback}>
			<ObjectsDetailsPanelSection {...detailsProps} />
		</Suspense>
	) : shouldShowCollapsedDetails ? (
		<>
			<div className={shellStyles.layoutDetailsHandle} aria-hidden="true" />
			<div className={`${shellStyles.layoutPane} ${shellStyles.layoutDetailsPane}`}>
				<div className={`${styles.panelCard} ${shellStyles.detailsCollapsed} ${styles.pane}`}>
					<button
						type="button"
						className={shellStyles.detailsCollapsedButton}
						onClick={detailsProps.onOpenDetails}
						aria-label="Show details"
					>
						i
					</button>
				</div>
			</div>
		</>
	) : null

	return (
		<ObjectsLayout ref={layoutRef} {...layoutProps}>
			{shouldLoadTreePane ? (
				<Suspense fallback={paneFallback}>
					<ObjectsTreeSection {...treeProps} />
				</Suspense>
			) : null}

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
				listHeader={listHeader}
				listScrollerRef={listProps.listScrollerRef}
				listScrollerTabIndex={listProps.listScrollerTabIndex}
				onListScrollerClick={listProps.onListScrollerClick}
				onListScrollerKeyDown={listProps.onListScrollerKeyDown}
				onListScrollerScroll={listProps.onListScrollerScroll}
				onListScrollerWheel={listProps.onListScrollerWheel}
				onListScrollerContextMenu={listProps.onListScrollerContextMenu}
				listContent={listContent}
			/>

			{detailsPane}
		</ObjectsLayout>
	)
}
