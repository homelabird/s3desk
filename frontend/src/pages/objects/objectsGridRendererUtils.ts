import type { KeyboardEvent } from 'react'

import { fileExtensionFromKey } from './objectsListUtils'

export function onActivateFromKeyboard(event: KeyboardEvent<HTMLDivElement>, onActivate: () => void) {
	if (event.key !== 'Enter' && event.key !== ' ') return
	event.preventDefault()
	onActivate()
}

export function extensionLabel(key: string): string {
	const ext = fileExtensionFromKey(key)
	return ext ? ext.toUpperCase() : 'FILE'
}
