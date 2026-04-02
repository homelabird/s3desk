import { useCallback, useEffect, useState, type SetStateAction } from 'react'

import { shouldIgnoreGlobalKeyboardShortcut } from './keyboardShortcuts'

/**
 * Hook that manages keyboard shortcut guide visibility and G-then-X navigation.
 */
type GuideOverlayState = {
	open: boolean
	scopeKey: string | null
}

export function useKeyboardShortcuts(navigate: (path: string) => void, scopeKey = '__global__') {
	const [guideState, setGuideState] = useState<GuideOverlayState>({ open: false, scopeKey: null })
	const [pendingG, setPendingG] = useState(false)
	const guideOpen = guideState.open && guideState.scopeKey === scopeKey
	const setGuideOpen = useCallback((next: SetStateAction<boolean>) => {
		setGuideState((prev) => {
			const prevOpen = prev.open && prev.scopeKey === scopeKey
			const resolved = typeof next === 'function' ? next(prevOpen) : next
			return resolved ? { open: true, scopeKey } : { open: false, scopeKey: null }
		})
	}, [scopeKey])

	useEffect(() => {
		let gTimer: ReturnType<typeof setTimeout> | null = null

		const handler = (e: KeyboardEvent) => {
			if (shouldIgnoreGlobalKeyboardShortcut(e)) return

			if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
				e.preventDefault()
				setGuideState((prev) => {
					const prevOpen = prev.open && prev.scopeKey === scopeKey
					return prevOpen ? { open: false, scopeKey: null } : { open: true, scopeKey }
				})
				return
			}

			if (pendingG) {
				setPendingG(false)
				if (gTimer) clearTimeout(gTimer)
				const routes: Record<string, string> = { p: '/profiles', b: '/buckets', o: '/objects', u: '/uploads', j: '/jobs' }
				const path = routes[e.key.toLowerCase()]
				if (path) {
					e.preventDefault()
					navigate(path)
				}
				return
			}

			if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
				setPendingG(true)
				gTimer = setTimeout(() => setPendingG(false), 1000)
			}
		}
		document.addEventListener('keydown', handler)
		return () => {
			document.removeEventListener('keydown', handler)
			if (gTimer) clearTimeout(gTimer)
		}
	}, [pendingG, navigate, scopeKey])

	return { guideOpen, setGuideOpen }
}
