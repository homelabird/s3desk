import { useCallback } from 'react'

import type { useObjectsLocationState } from './useObjectsLocationState'
import type { useObjectsTree } from './useObjectsTree'

type ObjectsTreeNavigationArgs = {
	location: Pick<
		ReturnType<typeof useObjectsLocationState>,
		'bucket' | 'navigateToLocation'
	>
	tree: Pick<ReturnType<typeof useObjectsTree>, 'setTreeDrawerOpen' | 'setTreeSelectedKeys'>
}

export function useObjectsTreeNavigation(args: ObjectsTreeNavigationArgs) {
	const { bucket, navigateToLocation } = args.location
	const { setTreeDrawerOpen, setTreeSelectedKeys } = args.tree

	return useCallback(
		(key: string, closeDrawer: boolean) => {
			setTreeSelectedKeys([key])
			if (!bucket) return
			navigateToLocation(bucket, key === '/' ? '' : key, { recordHistory: true })
			if (closeDrawer) setTreeDrawerOpen(false)
		},
		[bucket, navigateToLocation, setTreeDrawerOpen, setTreeSelectedKeys],
	)
}
