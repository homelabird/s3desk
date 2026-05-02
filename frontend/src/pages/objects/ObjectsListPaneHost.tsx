import { Suspense, useEffect, useState } from 'react'

import {
	failedToListObjectsTitle,
	failedToLoadFavoritesTitle,
	loadingControlsTitle,
	loadingListTitle,
	offlineObjectActionsDisabledHint,
	selectBucketToBrowseObjectsHint,
} from '../../lib/actionHints'
import { ObjectsListSectionContainer } from './ObjectsListSectionContainer'
import { ObjectsSelectionBarSection } from './ObjectsSelectionBarSection'
import { ShellText } from './ObjectsPaneShellText'
import shellStyles from './ObjectsShell.module.css'
import {
	ObjectsListHeader,
	ObjectsListContent,
	ObjectsListControls,
} from './objectsPageLazy'
import { scheduleIdleLoad } from './objectsPaneIdle'
import type { ObjectsPagePanesProps } from './ObjectsPagePaneTypes'

type ObjectsListPaneProps = ObjectsPagePanesProps['listProps']

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

function ObjectsListAlerts({ listProps }: { listProps: ObjectsListPaneProps }) {
	return (
		<div className={shellStyles.inlineAlertStack}>
			{listProps.isOffline ? <InlineAlert tone="warning" title={offlineObjectActionsDisabledHint()} /> : null}
			{listProps.favoritesOnly ? (
				listProps.favoritesErrorMessage ? (
					<InlineAlert tone="error" title={failedToLoadFavoritesTitle()} description={listProps.favoritesErrorMessage} />
				) : null
			) : listProps.objectsErrorMessage ? (
				<InlineAlert tone="error" title={failedToListObjectsTitle()} description={listProps.objectsErrorMessage} />
			) : null}
			{listProps.hasBucket ? null : <InlineAlert tone="info" title={selectBucketToBrowseObjectsHint()} />}
		</div>
	)
}

export function ObjectsListPaneHost({ listProps }: { listProps: ObjectsListPaneProps }) {
	const [listControlsReady, setListControlsReady] = useState(false)
	const shouldDeferListControls = listProps.hasBucket
	const controlsFallback = (
		<div className={shellStyles.controlsSkeleton}>
			<ShellText>{loadingControlsTitle()}</ShellText>
		</div>
	)
	const listFallback = (
		<div className={shellStyles.listSkeleton}>
			<ShellText>{loadingListTitle()}</ShellText>
		</div>
	)

	useEffect(() => {
		if (listControlsReady) return
		if (!shouldDeferListControls) return
		return scheduleIdleLoad(() => setListControlsReady(true))
	}, [listControlsReady, shouldDeferListControls])

	const listControls = shouldDeferListControls ? (
		listControlsReady ? (
			<Suspense fallback={controlsFallback}>
				<ObjectsListControls {...listProps.controlsProps} />
			</Suspense>
		) : (
			controlsFallback
		)
	) : null
	const listHeader =
		listProps.controlsProps.viewMode === 'grid' ? null : (
			<Suspense fallback={null}>
				<ObjectsListHeader {...listProps.listHeaderProps} />
			</Suspense>
		)
	const listContent = (
		<Suspense fallback={listFallback}>
			<ObjectsListContent {...listProps.contentProps} />
		</Suspense>
	)

	return (
		<ObjectsListSectionContainer
			controls={listControls}
			alerts={<ObjectsListAlerts listProps={listProps} />}
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
	)
}
