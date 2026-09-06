export type NetworkStatusKind = 'offline' | 'online' | 'unstable'

export type NetworkStatusDetail = {
	kind: NetworkStatusKind
	message: string
	ts?: number
	scope?: symbol
}

export type NetworkLogKind = 'status' | 'retry'

export type NetworkLogEvent = {
	kind: NetworkLogKind
	message: string
	ts: number
}

const statusEventName = 'network-status'
const clearEventName = 'network-status:clear'
const throttleWindowMs = 4000
let lastEventAt = 0
const defaultStatusScope = Symbol()
const statuses = new Map<symbol, NetworkStatusDetail>()
const logEventName = 'network-log'
const clearLogEventName = 'network-log:clear'
const maxLogEntries = 50
let networkLog: NetworkLogEvent[] = []

export function publishNetworkStatus(detail: NetworkStatusDetail, scope = defaultStatusScope) {
	if (typeof window === 'undefined') return
	const now = Date.now()
	const current = { ...detail, scope, ts: now }
	statuses.delete(scope)
	statuses.set(scope, current)
	if (now - lastEventAt >= throttleWindowMs || detail.kind !== 'unstable') {
		lastEventAt = now
		logNetworkEvent({ kind: 'status', message: detail.message || detail.kind })
	}
	window.dispatchEvent(new CustomEvent<NetworkStatusDetail>(statusEventName, { detail: current }))
}

export function clearNetworkStatus(scope = defaultStatusScope) {
	if (typeof window === 'undefined') return
	statuses.delete(scope)
	const remaining = Array.from(statuses.values()).at(-1)
	if (remaining) {
		window.dispatchEvent(new CustomEvent<NetworkStatusDetail>(statusEventName, { detail: remaining }))
	} else {
		window.dispatchEvent(new Event(clearEventName))
	}
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

export function logNetworkEvent(event: Omit<NetworkLogEvent, 'ts'>) {
	if (typeof window === 'undefined') return
	const entry: NetworkLogEvent = { ...event, ts: Date.now() }
	networkLog = [entry, ...networkLog].slice(0, maxLogEntries)
	window.dispatchEvent(new CustomEvent<NetworkLogEvent>(logEventName, { detail: entry }))
}

export function getNetworkLog(): NetworkLogEvent[] {
	return networkLog.slice()
}

export function clearNetworkLog() {
	if (typeof window === 'undefined') return
	networkLog = []
	window.dispatchEvent(new Event(clearLogEventName))
}

export function subscribeNetworkLog(onAppend: (entry: NetworkLogEvent) => void, onClear: () => void): () => void {
	if (typeof window === 'undefined') return () => {}
	const handleAppend = (event: Event) => {
		if (!(event instanceof CustomEvent)) return
		onAppend(event.detail as NetworkLogEvent)
	}
	const handleClear = () => onClear()
	window.addEventListener(logEventName, handleAppend)
	window.addEventListener(clearLogEventName, handleClear)
	return () => {
		window.removeEventListener(logEventName, handleAppend)
		window.removeEventListener(clearLogEventName, handleClear)
	}
}
