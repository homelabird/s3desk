import { useCallback, useMemo } from 'react'

import type { JobStatus } from '../../api/types'
import { legacyProfileScopedStorageKey, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import { useLocalStorageState } from '../../lib/useLocalStorageState'

export type JobsFiltersState = {
	statusFilter: JobStatus | 'all'
	setStatusFilter: (next: JobStatus | 'all') => void
	searchFilter: string
	setSearchFilter: (next: string) => void
	typeFilter: string
	setTypeFilter: (next: string) => void
	errorCodeFilter: string
	setErrorCodeFilter: (next: string) => void
	searchFilterNormalized: string
	typeFilterNormalized: string
	errorCodeFilterNormalized: string
	filtersDirty: boolean
	resetFilters: () => void
}

export function useJobsFilters(apiToken: string, profileId: string | null): JobsFiltersState {
	const [statusFilter, setStatusFilter] = useLocalStorageState<JobStatus | 'all'>(
		profileScopedStorageKey('jobs', apiToken, profileId, 'statusFilter'),
		'all',
		{
			legacyLocalStorageKey: 'jobsStatusFilter',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('jobs', profileId, 'statusFilter')],
		},
	)
	const [searchFilter, setSearchFilter] = useLocalStorageState(
		profileScopedStorageKey('jobs', apiToken, profileId, 'searchFilter'),
		'',
		{
			legacyLocalStorageKey: 'jobsSearchFilter',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('jobs', profileId, 'searchFilter')],
		},
	)
	const [typeFilter, setTypeFilter] = useLocalStorageState(
		profileScopedStorageKey('jobs', apiToken, profileId, 'typeFilter'),
		'',
		{
			legacyLocalStorageKey: 'jobsTypeFilter',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('jobs', profileId, 'typeFilter')],
		},
	)
	const [errorCodeFilter, setErrorCodeFilter] = useLocalStorageState(
		profileScopedStorageKey('jobs', apiToken, profileId, 'errorCodeFilter'),
		'',
		{
			legacyLocalStorageKey: 'jobsErrorCodeFilter',
			legacyLocalStorageKeys: [legacyProfileScopedStorageKey('jobs', profileId, 'errorCodeFilter')],
		},
	)

	const searchFilterNormalized = searchFilter.trim()
	const typeFilterNormalized = typeFilter.trim()
	const errorCodeFilterNormalized = errorCodeFilter.trim()

	const filtersDirty = useMemo(
		() =>
			statusFilter !== 'all' ||
			searchFilterNormalized !== '' ||
			typeFilterNormalized !== '' ||
			errorCodeFilterNormalized !== '',
		[errorCodeFilterNormalized, searchFilterNormalized, statusFilter, typeFilterNormalized],
	)

	const resetFilters = useCallback(() => {
		setStatusFilter('all')
		setSearchFilter('')
		setTypeFilter('')
		setErrorCodeFilter('')
	}, [setErrorCodeFilter, setSearchFilter, setStatusFilter, setTypeFilter])

	return {
		statusFilter,
		setStatusFilter,
		searchFilter,
		setSearchFilter,
		typeFilter,
		setTypeFilter,
		errorCodeFilter,
		setErrorCodeFilter,
		searchFilterNormalized,
		typeFilterNormalized,
		errorCodeFilterNormalized,
		filtersDirty,
		resetFilters,
	}
}
