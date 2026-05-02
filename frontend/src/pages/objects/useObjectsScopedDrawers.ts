import { useCallback, useState, type SetStateAction } from 'react'

type UseObjectsScopedDrawersArgs = {
	scopeKey: string
}

export function useObjectsScopedDrawers({ scopeKey }: UseObjectsScopedDrawersArgs) {
	const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false)
	const [filtersDrawerScopeKey, setFiltersDrawerScopeKey] = useState('')
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
	const [detailsDrawerScopeKey, setDetailsDrawerScopeKey] = useState('')
	const filtersDrawerOpenVisible = filtersDrawerOpen && filtersDrawerScopeKey === scopeKey
	const detailsDrawerOpenVisible = detailsDrawerOpen && detailsDrawerScopeKey === scopeKey

	const setScopedFiltersDrawerOpen = useCallback(
		(next: SetStateAction<boolean>) => {
			const nextOpen = typeof next === 'function' ? next(filtersDrawerOpenVisible) : next
			setFiltersDrawerOpen(nextOpen)
			setFiltersDrawerScopeKey(nextOpen ? scopeKey : '')
		},
		[filtersDrawerOpenVisible, scopeKey],
	)

	const setScopedDetailsDrawerOpen = useCallback(
		(next: SetStateAction<boolean>) => {
			const nextOpen = typeof next === 'function' ? next(detailsDrawerOpenVisible) : next
			setDetailsDrawerOpen(nextOpen)
			setDetailsDrawerScopeKey(nextOpen ? scopeKey : '')
		},
		[detailsDrawerOpenVisible, scopeKey],
	)

	return {
		filtersDrawerOpen: filtersDrawerOpenVisible,
		setFiltersDrawerOpen: setScopedFiltersDrawerOpen,
		detailsDrawerOpen: detailsDrawerOpenVisible,
		setDetailsDrawerOpen: setScopedDetailsDrawerOpen,
	}
}
