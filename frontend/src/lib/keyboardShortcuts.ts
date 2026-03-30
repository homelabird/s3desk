export function isEditingKeyboardTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false
	const tag = target.tagName.toLowerCase()
	return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable === true
}

export function shouldIgnoreGlobalKeyboardShortcut(event: KeyboardEvent): boolean {
	return event.defaultPrevented || isEditingKeyboardTarget(event.target)
}
