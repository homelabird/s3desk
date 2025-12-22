import type { InputRef } from 'antd'
import { AutoComplete, Input, Modal, Space, Typography } from 'antd'
import type { RefObject } from 'react'

type ObjectsGoToPathModalProps = {
	open: boolean
	bucket: string
	hasProfile: boolean
	pathDraft: string
	options: { value: string }[]
	inputRef: RefObject<InputRef | null>
	onChangeDraft: (value: string) => void
	onSelectPath: (value: string) => void
	onCommit: () => void
	onClose: () => void
}

export function ObjectsGoToPathModal({
	open,
	bucket,
	hasProfile,
	pathDraft,
	options,
	inputRef,
	onChangeDraft,
	onSelectPath,
	onCommit,
	onClose,
}: ObjectsGoToPathModalProps) {
	const disabled = !hasProfile || !bucket

	return (
		<Modal
			open={open}
			title="Go to path"
			onCancel={onClose}
			onOk={onCommit}
			okText="Go"
			okButtonProps={{ disabled }}
			destroyOnClose
		>
			<Space direction="vertical" size="small" style={{ width: '100%' }}>
				<Typography.Text type="secondary">
					Bucket: <Typography.Text code>{bucket || '(none)'}</Typography.Text>
				</Typography.Text>

				<AutoComplete
					style={{ width: '100%' }}
					value={pathDraft}
					options={options}
					onChange={onChangeDraft}
					onSelect={(v) => onSelectPath(String(v))}
					disabled={disabled}
				>
					<Input
						ref={inputRef}
						placeholder="Prefix (e.g. logs/2025/)"
						onPressEnter={onCommit}
						allowClear
						disabled={disabled}
					/>
				</AutoComplete>

				<Typography.Text type="secondary">Ctrl+L · Enter to navigate</Typography.Text>
			</Space>
		</Modal>
	)
}
