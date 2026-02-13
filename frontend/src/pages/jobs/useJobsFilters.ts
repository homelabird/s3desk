import { useCallback, useMemo } from 'react'

import type { JobStatus } from '../../api/types'
import { useLocalStorageState } from '../../lib/useLocalStorageState'

export type JobsFiltersState = {
	statusFilter: JobStatus | 'all'
	setStatusFilter: (next: JobStatus | 'all') => void
	typeFilter: string
	setTypeFilter: (next: string) => void
	errorCodeFilter: string
	setErrorCodeFilter: (next: string) => void
	typeFilterNormalized: string
	errorCodeFilterNormalized: string
	filtersDirty: boolean
	resetFilters: () => void
}

export function useJobsFilters(): JobsFiltersState {
	const [statusFilter, setStatusFilter] = useLocalStorageState<JobStatus | 'all'>('jobsStatusFilter', 'all')
	const [typeFilter, setTypeFilter] = useLocalStorageState('jobsTypeFilter', '')
	const [errorCodeFilter, setErrorCodeFilter] = useLocalStorageState('jobsErrorCodeFilter', '')

	const typeFilterNormalized = typeFilter.trim()
	const errorCodeFilterNormalized = errorCodeFilter.trim()

	const filtersDirty = useMemo(
		() => statusFilter !== 'all' || typeFilterNormalized !== '' || errorCodeFilterNormalized !== '',
		[errorCodeFilterNormalized, statusFilter, typeFilterNormalized],
	)

	const resetFilters = useCallback(() => {
		setStatusFilter('all')
		setTypeFilter('')
		setErrorCodeFilter('')
	}, [setErrorCodeFilter, setStatusFilter, setTypeFilter])

	return {
		statusFilter,
		setStatusFilter,
		typeFilter,
		setTypeFilter,
		errorCodeFilter,
		setErrorCodeFilter,
		typeFilterNormalized,
		errorCodeFilterNormalized,
		filtersDirty,
		resetFilters,
	}
}

