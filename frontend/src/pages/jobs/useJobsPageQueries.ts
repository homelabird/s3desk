import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { queryKeys } from '../../api/queryKeys'
import type { APIClient } from '../../api/client'
import type { Bucket, Job, JobStatus, Profile } from '../../api/types'
import { measurePerf } from '../../lib/perf'
import { getProviderCapabilities, getUploadCapabilityDisabledReason } from '../../lib/providerCapabilities'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'

type JobsPageQueryFilters = {
	statusFilter: JobStatus | 'all'
	typeFilterNormalized: string
	errorCodeFilterNormalized: string
}

type UseJobsPageQueriesArgs = {
	api: APIClient
	apiToken: string
	profileId: string | null
	filters: JobsPageQueryFilters
	eventsConnected: boolean
}

export function useJobsPageQueries(props: UseJobsPageQueriesArgs) {
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
	const uploadSupported = profileCapabilities ? profileCapabilities.objectCrud && profileCapabilities.jobTransfer : true
	const uploadDisabledReason = getUploadCapabilityDisabledReason(profileCapabilities)

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

	const jobsQuery = useInfiniteQuery({
		queryKey: queryKeys.jobs.list(
			props.profileId,
			props.apiToken,
			props.filters.statusFilter,
			props.filters.typeFilterNormalized,
			props.filters.errorCodeFilterNormalized,
		),
		enabled: !!props.profileId,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			props.api.jobs.listJobs(props.profileId!, {
				limit: 50,
				status: props.filters.statusFilter === 'all' ? undefined : props.filters.statusFilter,
				type: props.filters.typeFilterNormalized || undefined,
				errorCode: props.filters.errorCodeFilterNormalized || undefined,
				cursor: pageParam,
			}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		refetchInterval: props.eventsConnected ? false : 5000,
	})

	const jobs = useMemo(
		() =>
			measurePerf('Jobs.flatten', () => jobsQuery.data?.pages.flatMap((page) => page.items as Job[]) ?? [], {
				pages: jobsQuery.data?.pages.length ?? 0,
			}),
		[jobsQuery.data],
	)

	return {
		selectedProfile,
		uploadSupported,
		uploadDisabledReason,
		bucketsQuery,
		bucketOptions,
		jobsQuery,
		jobs,
	}
}
