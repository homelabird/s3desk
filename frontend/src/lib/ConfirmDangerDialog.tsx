import { Button, Checkbox, Input, Space, Typography, message } from 'antd'
import { useState, type ReactNode } from 'react'

import { DialogModal } from '../components/DialogModal'
import { setDialogDismissed } from './dialogPreferences'

type Props = {
	title: string
	description?: ReactNode
	details?: ReactNode
	confirmText?: string
	confirmHint?: string
	okText?: string
	dialogPreferenceKey?: string
	onConfirm: () => Promise<void> | void
	onClose: () => void
}

export function ConfirmDangerDialog(props: Props) {
	const confirmToken = props.confirmText ?? 'DELETE'
	const confirmHint = props.confirmHint ?? `Type "${confirmToken}" to confirm`
	const shouldAutoFocus = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
	const [currentValue, setCurrentValue] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [dismissNextTime, setDismissNextTime] = useState(false)

	const handleConfirm = async () => {
		if (currentValue.trim() !== confirmToken) {
			message.error(`Type "${confirmToken}" to confirm`)
			return
		}
		setSubmitting(true)
		try {
			await props.onConfirm()
			if (dismissNextTime && props.dialogPreferenceKey) {
				setDialogDismissed(props.dialogPreferenceKey, true)
			}
			props.onClose()
		} catch {
			setSubmitting(false)
		}
	}

	return (
		<DialogModal
			open
			onClose={props.onClose}
			title={props.title}
			width={520}
			footer={
				<>
					<Button onClick={props.onClose} disabled={submitting}>
						Cancel
					</Button>
					<Button type="primary" danger loading={submitting} onClick={() => void handleConfirm()}>
						{props.okText ?? 'Delete'}
					</Button>
				</>
			}
		>
			<Space direction="vertical" style={{ width: '100%' }}>
				{props.description ? <div>{props.description}</div> : null}
				{props.details ? <Typography.Text type="secondary">{props.details}</Typography.Text> : null}
				<Space direction="vertical" size={4} style={{ width: '100%' }}>
					<Typography.Text type="secondary">{confirmHint}</Typography.Text>
					<Input
						placeholder={confirmToken}
						autoComplete="off"
						autoFocus={shouldAutoFocus}
						value={currentValue}
						onChange={(event) => setCurrentValue(event.target.value)}
					/>
				</Space>
				{props.dialogPreferenceKey ? (
					<Checkbox checked={dismissNextTime} disabled={submitting} onChange={(event) => setDismissNextTime(event.target.checked)}>
						Do not show this confirmation again. You can re-enable it from Settings.
					</Checkbox>
				) : null}
			</Space>
		</DialogModal>
	)
}
