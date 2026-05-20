import { DeleteOutlined, FileTextOutlined, SettingOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'

import { confirmDangerAction } from '../../lib/confirmDangerAction'
import styles from '../BucketsPage.module.css'

type BucketActionsProps = {
	bucketName: string
	controlsSupported: boolean
	controlsUnsupportedReason: string
	policySupported: boolean
	policyUnsupportedReason: string
	deleteLoading: boolean
	onOpenControls: (bucketName: string) => void
	onOpenPolicy: (bucketName: string) => void
	onDelete: (bucketName: string) => Promise<void>
}

export function BucketActions(props: BucketActionsProps) {
	const bucketActionContext = `bucket ${props.bucketName}`

	return (
		<div className={styles.actionGroup}>
			{props.controlsSupported ? (
				<Tooltip title="Manage bucket controls">
					<span>
						<Button
							size="small"
							icon={<SettingOutlined />}
							aria-label={`Controls for ${bucketActionContext}`}
							onClick={() => {
								props.onOpenControls(props.bucketName)
							}}
						>
							Controls
						</Button>
					</span>
				</Tooltip>
			) : (
				<Tooltip title={props.controlsUnsupportedReason}>
					<span>
						<Button size="small" icon={<SettingOutlined />} aria-label={`Controls for ${bucketActionContext}`} disabled>
							Controls
						</Button>
					</span>
				</Tooltip>
			)}

			<Tooltip title={props.policySupported ? 'Manage bucket policy' : props.policyUnsupportedReason}>
				<span>
					<Button
						size="small"
						icon={<FileTextOutlined />}
						aria-label={`Policy for ${bucketActionContext}`}
						disabled={!props.policySupported}
						onClick={() => {
							props.onOpenPolicy(props.bucketName)
						}}
					>
						Policy
					</Button>
				</span>
			</Tooltip>

			<Button
				size="small"
				danger
				icon={<DeleteOutlined />}
				loading={props.deleteLoading}
				aria-label={`Delete ${bucketActionContext}`}
				onClick={() => {
					confirmDangerAction({
						title: `Delete bucket "${props.bucketName}"?`,
						description:
							'Only empty buckets can be deleted. If this fails, you can create a delete job to empty it.',
						confirmText: props.bucketName,
						confirmHint: `Type "${props.bucketName}" to confirm`,
						onConfirm: async () => {
							await props.onDelete(props.bucketName)
						},
					})
				}}
			>
				Delete
			</Button>
		</div>
	)
}
