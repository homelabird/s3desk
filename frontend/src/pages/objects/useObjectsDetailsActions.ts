import { useCallback } from 'react'

type UseObjectsDetailsActionsArgs = {
	dockDetails: boolean
	setDetailsOpen: React.Dispatch<React.SetStateAction<boolean>>
	setDetailsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>
	setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>
	setLastSelectedObjectKey: React.Dispatch<React.SetStateAction<string | null>>
}

export function useObjectsDetailsActions({
	dockDetails,
	setDetailsOpen,
	setDetailsDrawerOpen,
	setSelectedKeys,
	setLastSelectedObjectKey,
}: UseObjectsDetailsActionsArgs) {
	const openDetails = useCallback(() => {
		if (dockDetails) {
			setDetailsOpen(true)
			return
		}
		setDetailsDrawerOpen(true)
	}, [dockDetails, setDetailsDrawerOpen, setDetailsOpen])

	const openDetailsForKey = useCallback(
		(key: string) => {
			setSelectedKeys(new Set([key]))
			setLastSelectedObjectKey(key)
			openDetails()
		},
		[openDetails, setLastSelectedObjectKey, setSelectedKeys],
	)

	const toggleDetails = useCallback(() => {
		if (dockDetails) {
			setDetailsOpen((prev) => !prev)
			return
		}
		setDetailsDrawerOpen((prev) => !prev)
	}, [dockDetails, setDetailsDrawerOpen, setDetailsOpen])

	return {
		openDetails,
		openDetailsForKey,
		toggleDetails,
	}
}
