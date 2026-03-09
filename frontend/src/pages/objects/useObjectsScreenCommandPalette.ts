import { useEffect } from 'react'

import type { CommandItem } from './objectsActions'
import type { ObjectsPageDataState } from './objectsScreenTypes'
import { useObjectsCommandPaletteOverlayState } from './useObjectsCommandPaletteOverlayState'

type UseObjectsScreenCommandPaletteArgs = {
	commandItems: CommandItem[]
	commandPaletteOpener: ObjectsPageDataState['commandPaletteOpener']
}

export function useObjectsScreenCommandPalette(args: UseObjectsScreenCommandPaletteArgs) {
	const state = useObjectsCommandPaletteOverlayState({ items: args.commandItems })

	useEffect(() => {
		args.commandPaletteOpener.bind(state.openCommandPalette)
		return () => args.commandPaletteOpener.bind(null)
	}, [args.commandPaletteOpener, state.openCommandPalette])

	return state
}

export type ObjectsScreenCommandPaletteState = ReturnType<typeof useObjectsScreenCommandPalette>
