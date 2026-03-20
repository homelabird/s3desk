import { useQuery } from '@tanstack/react-query'

import type { APIClient } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type UseObjectsPrefixSummaryArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	prefix: string
	apiToken: string
	enabled: boolean
}

export function useObjectsPrefixSummary({
	api,
	profileId,
	bucket,
	prefix,
	apiToken,
	enabled,
}: UseObjectsPrefixSummaryArgs) {
	const summaryQuery = useQuery({
		queryKey: ['objectIndexSummary', profileId, bucket, prefix, apiToken],
		enabled: enabled && !!profileId && !!bucket && !!prefix,
		queryFn: () => api.objects.getObjectIndexSummary({ profileId: profileId!, bucket, prefix, sampleLimit: 5 }),
		retry: false,
	})

	const summary = summaryQuery.data ?? null
	const summaryNotIndexed = !!summary && !summary.indexedAt
	const summaryError = summaryQuery.isError ? formatErr(summaryQuery.error) : ''

	return {
		summaryQuery,
		summary,
		summaryNotIndexed,
		summaryError,
	}
}
