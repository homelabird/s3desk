import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useAPIClient } from '../../api/useAPIClient'
import { queryKeys } from '../../api/queryKeys'

export function useProfilesPageData(args: {
	apiToken: string
}) {
	const { apiToken } = args
	const queryClient = useQueryClient()
	const api = useAPIClient()
	const [searchParams, setSearchParams] = useSearchParams()

	const profilesQuery = useQuery({
		queryKey: queryKeys.profiles.list(apiToken),
		queryFn: () => api.profiles.listProfiles(),
	})

	const metaQuery = useQuery({
		queryKey: queryKeys.server.meta(apiToken),
		queryFn: () => api.server.getMeta(),
	})

	const invalidateProfilesQuery = async (scopeApiToken: string) => {
		await queryClient.invalidateQueries({ queryKey: queryKeys.profiles.list(scopeApiToken), exact: true })
	}

	return {
		api,
		metaQuery,
		profilesQuery,
		queryClient,
		searchParams,
		setSearchParams,
		invalidateProfilesQuery,
	}
}
