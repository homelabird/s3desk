import { useEffect, useState } from 'react'

/**
 * Hook that manages keyboard shortcut guide visibility and G-then-X navigation.
 */
export function useKeyboardShortcuts(navigate: (path: string) => void) {
	const [guideOpen, setGuideOpen] = useState(false)
	const [pendingG, setPendingG] = useState(false)

	useEffect(() => {
		let gTimer: ReturnType<typeof setTimeout> | null = null

		const handler = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null
			const tag = target?.tagName?.toLowerCase()
			const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable === true
			if (isInput) return

			if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
				e.preventDefault()
				setGuideOpen((v) => !v)
				return
			}

			if (pendingG) {
				setPendingG(false)
				if (gTimer) clearTimeout(gTimer)
				const routes: Record<string, string> = { p: '/profiles?ui=full', b: '/buckets', o: '/objects', u: '/uploads', j: '/jobs' }
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
	}, [pendingG, navigate])

	return { guideOpen, setGuideOpen }
}
