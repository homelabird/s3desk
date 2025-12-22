import { Button, Dropdown, Space, Typography } from 'antd'
import { DeleteOutlined, DownloadOutlined, EllipsisOutlined } from '@ant-design/icons'

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
			<Space wrap>
				<Typography.Text strong>{props.selectedCount} selected</Typography.Text>
				<Button size="small" onClick={props.clearAction?.run} disabled={!props.clearAction?.enabled}>
					{props.clearAction?.shortLabel ?? props.clearAction?.label ?? 'Clear'}
				</Button>
			</Space>
			<Space wrap>
				{props.downloadAction ? (
					<Button
						size="small"
						icon={<DownloadOutlined />}
						onClick={props.downloadAction?.run}
						loading={props.isDownloadLoading}
						disabled={!props.downloadAction?.enabled}
					>
						{props.downloadAction?.shortLabel ?? props.downloadAction?.label ?? 'Download'}
					</Button>
				) : null}
				{hasActions ? (
					<Dropdown trigger={['click']} menu={buildActionMenu(menuActions, props.isAdvanced)}>
						<Button size="small" icon={<EllipsisOutlined />}>
							More
						</Button>
					</Dropdown>
				) : null}
				<Button
					size="small"
					danger
					icon={<DeleteOutlined />}
					onClick={props.deleteAction?.run}
					loading={props.isDeleteLoading}
					disabled={!props.deleteAction?.enabled}
				>
					{props.deleteAction?.shortLabel ?? props.deleteAction?.label ?? 'Delete'}
				</Button>
			</Space>
		</ObjectsSelectionBar>
	)
}
