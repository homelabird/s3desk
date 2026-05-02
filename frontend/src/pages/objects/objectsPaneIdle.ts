type IdleWindow = typeof window & {
	requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
	cancelIdleCallback?: (handle: number) => void
}

export function scheduleIdleLoad(callback: () => void) {
	if (typeof window === 'undefined') return () => undefined

	const idleWindow = window as IdleWindow
	if (idleWindow.requestIdleCallback) {
		const handle = idleWindow.requestIdleCallback(callback, { timeout: 1200 })
		return () => idleWindow.cancelIdleCallback?.(handle)
	}

	const handle = window.setTimeout(callback, 0)
	return () => window.clearTimeout(handle)
}
