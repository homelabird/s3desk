import { useQuery, type QueryClient } from '@tanstack/react-query'

import { queryKeys } from '../../api/queryKeys'
import type { APIClient } from '../../api/client'
import type { Profile } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { ProfileFormValues, TLSCapability } from './profileTypes'
import { buildTLSConfigFromValues } from './profileMutationUtils'

type UseProfilesPageTLSStateArgs = {
	api: APIClient
	apiToken: string
	queryClient: Pick<QueryClient, 'invalidateQueries'>
	activeEditProfile: Profile | null
	tlsCapability: TLSCapability | null | undefined
}

export function useProfilesPageTLSState(args: UseProfilesPageTLSStateArgs) {
	const { api, apiToken, queryClient, activeEditProfile, tlsCapability } = args
	const tlsCapabilityEnabled = tlsCapability?.enabled ?? true
	const profileTLSQuery = useQuery({
		queryKey: queryKeys.profiles.tls(activeEditProfile?.id, apiToken),
		enabled: !!activeEditProfile && tlsCapabilityEnabled,
		queryFn: () => api.profiles.getProfileTLS(activeEditProfile!.id),
	})

	const applyTLSUpdate = async (
		profileId: string,
		values: ProfileFormValues,
		mode: 'create' | 'edit',
		scopeApiToken: string,
	) => {
		if (mode === 'create') {
			if (!values.tlsEnabled) return
			const tlsConfig = buildTLSConfigFromValues(values)
			if (!tlsConfig) throw new Error('mTLS requires client certificate and key')
			await api.profiles.updateProfileTLS(profileId, tlsConfig)
			await queryClient.invalidateQueries({ queryKey: queryKeys.profiles.tls(profileId, scopeApiToken), exact: true })
			return
		}

		const action = values.tlsAction ?? 'keep'
		if (action === 'keep') return
		if (action === 'disable') {
			await api.profiles.deleteProfileTLS(profileId)
			await queryClient.invalidateQueries({ queryKey: queryKeys.profiles.tls(profileId, scopeApiToken), exact: true })
			return
		}
		if (action === 'enable') {
			const tlsConfig = buildTLSConfigFromValues(values)
			if (!tlsConfig) throw new Error('mTLS requires client certificate and key')
			await api.profiles.updateProfileTLS(profileId, tlsConfig)
			await queryClient.invalidateQueries({ queryKey: queryKeys.profiles.tls(profileId, scopeApiToken), exact: true })
		}
	}

	return {
		applyTLSUpdate,
		tlsCapability: tlsCapability ?? null,
		tlsStatus: profileTLSQuery.data ?? null,
		tlsStatusLoading: profileTLSQuery.isFetching,
		tlsStatusError: profileTLSQuery.isError ? formatErr(profileTLSQuery.error) : null,
	}
}
