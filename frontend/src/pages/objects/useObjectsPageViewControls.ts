import type { useObjectsLocationState } from './useObjectsLocationState'
import type { useObjectsPageEnvironment } from './useObjectsPageEnvironment'
import { useObjectsPageViewState } from './useObjectsPageViewState'
import type { useObjectsTree } from './useObjectsTree'

type UseObjectsPageViewControlsArgs = {
	apiToken: string
	profileId: string | null
	environment: Pick<
		ReturnType<typeof useObjectsPageEnvironment>,
		'isOffline' | 'screens'
	>
	location: Pick<
		ReturnType<typeof useObjectsLocationState>,
		'bucket' | 'prefix' | 'openPathModal'
	>
	tree: Pick<ReturnType<typeof useObjectsTree>, 'setTreeDrawerOpen'>
}

export function useObjectsPageViewControls(args: UseObjectsPageViewControlsArgs) {
	return useObjectsPageViewState({
		apiToken: args.apiToken,
		profileId: args.profileId,
		bucket: args.location.bucket,
		prefix: args.location.prefix,
		isOffline: args.environment.isOffline,
		screens: args.environment.screens,
		openPathModal: args.location.openPathModal,
		setTreeDrawerOpen: args.tree.setTreeDrawerOpen,
	})
}
