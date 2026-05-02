import { CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, LinkOutlined, SnippetsOutlined } from '@ant-design/icons'
import { Button } from 'antd'

import styles from './ObjectsDetails.module.css'

type ObjectsDetailsActionsProps = {
	isAdvanced: boolean
	isDeleteLoading: boolean
	isPresignLoading: boolean
	onCopyKey: () => void
	onCopyMove: (mode: 'copy' | 'move') => void
	onDelete: () => void
	onDownload: () => void
	onPresign: () => void
	showPresignAction?: boolean
}

export function ObjectsDetailsActions({
	isAdvanced,
	isDeleteLoading,
	isPresignLoading,
	onCopyKey,
	onCopyMove,
	onDelete,
	onDownload,
	onPresign,
	showPresignAction,
}: ObjectsDetailsActionsProps) {
	const actionButtonProps = { className: styles.detailsActionButton }

	return (
		<div className={styles.detailsActionRow} data-testid="objects-details-action-row">
			<Button size="small" icon={<CopyOutlined />} onClick={onCopyKey} aria-label="Copy key" title="Copy key" {...actionButtonProps}>
				Copy key
			</Button>
			<Button
				size="small"
				icon={<DownloadOutlined />}
				onClick={onDownload}
				aria-label="Download (client)"
				title="Download (client)"
				{...actionButtonProps}
			>
				Download (client)
			</Button>
			{showPresignAction !== false ? (
				<Button
					size="small"
					icon={<LinkOutlined />}
					onClick={onPresign}
					loading={isPresignLoading}
					aria-label="URL"
					title="URL"
					{...actionButtonProps}
				>
					URL
				</Button>
			) : null}
			{isAdvanced ? (
				<>
					<Button
						size="small"
						icon={<SnippetsOutlined />}
						onClick={() => onCopyMove('copy')}
						aria-label="Copy"
						title="Copy"
						{...actionButtonProps}
					>
						Copy
					</Button>
					<Button
						size="small"
						icon={<EditOutlined />}
						onClick={() => onCopyMove('move')}
						aria-label="Move"
						title="Move"
						{...actionButtonProps}
					>
						Move
					</Button>
				</>
			) : null}
			<Button
				size="small"
				danger
				icon={<DeleteOutlined />}
				onClick={onDelete}
				loading={isDeleteLoading}
				aria-label="Delete"
				title="Delete"
				{...actionButtonProps}
			>
				Delete
			</Button>
		</div>
	)
}
