import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'

import type { APIClient } from './api/client'
import { queryKeys } from './api/queryKeys'
import { renderProfileGate } from './app/ProfileGate'
import { clearPersistedTransfersStorage } from './components/transfers/useTransfersPersistence'
import { getProviderCapabilities } from './lib/providerCapabilities'
import {
	readLegacyActiveProfileIdForMigration,
	serverScopedStorageKey,
	shouldUseLegacyActiveProfileStorageMigration,
} from './lib/profileScopedStorage'
import { useLocalStorageState } from './lib/useLocalStorageState'

type UseFullAppProfileStateArgs = {
	api: APIClient
	apiToken: string
	pathname: string
}

function readStoredProfileId(storageKey: string): string | null {
	if (typeof window === 'undefined') return null
	try {
		const raw = window.localStorage.getItem(storageKey)
		if (raw === null) return null
		const parsed = JSON.parse(raw)
		return typeof parsed === 'string' && parsed.trim() ? parsed : null
	} catch {
		return null
	}
}

export function useFullAppProfileState({
	api,
	apiToken,
	pathname,
}: UseFullAppProfileStateArgs) {
	const profileStorageKey = useMemo(
		() => serverScopedStorageKey('app', apiToken, 'profileId'),
		[apiToken],
	)
	const legacyActiveProfileStorageKey = useMemo(
		() =>
			shouldUseLegacyActiveProfileStorageMigration(apiToken)
				? 'profileId'
				: undefined,
		[apiToken],
	)
	const initialStoredProfileId = useMemo(
		() =>
			readStoredProfileId(profileStorageKey) ??
			readLegacyActiveProfileIdForMigration(apiToken),
		[apiToken, profileStorageKey],
	)
	const [profileId, setProfileId] = useLocalStorageState<string | null>(
		profileStorageKey,
		initialStoredProfileId,
		{
			legacyLocalStorageKey: legacyActiveProfileStorageKey,
		},
	)
	const previousApiTokenRef = useRef<string | null | undefined>(undefined)

	const metaQuery = useQuery({
		queryKey: queryKeys.server.meta(apiToken),
		queryFn: () => api.server.getMeta(),
		retry: false,
	})
	const profilesQuery = useQuery({
		queryKey: queryKeys.profiles.list(apiToken),
		queryFn: () => api.profiles.listProfiles(),
	})

	useEffect(() => {
		if (previousApiTokenRef.current === undefined) {
			previousApiTokenRef.current = apiToken
			return
		}
		if (previousApiTokenRef.current === apiToken) return
		previousApiTokenRef.current = apiToken
		clearPersistedTransfersStorage()
	}, [apiToken])

	useEffect(() => {
		if (profilesQuery.isPending) return
		const profiles = profilesQuery.data ?? []
		if (!profiles.length) {
			if (profileId !== null) setProfileId(null)
			return
		}
		const activeProfile = profiles.find((profile) => profile.id === profileId)
		if (activeProfile) return
		const storedProfileId = initialStoredProfileId
		if (
			storedProfileId &&
			profiles.some((profile) => profile.id === storedProfileId)
		) {
			setProfileId(storedProfileId)
			return
		}
		setProfileId(profiles[0]?.id ?? null)
	}, [
		initialStoredProfileId,
		profileId,
		profilesQuery.data,
		profilesQuery.isPending,
		setProfileId,
	])

	const safeProfileId = useMemo(() => {
		const candidateProfileId = profileId?.trim()
			? profileId
			: initialStoredProfileId?.trim()
				? initialStoredProfileId
				: null
		if (profilesQuery.isPending) {
			return candidateProfileId
		}
		const profiles = profilesQuery.data ?? []
		if (profiles.length === 0) return null
		if (!profileId) {
			const storedProfileId = initialStoredProfileId
			if (
				storedProfileId &&
				profiles.some((profile) => profile.id === storedProfileId)
			) {
				return storedProfileId
			}
			return profiles[0]?.id ?? null
		}
		const activeProfile = profiles.some((profile) => profile.id === profileId)
		if (activeProfile) return profileId
		const storedProfileId = initialStoredProfileId
		if (
			storedProfileId &&
			profiles.some((profile) => profile.id === storedProfileId)
		) {
			return storedProfileId
		}
		return profiles[0]?.id ?? null
	}, [
		initialStoredProfileId,
		profileId,
		profilesQuery.data,
		profilesQuery.isPending,
	])

	const profileGate = renderProfileGate({
		pathname,
		profileId: safeProfileId,
	})

	const uploadCapabilityByProfileId = useMemo(() => {
		const out: Record<
			string,
			{ presignedUpload: boolean; directUpload: boolean }
		> = {}
		const providerMatrix = metaQuery.data?.capabilities?.providers
		for (const profile of profilesQuery.data ?? []) {
			if (!profile.provider) continue
			const capability = getProviderCapabilities(
				profile.provider,
				providerMatrix,
				profile,
			)
			out[profile.id] = {
				presignedUpload: capability.presignedUpload,
				directUpload: capability.directUpload,
			}
		}
		return out
	}, [metaQuery.data?.capabilities?.providers, profilesQuery.data])

	return {
		metaQuery,
		profilesQuery,
		safeProfileId,
		setProfileId,
		profileGate,
		uploadCapabilityByProfileId,
		uploadDirectStream: metaQuery.data?.uploadDirectStream ?? false,
		shellScopeKey: `${apiToken || '__no_server__'}:${safeProfileId?.trim() || '__no_profile__'}`,
	}
}
