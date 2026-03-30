import type { ReactNode } from 'react'

import { mountImperativeDialog } from '../components/imperativeDialog'
import { ConfirmDangerDialog } from './ConfirmDangerDialog'
import { buildDialogPreferenceKey, isDialogDismissed, resolveDialogPreferenceScopeApiToken } from './dialogPreferences'

type ConfirmDangerActionOptions = {
	title: string
	description?: ReactNode
	details?: ReactNode
	confirmText?: string
	confirmHint?: string
	okText?: string
	preferenceKey?: string
	scopeApiToken?: string | null
	onConfirm: () => Promise<void> | void
}

export function confirmDangerAction(options: ConfirmDangerActionOptions) {
	const dialogPreferenceKey =
		options.preferenceKey?.trim()
		|| buildDialogPreferenceKey('confirm', `${options.title}|${options.confirmText ?? options.okText ?? 'ok'}`)
	const scopeApiToken = resolveDialogPreferenceScopeApiToken(options.scopeApiToken)

	if (isDialogDismissed(dialogPreferenceKey, scopeApiToken)) {
		void Promise.resolve(options.onConfirm()).catch(() => undefined)
		return
	}

	mountImperativeDialog((close) => (
		<ConfirmDangerDialog {...options} dialogPreferenceKey={dialogPreferenceKey} scopeApiToken={scopeApiToken} onClose={close} />
	))
}
