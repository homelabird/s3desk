import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { queryKeys } from '../../api/queryKeys'
import type { Bucket } from '../../api/types'
import type { BucketListQueriesAPI } from '../../lib/pageApiScopes'
import { buildProfileCapabilityContext } from '../../lib/profileCapabilityContext'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'

type UseUploadsPageQueriesStateArgs = {
	api: BucketListQueriesAPI
	apiToken: string
	profileId: string | null
}

export function useUploadsPageQueriesState(props: UseUploadsPageQueriesStateArgs) {
	const metaQuery = useQuery({
		queryKey: queryKeys.server.meta(props.apiToken),
		queryFn: () => props.api.server.getMeta(),
		enabled: !!props.apiToken,
	})

	const profilesQuery = useQuery({
		queryKey: queryKeys.profiles.list(props.apiToken),
		queryFn: () => props.api.profiles.listProfiles(),
		enabled: !!props.apiToken,
	})

	const profileCapabilityContext = useMemo(
		() =>
			buildProfileCapabilityContext({
				profiles: profilesQuery.data,
				profileId: props.profileId,
				meta: metaQuery.data,
			}),
		[metaQuery.data, profilesQuery.data, props.profileId],
	)
	const {
		selectedProfile,
		bucketCrudSupported,
		uploadSupported: uploadsSupported,
		uploadDisabledReason: uploadsUnsupportedReason,
	} = profileCapabilityContext
	const bucketCapabilityResolved = !props.profileId || (profilesQuery.isSuccess && metaQuery.isSuccess)

	const bucketsQuery = useQuery({
		queryKey: queryKeys.buckets.list(props.profileId, props.apiToken),
		queryFn: () => props.api.buckets.listBuckets(props.profileId!),
		enabled: !!props.profileId && bucketCapabilityResolved && bucketCrudSupported,
		retry: false,
		staleTime: getBucketsQueryStaleTimeMs(selectedProfile?.provider),
	})

	const bucketOptions = useMemo(
		() => (bucketsQuery.data ?? []).map((entry: Bucket) => ({ label: entry.name, value: entry.name })),
		[bucketsQuery.data],
	)

	const showBucketsEmpty = bucketsQuery.isSuccess && bucketOptions.length === 0

	return {
		selectedProfile,
		uploadsSupported,
		uploadsUnsupportedReason,
		bucketsQuery,
		bucketOptions,
		showBucketsEmpty,
	}
}

export type UploadsPageQueriesState = ReturnType<typeof useUploadsPageQueriesState>
