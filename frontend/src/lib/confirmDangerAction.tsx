import type { ReactNode } from 'react'

import { mountImperativeDialog } from '../components/imperativeDialog'
import { ConfirmDangerDialog } from './ConfirmDangerDialog'

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
	mountImperativeDialog((close) => <ConfirmDangerDialog {...options} onClose={close} />)
}
