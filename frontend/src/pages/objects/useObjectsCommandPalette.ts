import { useCallback, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type { CommandItem } from './objectsActions'

type UseObjectsCommandPaletteArgs = {
	items: CommandItem[]
	open?: boolean
	setOpen?: Dispatch<SetStateAction<boolean>>
}

export function useObjectsCommandPalette(args: UseObjectsCommandPaletteArgs) {
	const [openState, setOpenState] = useState(false)
	const open = args.open ?? openState
	const setOpen = args.setOpen ?? setOpenState
	const [query, setQuery] = useState('')
	const [activeIndex, setActiveIndex] = useState(0)

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (!q) return args.items
		return args.items.filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q))
	}, [args.items, query])

	const maxIndex = useMemo(() => Math.max(0, filtered.length - 1), [filtered.length])
	const safeActiveIndex = Math.min(activeIndex, maxIndex)

	const run = useCallback((cmd: CommandItem) => {
		if (!cmd.enabled) return
		setOpen(false)
		window.setTimeout(() => cmd.run(), 0)
	}, [setOpen])

	const onQueryChange = useCallback((value: string) => {
		setQuery(value)
		setActiveIndex(0)
	}, [])

	const onKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			const currentIndex = Math.min(activeIndex, maxIndex)
			if (e.key === 'Escape') {
				e.preventDefault()
				setOpen(false)
				return
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setActiveIndex((prev) => Math.min(prev + 1, maxIndex))
				return
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault()
				setActiveIndex((prev) => Math.max(0, prev - 1))
				return
			}
			if (e.key === 'Enter') {
				e.preventDefault()
				const cmd = filtered[currentIndex]
				if (!cmd) return
				run(cmd)
			}
		},
		[activeIndex, filtered, maxIndex, run, setOpen],
	)

	return {
		open,
		setOpen,
		query,
		setQuery,
		activeIndex: safeActiveIndex,
		setActiveIndex,
		filtered,
		run,
		onQueryChange,
		onKeyDown,
	}
}
