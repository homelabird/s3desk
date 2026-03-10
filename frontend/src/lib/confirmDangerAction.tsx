import type { ReactNode } from 'react'

import { mountImperativeDialog } from '../components/imperativeDialog'
import { ConfirmDangerDialog } from './ConfirmDangerDialog'
import { buildDialogPreferenceKey, isDialogDismissed } from './dialogPreferences'

type ConfirmDangerActionOptions = {
	title: string
	description?: ReactNode
	details?: ReactNode
	confirmText?: string
	confirmHint?: string
	okText?: string
	preferenceKey?: string
	onConfirm: () => Promise<void> | void
}

export function confirmDangerAction(options: ConfirmDangerActionOptions) {
	const dialogPreferenceKey =
		options.preferenceKey?.trim()
		|| buildDialogPreferenceKey('confirm', `${options.title}|${options.confirmText ?? options.okText ?? 'ok'}`)

	if (isDialogDismissed(dialogPreferenceKey)) {
		void Promise.resolve(options.onConfirm()).catch(() => undefined)
		return
	}

	mountImperativeDialog((close) => (
		<ConfirmDangerDialog {...options} dialogPreferenceKey={dialogPreferenceKey} onClose={close} />
	))
}
