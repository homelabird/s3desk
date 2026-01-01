import { Alert } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import { clearNetworkStatus, type NetworkStatusDetail, subscribeNetworkStatus } from '../lib/networkStatus'

const offlineMessage = 'Offline. Check your network connection.'
const onlineMessage = 'Back online.'
const unstableMessage = 'Network unstable. Some requests may fail.'

export function NetworkStatusBanner() {
	const [status, setStatus] = useState<NetworkStatusDetail | null>(null)
	const [isOffline, setIsOffline] = useState<boolean>(() => (typeof navigator === 'undefined' ? false : !navigator.onLine))

	useEffect(() => {
		const handleOnline = () => {
			setIsOffline(false)
			setStatus({ kind: 'online', message: onlineMessage })
		}
		const handleOffline = () => {
			setIsOffline(true)
			setStatus({ kind: 'offline', message: offlineMessage })
		}
		window.addEventListener('online', handleOnline)
		window.addEventListener('offline', handleOffline)
		return () => {
			window.removeEventListener('online', handleOnline)
			window.removeEventListener('offline', handleOffline)
		}
	}, [])

	useEffect(() => {
		return subscribeNetworkStatus(
			(detail) => {
				if (detail.kind === 'offline') {
					setIsOffline(true)
				}
				if (detail.kind === 'online') {
					setIsOffline(false)
				}
				setStatus(detail)
			},
			() => {
				if (!isOffline) setStatus(null)
			},
		)
	}, [isOffline])

	useEffect(() => {
		if (!status) return
		if (status.kind === 'offline') return
		const ttl = status.kind === 'online' ? 3000 : 10000
		const id = window.setTimeout(() => {
			clearNetworkStatus()
			setStatus(null)
		}, ttl)
		return () => window.clearTimeout(id)
	}, [status])

	const display = useMemo<NetworkStatusDetail | null>(() => {
		if (isOffline) return { kind: 'offline', message: offlineMessage }
		if (!status) return null
		if (status.kind === 'unstable' && !status.message) return { kind: 'unstable', message: unstableMessage }
		return status
	}, [isOffline, status])

	if (!display) return null

	const type = display.kind === 'offline' ? 'error' : display.kind === 'online' ? 'success' : 'warning'
	const message =
		display.kind === 'offline' ? offlineMessage : display.kind === 'online' ? display.message || onlineMessage : display.message || unstableMessage

	return <Alert banner showIcon type={type} title={message} />
}
