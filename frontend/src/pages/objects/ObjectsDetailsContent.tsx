import { Alert, Button, Empty, Spin, Typography } from 'antd'
import type { ReactNode } from 'react'

import type { ObjectMeta } from '../../api/types'
import {
	selectBucketFirstSentenceHint,
	selectObjectToLoadMetadataHint,
	selectObjectToSeeDetailsHint,
	selectProfileFirstSentenceHint,
} from '../../lib/actionHints'
import { ObjectsDetailsActions } from './ObjectsDetailsActions'
import { ObjectsDetailsPreviewSection } from './ObjectsDetailsMediaSections'
import { ObjectsDetailsMetadata } from './ObjectsDetailsMetadata'
import styles from './ObjectsDetails.module.css'
import { guessPreviewKind } from './objectsListUtils'
import type { ObjectPreview } from './objectsTypes'

export type ObjectsDetailsContentProps = {
	hasProfile: boolean
	hasBucket: boolean
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
	showPresignAction?: boolean
	onPresign: () => void
	isPresignLoading: boolean
	onCopyMove: (mode: 'copy' | 'move') => void
	onDelete: () => void
	isDeleteLoading: boolean
	thumbnail?: ReactNode
	previewThumbnail?: ReactNode
	preview: ObjectPreview | null
	onLoadPreview: () => void
	onCancelPreview: () => void
	canCancelPreview: boolean
	onOpenLargePreview: () => void
}

export function ObjectsDetailsContent(props: ObjectsDetailsContentProps) {
	const previewKind = props.detailsMeta ? guessPreviewKind(props.detailsMeta.contentType, props.detailsMeta.key) : null
	const canOpenLargePreview = previewKind === 'image' || previewKind === 'video'
	const previewFallbackThumbnail = props.previewThumbnail ?? props.thumbnail

	if (!props.hasProfile) {
		return <Typography.Text type="secondary">{selectProfileFirstSentenceHint()}</Typography.Text>
	}
	if (!props.hasBucket) {
		return <Typography.Text type="secondary">{selectBucketFirstSentenceHint()}</Typography.Text>
	}
	if (props.selectedCount === 0) {
		return <Empty description={selectObjectToSeeDetailsHint()} />
	}
	if (props.selectedCount > 1) {
		return (
			<div className={styles.detailsMessageStack}>
				<Typography.Text strong>{props.selectedCount} selected</Typography.Text>
				<Typography.Text type="secondary">Use the selection bar for bulk actions.</Typography.Text>
			</div>
		)
	}
	if (!props.detailsKey) {
		return <Typography.Text type="secondary">{selectObjectToLoadMetadataHint()}</Typography.Text>
	}

	return (
		<div className={styles.detailsContent} data-testid="objects-details-content">
			<ObjectsDetailsActions
				isAdvanced={props.isAdvanced}
				isDeleteLoading={props.isDeleteLoading}
				isPresignLoading={props.isPresignLoading}
				onCopyKey={props.onCopyKey}
				onCopyMove={props.onCopyMove}
				onDelete={props.onDelete}
				onDownload={props.onDownload}
				onPresign={props.onPresign}
				showPresignAction={props.showPresignAction}
			/>

			{props.isMetaFetching && !props.detailsMeta ? (
				<div className={styles.detailsFeedback} role="status" aria-live="polite" aria-label="Loading object metadata">
					<Spin />
					<Typography.Text type="secondary">Loading metadata...</Typography.Text>
				</div>
			) : props.isMetaError ? (
				<Alert
					type="error"
					showIcon
					title="Failed to load metadata"
					description={props.metaErrorMessage}
					action={
						<Button size="small" onClick={props.onRetryMeta} disabled={!props.detailsKey}>
							Retry
						</Button>
					}
				/>
			) : props.detailsMeta ? (
				<>
					<ObjectsDetailsMetadata detailsMeta={props.detailsMeta} />
					<ObjectsDetailsPreviewSection
						canCancelPreview={props.canCancelPreview}
						canOpenLargePreview={canOpenLargePreview}
						detailsKey={props.detailsKey}
						detailsMeta={props.detailsMeta}
						onCancelPreview={props.onCancelPreview}
						onLoadPreview={props.onLoadPreview}
						onOpenLargePreview={props.onOpenLargePreview}
						preview={props.preview}
						previewFallbackThumbnail={previewFallbackThumbnail}
					/>
				</>
			) : (
				<Typography.Text type="secondary">{selectObjectToLoadMetadataHint()}</Typography.Text>
			)}
		</div>
	)
}
