import { useEffect } from 'react'

import type { CommandItem } from './objectsActions'
import type { ObjectsOperationVm } from './objectsScreenTypes'
import { useObjectsCommandPaletteOverlayState } from './useObjectsCommandPaletteOverlayState'

type UseObjectsScreenCommandPaletteArgs = {
	scopeKey: string
	commandItems: CommandItem[]
	commandPaletteOpener: ObjectsOperationVm['commandPaletteOpener']
}

export function useObjectsScreenCommandPalette(args: UseObjectsScreenCommandPaletteArgs) {
	const state = useObjectsCommandPaletteOverlayState({ scopeKey: args.scopeKey, items: args.commandItems })

	useEffect(() => {
		args.commandPaletteOpener.bind(state.openCommandPalette)
		return () => args.commandPaletteOpener.bind(null)
	}, [args.commandPaletteOpener, state.openCommandPalette])

	return state
}

export type ObjectsScreenCommandPaletteState = ReturnType<typeof useObjectsScreenCommandPalette>
