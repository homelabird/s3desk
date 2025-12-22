import type { PointerEvent } from 'react'

import type { ObjectMeta } from '../../api/types'
import type { ObjectPreview } from './objectsTypes'
import { ObjectsDetailsContent } from './ObjectsDetailsContent'
import { ObjectsDetailsPanel } from './ObjectsDetailsPanel'

type ObjectsDetailsPanelSectionProps = {
	profileId: string | null
	bucket: string
	isAdvanced: boolean
	selectedCount: number
	detailsKey: string | null
	detailsMeta: ObjectMeta | null
	isMetaFetching: boolean
	isMetaError: boolean
	metaErrorMessage: string
	onRetryMeta: () => void
	onCopyKey: () => void
	onDownload: () => void
	onPresign: () => void
	isPresignLoading: boolean
	onCopyMove: (mode: 'copy' | 'move') => void
	onDelete: () => void
	isDeleteLoading: boolean
	preview: ObjectPreview | null
	onLoadPreview: () => void
	onCancelPreview: () => void
	canCancelPreview: boolean
	dockDetails: boolean
	detailsOpen: boolean
	detailsDrawerOpen: boolean
	onOpenDetails: () => void
	onCloseDetails: () => void
	onCloseDrawer: () => void
	onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void
	onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void
	onResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void
}

export function ObjectsDetailsPanelSection(props: ObjectsDetailsPanelSectionProps) {
	const detailsPanelBody = (
		<ObjectsDetailsContent
			hasProfile={!!props.profileId}
			hasBucket={!!props.bucket}
			isAdvanced={props.isAdvanced}
			selectedCount={props.selectedCount}
			detailsKey={props.detailsKey}
			detailsMeta={props.detailsMeta}
			isMetaFetching={props.isMetaFetching}
			isMetaError={props.isMetaError}
			metaErrorMessage={props.metaErrorMessage}
			onRetryMeta={props.onRetryMeta}
			onCopyKey={props.onCopyKey}
			onDownload={props.onDownload}
			onPresign={props.onPresign}
			isPresignLoading={props.isPresignLoading}
			onCopyMove={props.onCopyMove}
			onDelete={props.onDelete}
			isDeleteLoading={props.isDeleteLoading}
			preview={props.preview}
			onLoadPreview={props.onLoadPreview}
			onCancelPreview={props.onCancelPreview}
			canCancelPreview={props.canCancelPreview}
		/>
	)

	return (
		<ObjectsDetailsPanel
			dockDetails={props.dockDetails}
			detailsOpen={props.detailsOpen}
			detailsDrawerOpen={props.detailsDrawerOpen}
			detailsPanelBody={detailsPanelBody}
			onOpenDetails={props.onOpenDetails}
			onCloseDetails={props.onCloseDetails}
			onCloseDrawer={props.onCloseDrawer}
			onResizePointerDown={props.onResizePointerDown}
			onResizePointerMove={props.onResizePointerMove}
			onResizePointerUp={props.onResizePointerUp}
		/>
	)
}
