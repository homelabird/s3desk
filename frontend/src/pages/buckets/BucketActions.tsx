import { DeleteOutlined, FileTextOutlined, FolderOpenOutlined, MoreOutlined, SettingOutlined } from '@ant-design/icons'
import { Button, Tooltip, type MenuProps } from 'antd'

import { MenuPopover } from '../../components/MenuPopover'
import { confirmDangerAction } from '../../lib/confirmDangerAction'
import styles from '../BucketsPage.module.css'

type BucketActionsProps = {
	bucketName: string
	controlsSupported: boolean
	controlsUnsupportedReason: string
	policySupported: boolean
	policyUnsupportedReason: string
	deleteLoading: boolean
	onOpenObjects: (bucketName: string) => void
	onOpenControls: (bucketName: string) => void
	onOpenPolicy: (bucketName: string) => void
	onDelete: (bucketName: string) => Promise<void>
}

export function BucketActions(props: BucketActionsProps) {
	const bucketActionContext = `bucket ${props.bucketName}`
	const handleDelete = () => {
		confirmDangerAction({
			title: `Delete bucket "${props.bucketName}"?`,
			description: 'Only empty buckets can be deleted. If this fails, you can create a delete job to empty it.',
			confirmText: props.bucketName,
			confirmHint: `Type "${props.bucketName}" to confirm`,
			onConfirm: async () => {
				await props.onDelete(props.bucketName)
			},
		})
	}

	const manageItems: MenuProps['items'] = [
		{
			key: 'controls',
			icon: <SettingOutlined />,
			label: props.controlsSupported ? 'Controls' : 'Controls unavailable',
			disabled: !props.controlsSupported,
			onClick: () => props.onOpenControls(props.bucketName),
		},
		{
			key: 'policy',
			icon: <FileTextOutlined />,
			label: props.policySupported ? 'Advanced policy' : 'Policy unavailable',
			disabled: !props.policySupported,
			onClick: () => props.onOpenPolicy(props.bucketName),
		},
		{ type: 'divider' },
		{
			key: 'delete',
			icon: <DeleteOutlined />,
			label: props.deleteLoading ? 'Deleting bucket' : 'Delete bucket',
			danger: true,
			disabled: props.deleteLoading,
			onClick: handleDelete,
		},
	]

	return (
		<div className={styles.actionGroup}>
			<Button
				size="small"
				type="primary"
				icon={<FolderOpenOutlined />}
				aria-label={`Open objects for ${bucketActionContext}`}
				onClick={() => props.onOpenObjects(props.bucketName)}
			>
				Open
			</Button>

			<Tooltip
				title={
					props.controlsSupported || props.policySupported
						? 'Manage bucket controls, policy, and deletion'
						: `${props.controlsUnsupportedReason || 'Controls unavailable'} ${props.policyUnsupportedReason || 'Policy unavailable'}`
				}
			>
				<span>
					<MenuPopover menu={{ items: manageItems }} align="end" scopeKey={props.bucketName}>
						{({ toggle, open }) => (
							<Button
								size="small"
								icon={<MoreOutlined />}
								aria-label={`Manage ${bucketActionContext}`}
								aria-haspopup="menu"
								aria-expanded={open}
								loading={props.deleteLoading}
								onClick={toggle}
							>
								Manage
							</Button>
						)}
					</MenuPopover>
				</span>
			</Tooltip>
		</div>
	)
}
