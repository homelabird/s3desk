import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { queryKeys } from '../../api/queryKeys'
import type { APIClientShape } from '../../api/client'
import type { Profile } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { ProfileFormValues, TLSCapability } from './profileTypes'
import { buildTLSConfigFromValues } from './profileMutationUtils'

type UseProfilesPageTLSStateArgs = {
	api: APIClientShape
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
	const { refetch: refetchTLSStatus } = profileTLSQuery
	const profileId = activeEditProfile?.id ?? null
	const queryError = profileTLSQuery.isError ? formatErr(profileTLSQuery.error) : null
	const [retryError, setRetryError] = useState<{ apiToken: string; profileId: string; error: string | null } | null>(null)
	const queryContextRef = useRef({ apiToken, profileId, enabled: tlsCapabilityEnabled, fetching: profileTLSQuery.isFetching })
	const tlsStatusError = queryError ?? (
		profileTLSQuery.isFetching && retryError?.apiToken === apiToken && retryError.profileId === profileId
			? retryError.error
			: null
	)
	useLayoutEffect(() => {
		queryContextRef.current = { apiToken, profileId, enabled: tlsCapabilityEnabled, fetching: profileTLSQuery.isFetching }
	}, [apiToken, profileId, tlsCapabilityEnabled, profileTLSQuery.isFetching])
	const retryTLSStatus = useCallback(() => {
		const context = queryContextRef.current
		if (!profileId || !tlsCapabilityEnabled || !context.enabled || context.fetching || context.apiToken !== apiToken || context.profileId !== profileId) return
		context.fetching = true
		const pendingError = { apiToken, profileId, error: queryError }
		setRetryError(pendingError)
		void refetchTLSStatus({ cancelRefetch: false }).then(() => {
			setRetryError((current) => current === pendingError ? null : current)
		})
	}, [apiToken, profileId, tlsCapabilityEnabled, queryError, refetchTLSStatus])

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
		retryTLSStatus,
		tlsCapability: tlsCapability ?? null,
		tlsStatus: profileTLSQuery.data ?? null,
		tlsStatusLoading: profileTLSQuery.isFetching,
		tlsStatusError,
	}
}
