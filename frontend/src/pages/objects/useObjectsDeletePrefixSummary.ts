import { useQuery } from '@tanstack/react-query'

import type { APIClient } from '../../api/client'
import { APIError } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type UseObjectsDeletePrefixSummaryArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	prefix: string
	apiToken: string
	enabled: boolean
}

export function useObjectsDeletePrefixSummary({
	api,
	profileId,
	bucket,
	prefix,
	apiToken,
	enabled,
}: UseObjectsDeletePrefixSummaryArgs) {
	const deletePrefixSummaryQuery = useQuery({
		queryKey: ['objectIndexSummary', profileId, bucket, prefix, apiToken],
		enabled: enabled && !!profileId && !!bucket && !!prefix,
		queryFn: () => api.getObjectIndexSummary({ profileId: profileId!, bucket, prefix, sampleLimit: 5 }),
		retry: false,
	})

	const deletePrefixSummary = deletePrefixSummaryQuery.data ?? null
	const deletePrefixSummaryNotIndexed =
		deletePrefixSummaryQuery.error instanceof APIError && deletePrefixSummaryQuery.error.code === 'not_indexed'
	const deletePrefixSummaryError = deletePrefixSummaryQuery.isError ? formatErr(deletePrefixSummaryQuery.error) : ''

	return {
		deletePrefixSummaryQuery,
		deletePrefixSummary,
		deletePrefixSummaryNotIndexed,
		deletePrefixSummaryError,
	}
}
