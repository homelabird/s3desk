import { useCallback, useEffect } from 'react'

import type { CommandItem } from './objectsActions'
import { useObjectsCommandPalette } from './useObjectsCommandPalette'

type UseObjectsCommandPaletteOverlayStateArgs = {
	items: CommandItem[]
}

export function useObjectsCommandPaletteOverlayState({ items }: UseObjectsCommandPaletteOverlayStateArgs) {
	const {
		open,
		setOpen,
		query,
		setQuery,
		activeIndex,
		setActiveIndex,
		filtered,
		run,
		onQueryChange,
		onKeyDown,
	} = useObjectsCommandPalette({ items })

	useEffect(() => {
		const onKeyDownWindow = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault()
				setOpen((prev) => !prev)
			}
		}
		window.addEventListener('keydown', onKeyDownWindow)
		return () => window.removeEventListener('keydown', onKeyDownWindow)
	}, [setOpen])

	useEffect(() => {
		if (!open) return
		setQuery('')
		setActiveIndex(0)
		const id = window.setTimeout(() => {
			const el = document.getElementById('objectsCommandPaletteInput') as HTMLInputElement | null
			el?.focus()
		}, 0)
		return () => window.clearTimeout(id)
	}, [open, setActiveIndex, setQuery])

	const openCommandPalette = useCallback(() => setOpen(true), [setOpen])
	const closeCommandPalette = useCallback(() => setOpen(false), [setOpen])

	return {
		commandPaletteOpen: open,
		setCommandPaletteOpen: setOpen,
		openCommandPalette,
		closeCommandPalette,
		commandPaletteQuery: query,
		setCommandPaletteQuery: setQuery,
		commandPaletteActiveIndex: activeIndex,
		setCommandPaletteActiveIndex: setActiveIndex,
		commandPaletteItems: filtered,
		runCommandPaletteItem: run,
		onCommandPaletteQueryChange: onQueryChange,
		onCommandPaletteKeyDown: onKeyDown,
	}
}

