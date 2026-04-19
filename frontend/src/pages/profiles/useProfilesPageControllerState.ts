import { useMemo, useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

import type { Profile } from '../../api/types'
import { toProfileEditInitialValues, buildProfilesTableRows } from './profileViewModel'
import { useProfilesPageScopeState } from './useProfilesPageScopeState'

type UseProfilesPageControllerStateArgs = {
	apiToken: string
	profileId: string | null
	profiles: Profile[]
	searchParams: URLSearchParams
	setSearchParams: SetURLSearchParams
}

export function useProfilesPageControllerState({
	apiToken,
	profileId,
	profiles,
	searchParams,
	setSearchParams,
}: UseProfilesPageControllerStateArgs) {
	const [editProfile, setEditProfile] = useState<Profile | null>(null)
	const [editScopeKey, setEditScopeKey] = useState<string | null>(null)
	const [onboardingDismissed, setOnboardingDismissed] = useState(false)
	const {
		currentScopeKey,
		createModalSession,
		editModalSession,
		serverScopeVersionRef,
		isActiveRef,
		advanceCreateModalSession,
		advanceEditModalSession,
	} = useProfilesPageScopeState(apiToken)

	const createRequested = searchParams.has('create')
	const [createOpenScopeKey, setCreateOpenScopeKey] = useState<string | null>(() =>
		createRequested ? currentScopeKey : null,
	)
	const createOpen = createRequested && createOpenScopeKey === currentScopeKey
	const activeEditProfile = editScopeKey === currentScopeKey ? editProfile : null

	const openEditModal = (profile: Profile | null) => {
		advanceEditModalSession()
		setEditScopeKey(currentScopeKey)
		setEditProfile(profile)
	}

	const closeEditModal = () => {
		advanceEditModalSession()
		setEditScopeKey(null)
		setEditProfile(null)
	}

	const openCreateModal = () => {
		advanceCreateModalSession()
		setCreateOpenScopeKey(currentScopeKey)
		if (searchParams.has('create')) return
		const next = new URLSearchParams(searchParams)
		next.set('create', '1')
		setSearchParams(next, { replace: true })
	}

	const closeCreateModal = () => {
		setCreateOpenScopeKey(null)
		if (!searchParams.has('create')) return
		advanceCreateModalSession()
		const next = new URLSearchParams(searchParams)
		next.delete('create')
		setSearchParams(next, { replace: true })
	}

	const onboardingVisible = !onboardingDismissed && (profiles.length === 0 || !profileId)
	const editInitialValues = useMemo(
		() => toProfileEditInitialValues(activeEditProfile),
		[activeEditProfile],
	)
	const tableRows = useMemo(() => buildProfilesTableRows(profiles, profileId), [profiles, profileId])
	const profilesNeedingAttention = useMemo(
		() => profiles.filter((profile) => profile.validation?.valid === false && (profile.validation.issues?.length ?? 0) > 0),
		[profiles],
	)

	return {
		currentScopeKey,
		createModalSession,
		editModalSession,
		serverScopeVersionRef,
		isActiveRef,
		createOpen,
		activeEditProfile,
		onboardingVisible,
		editInitialValues,
		tableRows,
		profilesNeedingAttention,
		openCreateModal,
		closeCreateModal,
		openEditModal,
		closeEditModal,
		dismissOnboarding: () => setOnboardingDismissed(true),
	}
}
