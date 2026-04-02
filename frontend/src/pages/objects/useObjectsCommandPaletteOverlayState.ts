import { useCallback, useEffect, useState } from 'react'

import { shouldIgnoreGlobalKeyboardShortcut } from '../../lib/keyboardShortcuts'
import type { CommandItem } from './objectsActions'
import { useObjectsCommandPalette } from './useObjectsCommandPalette'

type UseObjectsCommandPaletteOverlayStateArgs = {
	scopeKey: string
	items: CommandItem[]
}

export function useObjectsCommandPaletteOverlayState({ scopeKey, items }: UseObjectsCommandPaletteOverlayStateArgs) {
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
	const [commandPaletteScopeKey, setCommandPaletteScopeKey] = useState('')
	const commandPaletteScopeMatches = commandPaletteScopeKey === scopeKey
	const commandPaletteOpen = open && commandPaletteScopeMatches

	const setScopedOpen = useCallback(
		(next: boolean | ((prev: boolean) => boolean)) => {
			const nextOpen = typeof next === 'function' ? next(commandPaletteOpen) : next
			setOpen(nextOpen)
			setCommandPaletteScopeKey(nextOpen ? scopeKey : '')
		},
		[commandPaletteOpen, scopeKey, setOpen],
	)

	useEffect(() => {
		const onKeyDownWindow = (e: KeyboardEvent) => {
			if (shouldIgnoreGlobalKeyboardShortcut(e)) return
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault()
				setScopedOpen((prev) => !prev)
			}
		}
		window.addEventListener('keydown', onKeyDownWindow)
		return () => window.removeEventListener('keydown', onKeyDownWindow)
	}, [setScopedOpen])

	useEffect(() => {
		if (!commandPaletteOpen) return
		setQuery('')
		setActiveIndex(0)
		const id = window.setTimeout(() => {
			const el = document.getElementById('objectsCommandPaletteInput') as HTMLInputElement | null
			el?.focus()
		}, 0)
		return () => window.clearTimeout(id)
	}, [commandPaletteOpen, setActiveIndex, setQuery])

	const openCommandPalette = useCallback(() => setScopedOpen(true), [setScopedOpen])
	const closeCommandPalette = useCallback(() => setScopedOpen(false), [setScopedOpen])

	return {
		commandPaletteOpen,
		setCommandPaletteOpen: setScopedOpen,
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
