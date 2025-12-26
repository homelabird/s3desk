export type NetworkStatusKind = 'offline' | 'online' | 'unstable'

export type NetworkStatusDetail = {
	kind: NetworkStatusKind
	message: string
	ts?: number
}

const statusEventName = 'network-status'
const clearEventName = 'network-status:clear'
const throttleWindowMs = 4000
let lastEventAt = 0

export function publishNetworkStatus(detail: NetworkStatusDetail) {
	if (typeof window === 'undefined') return
	const now = Date.now()
	if (now - lastEventAt < throttleWindowMs && detail.kind === 'unstable') return
	lastEventAt = now
	window.dispatchEvent(new CustomEvent<NetworkStatusDetail>(statusEventName, { detail: { ...detail, ts: now } }))
}

export function clearNetworkStatus() {
	if (typeof window === 'undefined') return
	window.dispatchEvent(new Event(clearEventName))
}

export function subscribeNetworkStatus(onShow: (detail: NetworkStatusDetail) => void, onClear: () => void): () => void {
	if (typeof window === 'undefined') return () => {}
	const handleShow = (event: Event) => {
		if (!(event instanceof CustomEvent)) return
		onShow(event.detail as NetworkStatusDetail)
	}
	const handleClear = () => onClear()
	window.addEventListener(statusEventName, handleShow)
	window.addEventListener(clearEventName, handleClear)
	return () => {
		window.removeEventListener(statusEventName, handleShow)
		window.removeEventListener(clearEventName, handleClear)
	}
}
