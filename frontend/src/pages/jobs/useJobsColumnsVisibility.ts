import { useCallback, useEffect, useMemo } from 'react'

import { legacyProfileScopedStorageKeys, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import { useLocalStorageState } from '../../lib/useLocalStorageState'

export type ColumnKey = 'id' | 'type' | 'summary' | 'status' | 'progress' | 'errorCode' | 'error' | 'createdAt' | 'actions'
export type ToggleableColumnKey = Exclude<ColumnKey, 'actions'>

export type ColumnOption = { key: ToggleableColumnKey; label: string }

export type JobsColumnsVisibilityState = {
	mergedColumnVisibility: Record<ColumnKey, boolean>
	columnOptions: ColumnOption[]
	columnsDirty: boolean
	setColumnVisible: (key: ToggleableColumnKey, next: boolean) => void
	resetColumns: () => void
}

export function useJobsColumnsVisibility(apiToken: string, profileId: string | null): JobsColumnsVisibilityState {
	const defaultColumnVisibility = useMemo<Record<ColumnKey, boolean>>(
		() => ({
			id: false,
			type: true,
			summary: true,
			status: true,
			progress: true,
			errorCode: false,
			error: false,
			createdAt: true,
			actions: true,
		}),
		[],
	)
	const storageKey = profileScopedStorageKey('jobs', apiToken, profileId, 'columnVisibility')
	const defaultsMigrationKey = `${storageKey}:compact-defaults-v1`

	const [columnVisibility, setColumnVisibility] = useLocalStorageState<Record<ColumnKey, boolean>>(
		storageKey,
		defaultColumnVisibility,
		{
			legacyLocalStorageKey: 'jobsColumnVisibility',
			legacyLocalStorageKeys: legacyProfileScopedStorageKeys('jobs', apiToken, profileId, 'columnVisibility'),
		},
	)
	const needsCompactDefaultsMigration = useMemo(
		() =>
			typeof window !== 'undefined' &&
			window.localStorage.getItem(defaultsMigrationKey) === null &&
			Object.values(columnVisibility).every(Boolean),
		[columnVisibility, defaultsMigrationKey],
	)

	useEffect(() => {
		if (typeof window === 'undefined') return
		window.localStorage.setItem(defaultsMigrationKey, '1')
		if (needsCompactDefaultsMigration) setColumnVisibility(defaultColumnVisibility)
	}, [defaultColumnVisibility, defaultsMigrationKey, needsCompactDefaultsMigration, setColumnVisibility])

	const mergedColumnVisibility = useMemo<Record<ColumnKey, boolean>>(
		() => ({
			...defaultColumnVisibility,
			...(needsCompactDefaultsMigration ? defaultColumnVisibility : columnVisibility),
			actions: true,
		}),
		[columnVisibility, defaultColumnVisibility, needsCompactDefaultsMigration],
	)

	const columnOptions = useMemo<ColumnOption[]>(
		() => [
			{ key: 'id', label: 'ID' },
			{ key: 'type', label: 'Type' },
			{ key: 'summary', label: 'Summary' },
			{ key: 'status', label: 'Status' },
			{ key: 'progress', label: 'Progress' },
			{ key: 'errorCode', label: 'Error code' },
			{ key: 'error', label: 'Error' },
			{ key: 'createdAt', label: 'Created' },
		],
		[],
	)

	const columnsDirty = useMemo(
		() => columnOptions.some((option) => mergedColumnVisibility[option.key] !== defaultColumnVisibility[option.key]),
		[columnOptions, mergedColumnVisibility, defaultColumnVisibility],
	)

	const setColumnVisible = useCallback(
		(key: ToggleableColumnKey, next: boolean) => {
			setColumnVisibility((prev) => ({
				...defaultColumnVisibility,
				...prev,
				[key]: next,
			}))
		},
		[defaultColumnVisibility, setColumnVisibility],
	)

	const resetColumns = useCallback(() => {
		setColumnVisibility(defaultColumnVisibility)
	}, [defaultColumnVisibility, setColumnVisibility])

	return {
		mergedColumnVisibility,
		columnOptions,
		columnsDirty,
		setColumnVisible,
		resetColumns,
	}
}
