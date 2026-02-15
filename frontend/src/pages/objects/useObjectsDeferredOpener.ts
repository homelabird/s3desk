import { useCallback, useRef } from 'react'

export function useObjectsDeferredOpener() {
	const openRef = useRef<(() => void) | null>(null)

	const open = useCallback(() => {
		openRef.current?.()
	}, [])

	const bind = useCallback((fn: (() => void) | null) => {
		openRef.current = fn
	}, [])

	return { open, bind }
}

