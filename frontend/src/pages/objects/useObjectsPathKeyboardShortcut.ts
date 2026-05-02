import { useEffect } from 'react'

import { shouldIgnoreGlobalKeyboardShortcut } from '../../lib/keyboardShortcuts'

export function useObjectsPathKeyboardShortcut(openPathModal: () => void) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (shouldIgnoreGlobalKeyboardShortcut(event)) return
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
				event.preventDefault()
				openPathModal()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [openPathModal])
}
