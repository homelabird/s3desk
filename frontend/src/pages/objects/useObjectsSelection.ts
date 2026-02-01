import { useCallback, useState } from 'react'

export function useObjectsSelection() {
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
	const [lastSelectedObjectKey, setLastSelectedObjectKey] = useState<string | null>(null)

	const clearSelection = useCallback(() => {
		setSelectedKeys(new Set())
		setLastSelectedObjectKey(null)
	}, [])

	return {
		selectedKeys,
		setSelectedKeys,
		selectedCount: selectedKeys.size,
		lastSelectedObjectKey,
		setLastSelectedObjectKey,
		clearSelection,
	}
}
