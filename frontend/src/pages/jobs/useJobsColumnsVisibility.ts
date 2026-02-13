import { useCallback, useMemo } from 'react'

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

export function useJobsColumnsVisibility(): JobsColumnsVisibilityState {
	const defaultColumnVisibility = useMemo<Record<ColumnKey, boolean>>(
		() => ({
			id: true,
			type: true,
			summary: true,
			status: true,
			progress: true,
			errorCode: true,
			error: true,
			createdAt: true,
			actions: true,
		}),
		[],
	)

	const [columnVisibility, setColumnVisibility] = useLocalStorageState<Record<ColumnKey, boolean>>(
		'jobsColumnVisibility',
		defaultColumnVisibility,
	)

	const mergedColumnVisibility = useMemo<Record<ColumnKey, boolean>>(
		() => ({
			...defaultColumnVisibility,
			...columnVisibility,
			actions: true,
		}),
		[columnVisibility, defaultColumnVisibility],
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

