import { Button, Input, Modal, Space, Spin, Typography, message } from 'antd'

import { clipboardFailureHint, copyToClipboard } from '../../lib/clipboard'

type PresignPayload = { key: string; url: string; expiresAt: string }

type ObjectsPresignModalProps = {
	open: boolean
	presign: PresignPayload | null
	onClose: () => void
}

export function ObjectsPresignModal(props: ObjectsPresignModalProps) {
	const url = props.presign?.url ?? ''
	const hasUrl = !!url

	const handleCopy = async () => {
		if (!url) return
		const res = await copyToClipboard(url)
		if (res.ok) {
			message.success('Copied URL')
			return
		}
		message.error(clipboardFailureHint())
	}

	const handleOpen = () => {
		if (!url) return
		window.open(url, '_blank', 'noopener,noreferrer')
	}

	return (
		<Modal
			open={props.open}
			title="Download link"
			onCancel={props.onClose}
			footer={[
				<Button key="copy" disabled={!hasUrl} onClick={handleCopy}>
					Copy URL
				</Button>,
				<Button key="open" type="primary" disabled={!hasUrl} onClick={handleOpen}>
					Open in new tab
				</Button>,
				<Button key="close" onClick={props.onClose}>
					Close
				</Button>,
			]}
			destroyOnClose
		>
			{props.presign ? (
				<Space direction="vertical" size="small" style={{ width: '100%' }}>
					<Typography.Text>
						Key: <Typography.Text code>{props.presign.key}</Typography.Text>
					</Typography.Text>
					<Typography.Text>
						Expires: <Typography.Text code>{props.presign.expiresAt}</Typography.Text>
					</Typography.Text>
					<Typography.Text type="secondary">URL</Typography.Text>
					<Input.TextArea value={props.presign.url} readOnly autoSize={{ minRows: 2, maxRows: 6 }} />
				</Space>
			) : (
				<Spin />
			)}
		</Modal>
	)
}
