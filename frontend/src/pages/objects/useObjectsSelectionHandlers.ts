import { useCallback, type MouseEvent } from 'react'

type UseObjectsSelectionHandlersArgs = {
	orderedVisibleObjectKeys: string[]
	lastSelectedObjectKey: string | null
	setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>
	setLastSelectedObjectKey: React.Dispatch<React.SetStateAction<string | null>>
}

const buildKeyRange = (keys: string[], startKey: string, endKey: string): string[] | null => {
	if (keys.length === 0) return null
	const startIndex = keys.indexOf(startKey)
	const endIndex = keys.indexOf(endKey)
	if (startIndex === -1 || endIndex === -1) return null
	const start = Math.min(startIndex, endIndex)
	const end = Math.max(startIndex, endIndex)
	return keys.slice(start, end + 1)
}

export function useObjectsSelectionHandlers({
	orderedVisibleObjectKeys,
	lastSelectedObjectKey,
	setSelectedKeys,
	setLastSelectedObjectKey,
}: UseObjectsSelectionHandlersArgs) {
	const selectObjectFromPointerEvent = useCallback(
		(event: MouseEvent, key: string) => {
			const isRange = event.shiftKey && !!lastSelectedObjectKey
			const isToggle = event.metaKey || event.ctrlKey

			if (isRange && lastSelectedObjectKey) {
				const range = buildKeyRange(orderedVisibleObjectKeys, lastSelectedObjectKey, key)
				if (range) {
					setSelectedKeys((prev) => {
						const next = isToggle ? new Set(prev) : new Set<string>()
						for (const k of range) next.add(k)
						return next
					})
					setLastSelectedObjectKey(key)
					return
				}
			}

			if (isToggle) {
				setSelectedKeys((prev) => {
					const next = new Set(prev)
					if (next.has(key)) next.delete(key)
					else next.add(key)
					return next
				})
				setLastSelectedObjectKey(key)
				return
			}

			setSelectedKeys(new Set([key]))
			setLastSelectedObjectKey(key)
		},
		[lastSelectedObjectKey, orderedVisibleObjectKeys, setLastSelectedObjectKey, setSelectedKeys],
	)

	const selectObjectFromCheckboxEvent = useCallback(
		(event: MouseEvent, key: string) => {
			event.stopPropagation()

			const isRange = event.shiftKey && !!lastSelectedObjectKey
			const isAdd = event.metaKey || event.ctrlKey

			if (isRange && lastSelectedObjectKey) {
				const range = buildKeyRange(orderedVisibleObjectKeys, lastSelectedObjectKey, key)
				if (range) {
					setSelectedKeys((prev) => {
						const next = isAdd ? new Set(prev) : new Set<string>()
						for (const k of range) next.add(k)
						return next
					})
					setLastSelectedObjectKey(key)
					return
				}
			}

			setSelectedKeys((prev) => {
				const next = new Set(prev)
				if (next.has(key)) next.delete(key)
				else next.add(key)
				return next
			})
			setLastSelectedObjectKey(key)
		},
		[lastSelectedObjectKey, orderedVisibleObjectKeys, setLastSelectedObjectKey, setSelectedKeys],
	)

	const ensureObjectSelectedForContextMenu = useCallback(
		(key: string) => {
			setSelectedKeys((prev) => {
				if (prev.has(key)) return prev
				return new Set([key])
			})
			setLastSelectedObjectKey(key)
		},
		[setLastSelectedObjectKey, setSelectedKeys],
	)

	return {
		selectObjectFromPointerEvent,
		selectObjectFromCheckboxEvent,
		ensureObjectSelectedForContextMenu,
	}
}
