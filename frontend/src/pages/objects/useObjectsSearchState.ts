import { useCallback, useDeferredValue, useEffect, useState } from 'react'

import { legacyProfileScopedStorageKey, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import { useLocalStorageState } from '../../lib/useLocalStorageState'

const MAX_OBJECTS_SEARCH_LENGTH = 160

function sanitizeSearchInput(value: string): string {
	return value.trim().slice(0, MAX_OBJECTS_SEARCH_LENGTH)
}

type UseObjectsSearchStateArgs = {
	apiToken?: string
	profileId?: string | null
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
	apiToken = '',
	profileId = null,
	storageKey,
	debounceMs = 250,
}: UseObjectsSearchStateArgs = {}): UseObjectsSearchStateResult {
	const resolvedStorageKey = storageKey ?? profileScopedStorageKey('objects', apiToken, profileId, 'search')
	const [search, setSearch] = useLocalStorageState<string>(resolvedStorageKey, '', {
		legacyLocalStorageKey: storageKey ? undefined : 'objectsSearch',
		legacyLocalStorageKeys: storageKey ? undefined : [legacyProfileScopedStorageKey('objects', profileId, 'search')],
		sanitize: sanitizeSearchInput,
	})
	const [searchDraft, setSearchDraftState] = useState(search)
	const deferredSearch = useDeferredValue(search)
	const setSearchDraft = useCallback((next: string) => {
		setSearchDraftState(sanitizeSearchInput(next))
	}, [])

	const clearSearch = useCallback(() => {
		setSearchDraftState('')
		setSearch('')
	}, [setSearch])

	useEffect(() => {
		setSearchDraftState(search)
	}, [search])

	useEffect(() => {
		if (searchDraft === search) return
		const id = window.setTimeout(() => {
			setSearch(sanitizeSearchInput(searchDraft))
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
