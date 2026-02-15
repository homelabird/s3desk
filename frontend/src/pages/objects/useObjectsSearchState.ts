import { useCallback, useDeferredValue, useEffect, useState } from 'react'

import { useLocalStorageState } from '../../lib/useLocalStorageState'

type UseObjectsSearchStateArgs = {
	storageKey?: string
	debounceMs?: number
}

type UseObjectsSearchStateResult = {
	search: string
	searchDraft: string
	setSearchDraft: (next: string) => void
	clearSearch: () => void
	deferredSearch: string
}

export function useObjectsSearchState({
	storageKey = 'objectsSearch',
	debounceMs = 250,
}: UseObjectsSearchStateArgs = {}): UseObjectsSearchStateResult {
	const [search, setSearch] = useLocalStorageState<string>(storageKey, '')
	const [searchDraft, setSearchDraft] = useState(search)
	const deferredSearch = useDeferredValue(search)

	const clearSearch = useCallback(() => {
		setSearchDraft('')
		setSearch('')
	}, [setSearch])

	useEffect(() => {
		setSearchDraft(search)
	}, [search])

	useEffect(() => {
		if (searchDraft === search) return
		const id = window.setTimeout(() => {
			setSearch(searchDraft)
		}, debounceMs)
		return () => window.clearTimeout(id)
	}, [debounceMs, search, searchDraft, setSearch])

	return {
		search,
		searchDraft,
		setSearchDraft,
		clearSearch,
		deferredSearch,
	}
}
