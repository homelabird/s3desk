import { CloudUploadOutlined, FolderOutlined } from '@ant-design/icons'
import { Alert, Button, Grid, Typography } from 'antd'

import { OverlaySheet } from './OverlaySheet'
import styles from './UploadSourceSheet.module.css'

type Props = {
	open: boolean
	title?: string
	destinationLabel?: string
	folderSelectionSupported: boolean
	folderSelectionReason?: string
	busy?: boolean
	onClose: () => void
	onSelectFiles: () => void
	onSelectFolder: () => void
}

export function UploadSourceSheet(props: Props) {
	const screens = Grid.useBreakpoint()

	return (
		<OverlaySheet
			open={props.open}
			onClose={props.onClose}
			title={props.title ?? 'Upload from this device'}
			placement={screens.md ? 'right' : 'bottom'}
			width={screens.md ? 420 : undefined}
			height={!screens.md ? 'auto' : undefined}
		>
			<div className={styles.stack}>
				<div className={styles.intro}>
					<Typography.Text type="secondary">
						Files and folders are classified automatically. Folder structure is preserved whenever relative paths are present.
					</Typography.Text>
					{props.destinationLabel ? <Typography.Text code>{props.destinationLabel}</Typography.Text> : null}
				</div>

				<div className={styles.actions}>
					<Button
						type="primary"
						size="large"
						icon={<CloudUploadOutlined />}
						className={styles.button}
						disabled={props.busy}
						onClick={props.onSelectFiles}
					>
						Choose files
					</Button>
					<Button
						size="large"
						icon={<FolderOutlined />}
						className={styles.button}
						disabled={props.busy || !props.folderSelectionSupported}
						onClick={props.onSelectFolder}
					>
						Choose folder
					</Button>
				</div>

				{!props.folderSelectionSupported ? (
					<Alert
						type="info"
						showIcon
						message="Folder selection is unavailable"
						description={props.folderSelectionReason ?? 'This browser only supports file selection.'}
					/>
				) : (
					<Typography.Text type="secondary" className={styles.hint}>
						Use folder selection when you want the browser to include nested relative paths.
					</Typography.Text>
				)}
			</div>
		</OverlaySheet>
	)
}
