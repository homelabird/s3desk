import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { Bucket, MetaResponse, Profile } from '../../api/types'
import { queryKeys } from '../../api/queryKeys'
import type { BucketListQueriesAPI } from '../../lib/pageApiScopes'
import { buildProfileCapabilityContext } from '../../lib/profileCapabilityContext'
import type { ProviderCapabilityMatrix } from '../../lib/providerCapabilities'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'

type UseBucketsPageQueriesStateArgs = {
	api: BucketListQueriesAPI
	apiToken: string
	profileId: string | null
}

export type BucketsPageQueriesState = {
	profileId: string | null
	metaQuery: UseQueryResult<MetaResponse>
	profilesQuery: UseQueryResult<Profile[]>
	selectedProfile: Profile | null
	profileResolved: boolean
	capabilities: ProviderCapabilityMatrix | null
	bucketCrudSupported: boolean
	bucketCrudUnsupportedReason: string
	bucketsQuery: UseQueryResult<Bucket[]>
	buckets: Bucket[]
	showBucketsEmpty: boolean
}

export function useBucketsPageQueriesState({
	api,
	apiToken,
	profileId,
}: UseBucketsPageQueriesStateArgs): BucketsPageQueriesState {
	const metaQuery = useQuery({
		queryKey: queryKeys.server.meta(apiToken),
		queryFn: () => api.server.getMeta(),
		retry: false,
	})

	const profilesQuery = useQuery({
		queryKey: queryKeys.profiles.list(apiToken),
		queryFn: () => api.profiles.listProfiles(),
	})

	const profileCapabilityContext = useMemo(
		() =>
			buildProfileCapabilityContext({
				profiles: profilesQuery.data,
				profileId,
				meta: metaQuery.data,
			}),
		[metaQuery.data, profileId, profilesQuery.data],
	)
	const {
		selectedProfile,
		capabilities,
		bucketCrudSupported,
		bucketCrudUnsupportedReason,
	} = profileCapabilityContext

	const profileResolved = !profileId || profilesQuery.isSuccess
	const bucketCapabilityResolved = !profileId || (profilesQuery.isSuccess && metaQuery.isSuccess)

	const bucketsQuery = useQuery({
		queryKey: queryKeys.buckets.list(profileId, apiToken),
		queryFn: () => api.buckets.listBuckets(profileId!),
		enabled: !!profileId && bucketCapabilityResolved && bucketCrudSupported,
		retry: false,
		staleTime: getBucketsQueryStaleTimeMs(selectedProfile?.provider),
	})

	const buckets = bucketsQuery.data ?? []
	const showBucketsEmpty = bucketCrudSupported && bucketsQuery.isSuccess && buckets.length === 0

	return {
		profileId,
		metaQuery,
		profilesQuery,
		selectedProfile,
		profileResolved,
		capabilities,
		bucketCrudSupported,
		bucketCrudUnsupportedReason,
		bucketsQuery,
		buckets,
		showBucketsEmpty,
	}
}
