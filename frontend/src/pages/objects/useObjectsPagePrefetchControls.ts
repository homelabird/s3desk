import type { QueryClient } from '@tanstack/react-query'

import type { APIClientShape } from '../../api/client'
import type { ObjectsCostMode } from '../../lib/objectsCostMode'
import { OBJECTS_LIST_PAGE_SIZE } from './objectsPageConstants'
import { useObjectsPrefetch } from './useObjectsPrefetch'

type BucketOption = {
	value: string
}

type UseObjectsPagePrefetchControlsArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	profileProvider?: string | null
	objectsCostMode: ObjectsCostMode
	queryClient: QueryClient
	bucket: string
	recentBuckets: string[]
	bucketOptions: BucketOption[]
	prefixByBucketRef: { current: Record<string, string> }
}

export function useObjectsPagePrefetchControls(args: UseObjectsPagePrefetchControlsArgs) {
	return useObjectsPrefetch({
		api: args.api,
		apiToken: args.apiToken,
		profileId: args.profileId,
		profileProvider: args.profileProvider,
		objectsCostMode: args.objectsCostMode,
		queryClient: args.queryClient,
		bucket: args.bucket,
		recentBuckets: args.recentBuckets,
		bucketOptions: args.bucketOptions,
		prefixByBucketRef: args.prefixByBucketRef,
		pageSize: OBJECTS_LIST_PAGE_SIZE,
	})
}
