import { useCallback, useMemo } from 'react'

import type { JobStatus } from '../../api/types'
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

export function useJobsFilters(): JobsFiltersState {
	const [statusFilter, setStatusFilter] = useLocalStorageState<JobStatus | 'all'>('jobsStatusFilter', 'all')
	const [searchFilter, setSearchFilter] = useLocalStorageState('jobsSearchFilter', '')
	const [typeFilter, setTypeFilter] = useLocalStorageState('jobsTypeFilter', '')
	const [errorCodeFilter, setErrorCodeFilter] = useLocalStorageState('jobsErrorCodeFilter', '')

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
