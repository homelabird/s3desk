import { useCallback, useDeferredValue, useState } from 'react'

import { useLocalStorageState } from '../../lib/useLocalStorageState'

export type ObjectsGlobalSearchState = {
	globalSearch: string
	setGlobalSearch: (next: string) => void
	globalSearchDraft: string
	setGlobalSearchDraft: (next: string) => void
	deferredGlobalSearch: string

	globalSearchPrefix: string
	setGlobalSearchPrefix: (next: string) => void
	globalSearchLimit: number
	setGlobalSearchLimit: (next: number) => void
	globalSearchExt: string
	setGlobalSearchExt: (next: string) => void
	globalSearchMinSize: number | null
	setGlobalSearchMinSize: (next: number | null) => void
	globalSearchMaxSize: number | null
	setGlobalSearchMaxSize: (next: number | null) => void
	globalSearchMinModifiedMs: number | null
	setGlobalSearchMinModifiedMs: (next: number | null) => void
	globalSearchMaxModifiedMs: number | null
	setGlobalSearchMaxModifiedMs: (next: number | null) => void

	indexPrefix: string
	setIndexPrefix: (next: string) => void
	indexFullReindex: boolean
	setIndexFullReindex: (next: boolean) => void

	resetGlobalSearch: () => void
}

export function useObjectsGlobalSearchState(): ObjectsGlobalSearchState {
	const [globalSearch, setGlobalSearch] = useLocalStorageState<string>('objectsGlobalSearch', '')
	const [globalSearchDraft, setGlobalSearchDraft] = useState(globalSearch)
	const deferredGlobalSearch = useDeferredValue(globalSearch)

	const [globalSearchPrefix, setGlobalSearchPrefix] = useLocalStorageState<string>('objectsGlobalSearchPrefix', '')
	const [globalSearchLimit, setGlobalSearchLimit] = useLocalStorageState<number>('objectsGlobalSearchLimit', 100)
	const [globalSearchExt, setGlobalSearchExt] = useLocalStorageState<string>('objectsGlobalSearchExt', '')
	const [globalSearchMinSize, setGlobalSearchMinSize] = useLocalStorageState<number | null>('objectsGlobalSearchMinSize', null)
	const [globalSearchMaxSize, setGlobalSearchMaxSize] = useLocalStorageState<number | null>('objectsGlobalSearchMaxSize', null)
	const [globalSearchMinModifiedMs, setGlobalSearchMinModifiedMs] = useLocalStorageState<number | null>(
		'objectsGlobalSearchMinModifiedMs',
		null,
	)
	const [globalSearchMaxModifiedMs, setGlobalSearchMaxModifiedMs] = useLocalStorageState<number | null>(
		'objectsGlobalSearchMaxModifiedMs',
		null,
	)

	const [indexPrefix, setIndexPrefix] = useState('')
	const [indexFullReindex, setIndexFullReindex] = useState(true)

	const resetGlobalSearch = useCallback(() => {
		setGlobalSearch('')
		setGlobalSearchDraft('')
		setGlobalSearchPrefix('')
		setGlobalSearchLimit(100)
		setGlobalSearchExt('')
		setGlobalSearchMinSize(null)
		setGlobalSearchMaxSize(null)
		setGlobalSearchMinModifiedMs(null)
		setGlobalSearchMaxModifiedMs(null)
		setIndexPrefix('')
		setIndexFullReindex(true)
	}, [
		setGlobalSearch,
		setGlobalSearchDraft,
		setGlobalSearchPrefix,
		setGlobalSearchLimit,
		setGlobalSearchExt,
		setGlobalSearchMinSize,
		setGlobalSearchMaxSize,
		setGlobalSearchMinModifiedMs,
		setGlobalSearchMaxModifiedMs,
		setIndexPrefix,
		setIndexFullReindex,
	])

	return {
		globalSearch,
		setGlobalSearch,
		globalSearchDraft,
		setGlobalSearchDraft,
		deferredGlobalSearch,
		globalSearchPrefix,
		setGlobalSearchPrefix,
		globalSearchLimit,
		setGlobalSearchLimit,
		globalSearchExt,
		setGlobalSearchExt,
		globalSearchMinSize,
		setGlobalSearchMinSize,
		globalSearchMaxSize,
		setGlobalSearchMaxSize,
		globalSearchMinModifiedMs,
		setGlobalSearchMinModifiedMs,
		globalSearchMaxModifiedMs,
		setGlobalSearchMaxModifiedMs,
		indexPrefix,
		setIndexPrefix,
		indexFullReindex,
		setIndexFullReindex,
		resetGlobalSearch,
	}
}

