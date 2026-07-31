import { Button, Checkbox, Input, Typography } from 'antd'
import { useId, useState, type ReactNode } from 'react'

import { DialogModal } from '../components/DialogModal'
import { appFeedback } from './appFeedback'
import styles from './ConfirmDangerDialog.module.css'
import { setDialogDismissed } from './dialogPreferences'

type Props = {
	title: string
	description?: ReactNode
	details?: ReactNode
	confirmText?: string
	confirmHint?: string
	okText?: string
	dialogPreferenceKey?: string
	scopeApiToken?: string | null
	onConfirm: () => Promise<void> | void
	onClose: () => void
}

export function ConfirmDangerDialog(props: Props) {
	const confirmToken = props.confirmText ?? 'DELETE'
	const confirmHint = props.confirmHint ?? `Type "${confirmToken}" to confirm`
	const confirmInputId = `${useId()}-confirm-input`
	const confirmInputSelector = '[data-confirm-danger-token-input="true"]'
	const shouldAutoFocus = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
	const [currentValue, setCurrentValue] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [dismissNextTime, setDismissNextTime] = useState(false)

	const handleConfirm = async () => {
		if (currentValue.trim() !== confirmToken) {
			appFeedback.error(`Type "${confirmToken}" to confirm`)
			return
		}
		setSubmitting(true)
		try {
			await props.onConfirm()
			if (dismissNextTime && props.dialogPreferenceKey) {
				setDialogDismissed(props.dialogPreferenceKey, true, props.scopeApiToken)
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
			width="min(92vw, 500px)"
			closeDisabled={submitting}
			initialFocusSelector={confirmInputSelector}
			footer={
				<div className={styles.actions}>
					<Button onClick={props.onClose} disabled={submitting}>
						Cancel
					</Button>
					<Button type="primary" danger loading={submitting} onClick={() => void handleConfirm()}>
						{props.okText ?? 'Delete'}
					</Button>
				</div>
			}
		>
			<div className={styles.content}>
				{props.description ? <div className={styles.description}>{props.description}</div> : null}
				{props.details ? <div className={styles.details}>{props.details}</div> : null}
				<div className={styles.confirmBlock}>
					<label htmlFor={confirmInputId}>
						<Typography.Text className={styles.confirmHint}>{confirmHint}</Typography.Text>
					</label>
					<Input
						id={confirmInputId}
						data-confirm-danger-token-input="true"
						placeholder={confirmToken}
						autoComplete="off"
						autoFocus={shouldAutoFocus}
						value={currentValue}
						onChange={(event) => setCurrentValue(event.target.value)}
					/>
				</div>
				{props.dialogPreferenceKey ? (
					<Checkbox checked={dismissNextTime} disabled={submitting} onChange={(event) => setDismissNextTime(event.target.checked)}>
						Do not show this confirmation again. You can re-enable it from Settings.
					</Checkbox>
				) : null}
			</div>
		</DialogModal>
	)
}
