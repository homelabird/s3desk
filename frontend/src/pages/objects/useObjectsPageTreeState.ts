import { logObjectsDebug } from './objectsPageDebug'
import type { useObjectsLocationState } from './useObjectsLocationState'
import type { useObjectsPageEnvironment } from './useObjectsPageEnvironment'
import { useObjectsTree } from './useObjectsTree'

type UseObjectsPageTreeStateArgs = {
	apiToken: string
	profileId: string | null
	environment: Pick<
		ReturnType<typeof useObjectsPageEnvironment>,
		'api' | 'debugObjectsList'
	>
	location: Pick<ReturnType<typeof useObjectsLocationState>, 'bucket' | 'prefix'>
}

export function useObjectsPageTreeState(args: UseObjectsPageTreeStateArgs) {
	return useObjectsTree({
		api: args.environment.api,
		apiToken: args.apiToken,
		profileId: args.profileId,
		bucket: args.location.bucket,
		prefix: args.location.prefix,
		debugEnabled: args.environment.debugObjectsList,
		log: logObjectsDebug,
	})
}
