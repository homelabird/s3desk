import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { APIClient } from '../../api/client'
import type { Bucket, MetaResponse, Profile } from '../../api/types'
import { queryKeys } from '../../api/queryKeys'
import {
	getProviderCapabilities,
	getProviderCapabilityReason,
	type ProviderCapabilityMatrix,
} from '../../lib/providerCapabilities'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'

type UseBucketsPageQueriesStateArgs = {
	api: APIClient
	apiToken: string
	profileId: string | null
}

export type BucketsPageQueriesState = {
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

	const selectedProfile: Profile | null = useMemo(() => {
		if (!profileId) return null
		return profilesQuery.data?.find((profile) => profile.id === profileId) ?? null
	}, [profileId, profilesQuery.data])

	const profileResolved = !profileId || profilesQuery.isSuccess
	const capabilities = selectedProfile
		? getProviderCapabilities(selectedProfile.provider, metaQuery.data?.capabilities?.providers, selectedProfile)
		: null
	const bucketCrudSupported = capabilities?.bucketCrud ?? true
	const bucketCrudUnsupportedReason =
		getProviderCapabilityReason(capabilities, 'bucketCrud') ?? 'Bucket operations are not supported by this profile.'

	const bucketsQuery = useQuery({
		queryKey: queryKeys.buckets.list(profileId, apiToken),
		queryFn: () => api.buckets.listBuckets(profileId!),
		enabled: !!profileId && profileResolved && bucketCrudSupported,
		retry: false,
		staleTime: getBucketsQueryStaleTimeMs(selectedProfile?.provider),
	})

	const buckets = bucketsQuery.data ?? []
	const showBucketsEmpty = bucketCrudSupported && bucketsQuery.isSuccess && buckets.length === 0

	return {
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
