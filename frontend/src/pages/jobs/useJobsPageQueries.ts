import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { queryKeys } from '../../api/queryKeys'
import type { Bucket, Job, JobStatus } from '../../api/types'
import type { JobsPageQueriesAPI } from '../../lib/pageApiScopes'
import { measurePerf } from '../../lib/perf'
import { buildProfileCapabilityContext } from '../../lib/profileCapabilityContext'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'
import type { JobsStatusFilter } from './useJobsFilters'

type JobsPageQueryFilters = {
	statusFilter: JobsStatusFilter
	typeFilterNormalized: string
	errorCodeFilterNormalized: string
}

type UseJobsPageQueriesArgs = {
	api: JobsPageQueriesAPI
	apiToken: string
	profileId: string | null
	filters: JobsPageQueryFilters
	eventsConnected: boolean
	bucketsEnabled: boolean
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

	const profileCapabilityContext = useMemo(
		() =>
			buildProfileCapabilityContext({
				profiles: profilesQuery.data,
				profileId: props.profileId,
				meta: metaQuery.data,
			}),
		[metaQuery.data, profilesQuery.data, props.profileId],
	)
	const { selectedProfile, bucketCrudSupported, uploadSupported, uploadDisabledReason } = profileCapabilityContext
	const bucketCapabilityResolved = !props.profileId || (profilesQuery.isSuccess && metaQuery.isSuccess)

	const bucketsQueryEnabled = props.bucketsEnabled && !!props.profileId && bucketCapabilityResolved && bucketCrudSupported
	const bucketsQueryKey = queryKeys.buckets.list(props.profileId, props.apiToken)
	const bucketsQuery = useQuery({
		queryKey: bucketsQueryEnabled ? bucketsQueryKey : [...bucketsQueryKey, 'disabled'],
		queryFn: ({ signal }) => props.api.buckets.listBuckets(props.profileId!, signal),
		enabled: bucketsQueryEnabled,
		retry: false,
		staleTime: getBucketsQueryStaleTimeMs(selectedProfile?.provider),
	})

	const bucketOptions = useMemo(
		() => (bucketsQuery.data ?? []).map((entry: Bucket) => ({ label: entry.name, value: entry.name })),
		[bucketsQuery.data],
	)

	const apiStatusFilter: JobStatus | undefined =
		props.filters.statusFilter === 'all' || props.filters.statusFilter === 'active'
			? undefined
			: props.filters.statusFilter

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
		queryFn: ({ pageParam, signal }) =>
			props.api.jobs.listJobs(props.profileId!, {
				limit: 50,
				status: apiStatusFilter,
				type: props.filters.typeFilterNormalized || undefined,
				errorCode: props.filters.errorCodeFilterNormalized || undefined,
				cursor: pageParam,
				signal,
			}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		// ponytail: slow multi-page polling; reconnect or manual refresh remains immediate.
		refetchInterval: (query) =>
			props.eventsConnected ? false : (query.state.data?.pages.length ?? 0) > 1 ? 30_000 : 5000,
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
