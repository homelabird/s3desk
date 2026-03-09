import type { InputRef } from 'antd'
import { Button, Space, Typography } from 'antd'
import type { RefObject } from 'react'

import { DialogModal } from '../../components/DialogModal'
import { DatalistInput } from '../../components/DatalistInput'

type ObjectsGoToPathModalProps = {
	open: boolean
	bucket: string
	hasProfile: boolean
	pathDraft: string
	options: { value: string }[]
	inputRef: RefObject<InputRef | null>
	onChangeDraft: (value: string) => void
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
	onCommit,
	onClose,
}: ObjectsGoToPathModalProps) {
	const disabled = !hasProfile || !bucket

	return (
		<DialogModal
			open={open}
			title="Go to path"
			onClose={onClose}
			width={520}
			footer={
				<>
					<Button onClick={onClose}>Cancel</Button>
					<Button type="primary" onClick={onCommit} disabled={disabled}>
						Go
					</Button>
				</>
			}
		>
			<Space orientation="vertical" size="small" style={{ width: '100%' }}>
				<Typography.Text type="secondary">
					Bucket: <Typography.Text code>{bucket || '(none)'}</Typography.Text>
				</Typography.Text>

				<DatalistInput
					style={{ width: '100%' }}
					ref={inputRef}
					value={pathDraft}
					onChange={onChangeDraft}
					options={options}
					placeholder="Prefix (e.g. logs/2025/)…"
					allowClear
					ariaLabel="Path"
					onPressEnter={onCommit}
					disabled={disabled}
				/>

				<Typography.Text type="secondary">Ctrl+L · Enter to navigate</Typography.Text>
			</Space>
		</DialogModal>
	)
}
