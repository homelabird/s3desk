/** Prefer the event's actual device on hybrids; do not turn mouse clicks into taps. */
export function isTouchSelectionEvent(event: { nativeEvent?: Event; detail?: number }): boolean {
	const pointerType = (event.nativeEvent as PointerEvent | undefined)?.pointerType
	if (pointerType === 'mouse') return false
	if (pointerType === 'touch' || pointerType === 'pen') return true
	const capabilities = (event.nativeEvent as Event & { sourceCapabilities?: { firesTouchEvents?: boolean } } | undefined)?.sourceCapabilities
	if (capabilities?.firesTouchEvents) return true
	return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
		window.matchMedia('(pointer: coarse)').matches
}
