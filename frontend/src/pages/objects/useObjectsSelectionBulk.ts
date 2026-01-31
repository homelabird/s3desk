import { useCallback } from 'react'

type UseObjectsSelectionBulkArgs = {
	visibleObjectKeys: string[]
	orderedVisibleObjectKeys: string[]
	setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>
	setLastSelectedObjectKey: React.Dispatch<React.SetStateAction<string | null>>
}

const lastKeyOrNull = (keys: string[]): string | null => keys[keys.length - 1] ?? null

export function useObjectsSelectionBulk({
	visibleObjectKeys,
	orderedVisibleObjectKeys,
	setSelectedKeys,
	setLastSelectedObjectKey,
}: UseObjectsSelectionBulkArgs) {
	const handleToggleSelectAll = useCallback(
		(checked: boolean) => {
			setSelectedKeys((prev) => {
				const next = new Set(prev)
				if (checked) {
					for (const k of visibleObjectKeys) next.add(k)
				} else {
					for (const k of visibleObjectKeys) next.delete(k)
				}
				return next
			})
			setLastSelectedObjectKey(checked ? lastKeyOrNull(orderedVisibleObjectKeys) : null)
		},
		[orderedVisibleObjectKeys, setLastSelectedObjectKey, setSelectedKeys, visibleObjectKeys],
	)

	const selectRange = useCallback(
		(startKey: string, endKey: string) => {
			const a = orderedVisibleObjectKeys.indexOf(startKey)
			const b = orderedVisibleObjectKeys.indexOf(endKey)
			if (a !== -1) {
				const start = Math.min(a, b)
				const end = Math.max(a, b)
				const range = orderedVisibleObjectKeys.slice(start, end + 1)
				setSelectedKeys(new Set(range))
				setLastSelectedObjectKey(endKey)
				return
			}
			setSelectedKeys(new Set([endKey]))
			setLastSelectedObjectKey(endKey)
		},
		[orderedVisibleObjectKeys, setLastSelectedObjectKey, setSelectedKeys],
	)

	const selectAllLoaded = useCallback(() => {
		setSelectedKeys((prev) => {
			const next = new Set(prev)
			for (const k of visibleObjectKeys) next.add(k)
			return next
		})
		setLastSelectedObjectKey(lastKeyOrNull(orderedVisibleObjectKeys))
	}, [orderedVisibleObjectKeys, setLastSelectedObjectKey, setSelectedKeys, visibleObjectKeys])

	return {
		handleToggleSelectAll,
		selectRange,
		selectAllLoaded,
	}
}
