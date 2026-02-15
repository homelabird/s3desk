import { useCallback, useEffect, useState } from 'react'

type UseObjectsGlobalSearchOverlayStateArgs = {
	globalSearch: string
	setGlobalSearch: (value: string) => void
	globalSearchDraft: string
	setGlobalSearchDraft: (value: string) => void
	debounceMs?: number
}

export function useObjectsGlobalSearchOverlayState({
	globalSearch,
	setGlobalSearch,
	globalSearchDraft,
	setGlobalSearchDraft,
	debounceMs = 250,
}: UseObjectsGlobalSearchOverlayStateArgs) {
	const [globalSearchOpen, setGlobalSearchOpen] = useState(false)

	useEffect(() => {
		setGlobalSearchDraft(globalSearch)
	}, [globalSearch, setGlobalSearchDraft])

	useEffect(() => {
		if (globalSearchDraft === globalSearch) return
		const id = window.setTimeout(() => {
			setGlobalSearch(globalSearchDraft)
		}, debounceMs)
		return () => window.clearTimeout(id)
	}, [debounceMs, globalSearch, globalSearchDraft, setGlobalSearch])

	const openGlobalSearch = useCallback(() => setGlobalSearchOpen(true), [])
	const closeGlobalSearch = useCallback(() => setGlobalSearchOpen(false), [])

	return {
		globalSearchOpen,
		setGlobalSearchOpen,
		openGlobalSearch,
		closeGlobalSearch,
	}
}

