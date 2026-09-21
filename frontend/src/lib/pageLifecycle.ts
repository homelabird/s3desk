import { subscribeNetworkRecovery } from './networkRecovery'
/** No background-transfer promise: persist on hide, reconcile on foreground/online. */
export function subscribePageLifecycle(callbacks: { onHidden?: () => void; onForeground?: () => void }): () => void {
	if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
	let scheduled: ReturnType<typeof setTimeout> | undefined
	const foreground = () => {
		if (document.visibilityState === 'hidden' || scheduled !== undefined) return
		scheduled = setTimeout(() => {
			scheduled = undefined
			if (document.visibilityState !== 'hidden') callbacks.onForeground?.()
		}, 0)
	}
	const hidden = () => callbacks.onHidden?.()
	const visibility = () => document.visibilityState === 'hidden' ? hidden() : foreground()
	document.addEventListener('visibilitychange', visibility)
	document.addEventListener('freeze', hidden)
	document.addEventListener('resume', foreground)
	window.addEventListener('pagehide', hidden)
	window.addEventListener('pageshow', foreground)
	const unsubscribeNetwork = subscribeNetworkRecovery(foreground)
	return () => {
		clearTimeout(scheduled)
		document.removeEventListener('visibilitychange', visibility)
		document.removeEventListener('freeze', hidden)
		document.removeEventListener('resume', foreground)
		window.removeEventListener('pagehide', hidden)
		window.removeEventListener('pageshow', foreground)
		unsubscribeNetwork()
	}
}
