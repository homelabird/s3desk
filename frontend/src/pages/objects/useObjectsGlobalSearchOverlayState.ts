import { useCallback, useEffect, useState } from 'react'

type UseObjectsGlobalSearchOverlayStateArgs = {
	scopeKey: string
	globalSearch: string
	setGlobalSearch: (value: string) => void
	globalSearchDraft: string
	setGlobalSearchDraft: (value: string) => void
	debounceMs?: number
}

export function useObjectsGlobalSearchOverlayState({
	scopeKey,
	globalSearch,
	setGlobalSearch,
	globalSearchDraft,
	debounceMs = 250,
}: UseObjectsGlobalSearchOverlayStateArgs) {
	const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
	const [globalSearchOpenScopeKey, setGlobalSearchOpenScopeKey] = useState('')
	const globalSearchScopeMatches = globalSearchOpenScopeKey === scopeKey
	const globalSearchOpenVisible = globalSearchOpen && globalSearchScopeMatches

	useEffect(() => {
		const query = globalSearchDraft.trim()
		if (query === globalSearch) return
		const id = window.setTimeout(() => {
			setGlobalSearch(query)
		}, debounceMs)
		return () => window.clearTimeout(id)
	}, [debounceMs, globalSearch, globalSearchDraft, scopeKey, setGlobalSearch])

	const setScopedGlobalSearchOpen = useCallback(
		(open: boolean) => {
			setGlobalSearchOpen(open)
			setGlobalSearchOpenScopeKey(open ? scopeKey : '')
		},
		[scopeKey],
	)

	const openGlobalSearch = useCallback(() => setScopedGlobalSearchOpen(true), [setScopedGlobalSearchOpen])
	const closeGlobalSearch = useCallback(() => setScopedGlobalSearchOpen(false), [setScopedGlobalSearchOpen])

	return {
		globalSearchOpen: globalSearchOpenVisible,
		setGlobalSearchOpen: setScopedGlobalSearchOpen,
		openGlobalSearch,
		closeGlobalSearch,
	}
}
