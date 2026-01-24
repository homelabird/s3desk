import { Input, Modal, Space, Typography, message } from 'antd'
import type { ReactNode } from 'react'

type ConfirmDangerActionOptions = {
	title: string
	description?: ReactNode
	details?: ReactNode
	confirmText?: string
	confirmHint?: string
	okText?: string
	onConfirm: () => Promise<void> | void
}

export function confirmDangerAction(options: ConfirmDangerActionOptions) {
	const confirmToken = options.confirmText ?? 'DELETE'
	const confirmHint = options.confirmHint ?? `Type "${confirmToken}" to confirm`
	let currentValue = ''
	const shouldAutoFocus = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

	Modal.confirm({
		title: options.title,
		okText: options.okText ?? 'Delete',
		okType: 'danger',
		content: (
			<Space direction="vertical" style={{ width: '100%' }}>
				{options.description ? <div>{options.description}</div> : null}
				{options.details ? <Typography.Text type="secondary">{options.details}</Typography.Text> : null}
				<Space direction="vertical" size={4} style={{ width: '100%' }}>
					<Typography.Text type="secondary">{confirmHint}</Typography.Text>
					<Input
						placeholder={confirmToken}
						autoComplete="off"
						autoFocus={shouldAutoFocus}
						onChange={(event) => {
							currentValue = event.target.value
						}}
					/>
				</Space>
			</Space>
		),
		onOk: async () => {
			if (currentValue.trim() !== confirmToken) {
				message.error(`Type "${confirmToken}" to confirm`)
				return Promise.reject(new Error('confirm-text-mismatch'))
			}
			await options.onConfirm()
		},
	})
}
