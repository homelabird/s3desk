import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { queryKeys } from '../../api/queryKeys'
import type { APIClient } from '../../api/client'
import type { Bucket, Profile } from '../../api/types'
import { getProviderCapabilities, getUploadCapabilityDisabledReason } from '../../lib/providerCapabilities'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'

type UseUploadsPageQueriesStateArgs = {
	api: APIClient
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

	const selectedProfile: Profile | null = useMemo(() => {
		if (!props.profileId) return null
		return profilesQuery.data?.find((profile) => profile.id === props.profileId) ?? null
	}, [profilesQuery.data, props.profileId])

	const profileCapabilities = selectedProfile?.provider
		? getProviderCapabilities(selectedProfile.provider, metaQuery.data?.capabilities?.providers, selectedProfile)
		: null
	const uploadsSupported = profileCapabilities ? profileCapabilities.objectCrud && profileCapabilities.jobTransfer : true
	const uploadsUnsupportedReason = getUploadCapabilityDisabledReason(profileCapabilities)

	const bucketsQuery = useQuery({
		queryKey: queryKeys.buckets.list(props.profileId, props.apiToken),
		queryFn: () => props.api.buckets.listBuckets(props.profileId!),
		enabled: !!props.profileId,
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
