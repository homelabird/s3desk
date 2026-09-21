import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getMobileBackCoordinator } from './backNavigation'

const query = '(max-width: 991px), (pointer: coarse)'
const matches = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches

/** Priorities: overlays 300, selection 200, folder navigation 100. */
export function useMobileBack(active: boolean, close: () => void, priority: number) {
	const [mobile, setMobile] = useState(matches)
	const closeRef = useRef(close)
	useLayoutEffect(() => { closeRef.current = close }, [close])
	useEffect(() => {
		if (typeof window.matchMedia !== 'function') return
		const media = window.matchMedia(query)
		const update = () => setMobile(media.matches)
		media.addEventListener?.('change', update)
		update()
		return () => media.removeEventListener?.('change', update)
	}, [])
	useLayoutEffect(() => {
		if (!active || !mobile) return
		return getMobileBackCoordinator()?.register(priority, () => closeRef.current())
	}, [active, mobile, priority])
}
