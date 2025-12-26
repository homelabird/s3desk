import { useEffect, useState } from 'react'

export function useIsOffline(): boolean {
	const [isOffline, setIsOffline] = useState<boolean>(() => (typeof navigator === 'undefined' ? false : !navigator.onLine))

	useEffect(() => {
		const handleOnline = () => setIsOffline(false)
		const handleOffline = () => setIsOffline(true)
		window.addEventListener('online', handleOnline)
		window.addEventListener('offline', handleOffline)
		return () => {
			window.removeEventListener('online', handleOnline)
			window.removeEventListener('offline', handleOffline)
		}
	}, [])

	return isOffline
}
