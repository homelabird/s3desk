import { useCallback, useDeferredValue, useEffect, useState } from 'react'

import { legacyProfileScopedStorageKey, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import { useLocalStorageState } from '../../lib/useLocalStorageState'

const MAX_GLOBAL_SEARCH_TEXT_LENGTH = 160
const MAX_GLOBAL_SEARCH_PREFIX_LENGTH = 512
const MAX_GLOBAL_SEARCH_EXT_LENGTH = 32
const MIN_GLOBAL_SEARCH_LIMIT = 1
const MAX_GLOBAL_SEARCH_LIMIT = 1000
const MAX_GLOBAL_SEARCH_SIZE_BYTES = 1024 * 1024 * 1024 * 1024
const MAX_GLOBAL_SEARCH_MODIFIED_MS = 32503680000000

function clampText(value: string, maxLength: number): string {
	return value.trim().slice(0, maxLength)
}

function clampLimit(value: number): number {
	if (!Number.isFinite(value)) return 100
	return Math.min(MAX_GLOBAL_SEARCH_LIMIT, Math.max(MIN_GLOBAL_SEARCH_LIMIT, Math.trunc(value)))
}

function clampNullableNumber(value: number | null, max: number): number | null {
	if (value === null) return null
	if (!Number.isFinite(value)) return null
	return Math.min(max, Math.max(0, Math.trunc(value)))
}

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

type UseObjectsGlobalSearchStateArgs = {
	apiToken?: string
	profileId?: string | null
	bucket?: string
}

export function useObjectsGlobalSearchState({
	apiToken = '',
	profileId = null,
	bucket = '',
}: UseObjectsGlobalSearchStateArgs = {}): ObjectsGlobalSearchState {
	const [globalSearch, setGlobalSearch] = useLocalStorageState<string>(
		profileScopedStorageKey('objects', apiToken, profileId, 'globalSearch'),
		'',
		{
			legacyLocalStorageKey: 'objectsGlobalSearch',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'globalSearch')],
			sanitize: (value) => clampText(value, MAX_GLOBAL_SEARCH_TEXT_LENGTH),
		},
	)
	const [globalSearchDraft, setGlobalSearchDraftState] = useState(globalSearch)
	const deferredGlobalSearch = useDeferredValue(globalSearch)
	const setGlobalSearchDraft = useCallback((next: string) => {
		setGlobalSearchDraftState(clampText(next, MAX_GLOBAL_SEARCH_TEXT_LENGTH))
	}, [])

	const [globalSearchPrefix, setGlobalSearchPrefix] = useLocalStorageState<string>(
		profileScopedStorageKey('objects', apiToken, profileId, 'globalSearchPrefix'),
		'',
		{
			legacyLocalStorageKey: 'objectsGlobalSearchPrefix',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'globalSearchPrefix')],
			sanitize: (value) => clampText(value, MAX_GLOBAL_SEARCH_PREFIX_LENGTH),
		},
	)
	const [globalSearchLimit, setGlobalSearchLimit] = useLocalStorageState<number>(
		profileScopedStorageKey('objects', apiToken, profileId, 'globalSearchLimit'),
		100,
		{
			legacyLocalStorageKey: 'objectsGlobalSearchLimit',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'globalSearchLimit')],
			sanitize: clampLimit,
		},
	)
	const [globalSearchExt, setGlobalSearchExt] = useLocalStorageState<string>(
		profileScopedStorageKey('objects', apiToken, profileId, 'globalSearchExt'),
		'',
		{
			legacyLocalStorageKey: 'objectsGlobalSearchExt',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'globalSearchExt')],
			sanitize: (value) => clampText(value.replace(/^\.+/, '').toLowerCase(), MAX_GLOBAL_SEARCH_EXT_LENGTH),
		},
	)
	const [globalSearchMinSize, setGlobalSearchMinSize] = useLocalStorageState<number | null>(
		profileScopedStorageKey('objects', apiToken, profileId, 'globalSearchMinSize'),
		null,
		{
			legacyLocalStorageKey: 'objectsGlobalSearchMinSize',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'globalSearchMinSize')],
			sanitize: (value) => clampNullableNumber(value, MAX_GLOBAL_SEARCH_SIZE_BYTES),
		},
	)
	const [globalSearchMaxSize, setGlobalSearchMaxSize] = useLocalStorageState<number | null>(
		profileScopedStorageKey('objects', apiToken, profileId, 'globalSearchMaxSize'),
		null,
		{
			legacyLocalStorageKey: 'objectsGlobalSearchMaxSize',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'globalSearchMaxSize')],
			sanitize: (value) => clampNullableNumber(value, MAX_GLOBAL_SEARCH_SIZE_BYTES),
		},
	)
	const [globalSearchMinModifiedMs, setGlobalSearchMinModifiedMs] = useLocalStorageState<number | null>(
		profileScopedStorageKey('objects', apiToken, profileId, 'globalSearchMinModifiedMs'),
		null,
		{
			legacyLocalStorageKey: 'objectsGlobalSearchMinModifiedMs',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'globalSearchMinModifiedMs')],
			sanitize: (value) => clampNullableNumber(value, MAX_GLOBAL_SEARCH_MODIFIED_MS),
		},
	)
	const [globalSearchMaxModifiedMs, setGlobalSearchMaxModifiedMs] = useLocalStorageState<number | null>(
		profileScopedStorageKey('objects', apiToken, profileId, 'globalSearchMaxModifiedMs'),
		null,
		{
			legacyLocalStorageKey: 'objectsGlobalSearchMaxModifiedMs',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('objects', profileId, 'globalSearchMaxModifiedMs')],
			sanitize: (value) => clampNullableNumber(value, MAX_GLOBAL_SEARCH_MODIFIED_MS),
		},
	)

	const [indexPrefix, setIndexPrefix] = useState('')
	const [indexFullReindex, setIndexFullReindex] = useState(true)

	useEffect(() => {
		setGlobalSearchDraftState(globalSearch)
	}, [globalSearch])

	useEffect(() => {
		setIndexPrefix('')
		setIndexFullReindex(true)
	}, [apiToken, bucket, profileId])

	const resetGlobalSearch = useCallback(() => {
		setGlobalSearch('')
		setGlobalSearchDraftState('')
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
		setGlobalSearchDraftState,
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
