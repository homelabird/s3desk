import { Button, Typography } from 'antd'
import { DeleteOutlined, DownloadOutlined, MoreOutlined } from '@ant-design/icons'

import { MenuPopover } from '../../components/MenuPopover'
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
					<MenuPopover
						menu={buildActionMenu(menuActions, props.isAdvanced)}
					>
						{({ open, toggle }) => (
							<Button
								size="small"
								className={`${styles.selectionBarButton} ${styles.selectionBarMoreButton}`}
								icon={<MoreOutlined />}
								aria-label="Selection tools"
								aria-haspopup="menu"
								aria-expanded={open}
								onClick={toggle}
							>
								Tools
							</Button>
						)}
					</MenuPopover>
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
