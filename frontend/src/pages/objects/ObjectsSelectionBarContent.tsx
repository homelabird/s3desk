import { Button, Dropdown, Typography } from 'antd'
import { DeleteOutlined, DownloadOutlined, EllipsisOutlined } from '@ant-design/icons'
import { useState } from 'react'

import styles from './ObjectsListView.module.css'
import { ObjectsSelectionBar } from './ObjectsListPane'
import type { UIAction, UIActionOrDivider } from './objectsActions'
import { buildActionMenu, filterActionItems, trimActionDividers } from './objectsActions'

type ObjectsSelectionBarContentProps = {
	selectedCount: number
	singleSelectedKey: string | null
	singleSelectedSize?: number
	isAdvanced: boolean
	clearAction?: UIAction
	deleteAction?: UIAction
	downloadAction?: UIAction
	moveAction?: UIAction
	selectionMenuActions: UIActionOrDivider[]
	getObjectActions: (key: string, size?: number) => UIActionOrDivider[]
	isDownloadLoading: boolean
	isDeleteLoading: boolean
}

export function ObjectsSelectionBarContent(props: ObjectsSelectionBarContentProps) {
	const [selectionToolsOpen, setSelectionToolsOpen] = useState(false)
	const selectionMenuActions = trimActionDividers(props.selectionMenuActions)
	const menuActions: UIActionOrDivider[] = props.singleSelectedKey
		? trimActionDividers(
				filterActionItems(props.getObjectActions(props.singleSelectedKey, props.singleSelectedSize), props.isAdvanced).filter(
					(item) => 'type' in item || (item.id !== 'download' && item.id !== 'delete'),
					),
			)
		: selectionMenuActions

	const hasActions = menuActions.some((item) => !('type' in item))

	return (
		<ObjectsSelectionBar>
			<div className={styles.selectionBarMeta}>
				<Typography.Text
					strong
					className={styles.selectionBarCount}
					role="status"
					aria-live="polite"
					aria-atomic="true"
					aria-label={`${props.selectedCount} selected`}
				>
					{props.selectedCount} selected
				</Typography.Text>
				<Button
					size="small"
					className={styles.selectionBarButton}
					onClick={props.clearAction?.run}
					disabled={!props.clearAction?.enabled}
				>
					{props.clearAction?.shortLabel ?? props.clearAction?.label ?? 'Clear'}
				</Button>
			</div>
			<div className={styles.selectionBarActions}>
				{props.downloadAction ? (
					<Button
						size="small"
						className={`${styles.selectionBarButton} ${styles.selectionBarIconOnlyButton}`}
						icon={<DownloadOutlined />}
						aria-label={props.downloadAction?.shortLabel ?? props.downloadAction?.label ?? 'Download'}
						onClick={props.downloadAction?.run}
						loading={props.isDownloadLoading}
						disabled={!props.downloadAction?.enabled}
					>
						{props.downloadAction?.shortLabel ?? props.downloadAction?.label ?? 'Download'}
					</Button>
				) : null}
				{props.moveAction ? (
					<Button
						size="small"
						className={styles.selectionBarButton}
						onClick={props.moveAction.run}
						disabled={!props.moveAction.enabled}
					>
						{props.moveAction.shortLabel ?? props.moveAction.label}
					</Button>
				) : null}
				{hasActions ? (
					<Dropdown
						trigger={['click']}
						menu={buildActionMenu(menuActions, props.isAdvanced)}
						open={selectionToolsOpen}
						onOpenChange={setSelectionToolsOpen}
					>
						<Button
							size="small"
							className={`${styles.selectionBarButton} ${styles.selectionBarMoreButton}`}
							icon={<EllipsisOutlined />}
							aria-label="Selection tools"
							aria-haspopup="menu"
							aria-expanded={selectionToolsOpen}
						>
							Tools
						</Button>
					</Dropdown>
				) : null}
				<Button
					size="small"
					className={`${styles.selectionBarButton} ${styles.selectionBarIconOnlyButton}`}
					danger
					icon={<DeleteOutlined />}
					aria-label={props.deleteAction?.shortLabel ?? props.deleteAction?.label ?? 'Delete'}
					onClick={props.deleteAction?.run}
					loading={props.isDeleteLoading}
					disabled={!props.deleteAction?.enabled}
				>
					{props.deleteAction?.shortLabel ?? props.deleteAction?.label ?? 'Delete'}
				</Button>
			</div>
		</ObjectsSelectionBar>
	)
}
