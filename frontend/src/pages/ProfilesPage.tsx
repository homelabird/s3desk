import { useQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Space } from 'antd'

import { queryKeys } from '../api/queryKeys'
import type { Profile } from '../api/types'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { PageHeader } from '../components/PageHeader'
import type { ProfileFormValues } from './profiles/profileTypes'
import { buildTLSConfigFromValues } from './profiles/profileMutationUtils'
import { ProfilesDialogs } from './profiles/ProfilesDialogs'
import { ProfilesOnboardingCard } from './profiles/ProfilesOnboardingCard'
import { ProfilesStatusSection } from './profiles/ProfilesStatusSection'
import { useProfilesPageData } from './profiles/useProfilesPageData'
import { useProfilesPageMutations } from './profiles/useProfilesPageMutations'
import { buildProfilesTableRows, toProfileEditInitialValues } from './profiles/profileViewModel'
import { useProfilesYamlImportExport } from './profiles/useProfilesYamlImportExport'
import styles from './ProfilesPage.module.css'

type Props = {
	apiToken: string
	profileId: string | null
	setProfileId: (v: string | null) => void
}

export function ProfilesPage(props: Props) {
	const currentScopeKey = props.apiToken || 'none'
	const [editProfile, setEditProfile] = useState<Profile | null>(null)
	const [editScopeKey, setEditScopeKey] = useState<string | null>(null)
	const [onboardingDismissed, setOnboardingDismissed] = useState(false)
	const [createModalSession, setCreateModalSession] = useState(0)
	const [editModalSession, setEditModalSession] = useState(0)
	const serverScopeVersionRef = useRef(0)
	const isActiveRef = useRef(true)

	useLayoutEffect(() => {
		serverScopeVersionRef.current += 1
	}, [props.apiToken])

	useEffect(() => {
		return () => {
			isActiveRef.current = false
		}
	}, [])

	const activeEditProfile = editScopeKey === currentScopeKey ? editProfile : null
	const {
		api,
		metaQuery,
		profilesQuery,
		queryClient,
		searchParams,
		setSearchParams,
		invalidateProfilesQuery,
	} = useProfilesPageData({
		apiToken: props.apiToken,
	})
	const createRequested = searchParams.has('create')
	const [createOpenScopeKey, setCreateOpenScopeKey] = useState<string | null>(() => (createRequested ? currentScopeKey : null))
	const createOpen = createRequested && createOpenScopeKey === currentScopeKey

	const openEditModal = (profile: Profile | null) => {
		setEditModalSession((prev) => prev + 1)
		setEditScopeKey(currentScopeKey)
		setEditProfile(profile)
	}

	const closeEditModal = () => {
		setEditModalSession((prev) => prev + 1)
		setEditScopeKey(null)
		setEditProfile(null)
	}

	const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data])
	const showProfilesEmpty = !profilesQuery.isFetching && profiles.length === 0
	const openCreateModal = () => {
		setCreateModalSession((prev) => prev + 1)
		setCreateOpenScopeKey(currentScopeKey)
		if (searchParams.has('create')) return
		const next = new URLSearchParams(searchParams)
		next.set('create', '1')
		setSearchParams(next, { replace: true })
	}
	const closeCreateModal = () => {
		setCreateOpenScopeKey(null)
		if (!searchParams.has('create')) return
		setCreateModalSession((prev) => prev + 1)
		const next = new URLSearchParams(searchParams)
		next.delete('create')
		setSearchParams(next, { replace: true })
	}
	const tlsCapability = metaQuery.data?.capabilities?.profileTls
	const tlsCapabilityEnabled = tlsCapability?.enabled ?? true
	const profileTLSQuery = useQuery({
		queryKey: queryKeys.profiles.tls(activeEditProfile?.id, props.apiToken),
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
	const {
		createMutation,
		updateMutation,
		deleteMutation,
		testMutation,
		benchmarkMutation,
		createLoading,
		editLoading,
		testingProfileId,
		benchmarkingProfileId,
		deletingProfileId,
	} = useProfilesPageMutations({
		api,
		apiToken: props.apiToken,
		currentScopeKey,
		profileId: props.profileId,
		setProfileId: props.setProfileId,
		createModalSession,
		editModalSession,
		closeCreateModal,
		closeEditModal,
		invalidateProfilesQuery,
		applyTLSUpdate,
		isActiveRef,
		serverScopeVersionRef,
	})
	const {
		activeYamlOpen,
		activeYamlProfile,
		activeYamlContent,
		activeYamlDraft,
		activeYamlError,
		activeExportingProfileId,
		activeImportOpen,
		activeImportText,
		activeImportError,
		activeImportLoading,
		yamlFilename,
		exportYamlPending,
		saveYamlPending,
		importSessionToken,
		openYamlModal,
		closeYamlModal,
		setYamlDraft,
		handleYamlCopy,
		handleYamlDownload,
		saveYaml,
		openImportModal,
		closeImportModal,
		submitImport,
		setImportText,
		handleImportFileTextLoad,
		clearImportError,
	} = useProfilesYamlImportExport({
		api,
		apiToken: props.apiToken,
		currentScopeKey,
		queryClient,
		isActiveRef,
		serverScopeVersionRef,
	})

	const apiTokenEnabled = metaQuery.data?.apiTokenEnabled ?? false
	const transferEngine = metaQuery.data?.transferEngine
	const onboardingVisible = !onboardingDismissed && (profiles.length === 0 || !props.profileId)
	const hasOpenModal = createOpen || !!activeEditProfile || activeYamlOpen || activeImportOpen
	const editInitialValues: Partial<ProfileFormValues> | undefined = useMemo(
		() => toProfileEditInitialValues(activeEditProfile),
		[activeEditProfile],
	)
	const tableRows = useMemo(() => buildProfilesTableRows(profiles, props.profileId), [profiles, props.profileId])
	const profilesNeedingAttention = useMemo(
		() => profiles.filter((profile) => profile.validation?.valid === false && (profile.validation.issues?.length ?? 0) > 0),
		[profiles],
	)
	const handleDeleteProfile = (profile: Profile) => {
		confirmDangerAction({
			title: `Delete profile "${profile.name}"?`,
			description: 'This removes the profile and any TLS settings associated with it.',
			confirmText: profile.name,
			confirmHint: `Type "${profile.name}" to confirm`,
			onConfirm: async () => {
				await deleteMutation.mutateAsync(profile.id)
			},
		})
	}

	return (
		<Space orientation="vertical" size="large" className={styles.fullWidth}>
			<PageHeader
				eyebrow="Workspace"
				title="Profiles"
				subtitle="Create connection profiles, verify endpoints, and choose the active workspace used across buckets, objects, uploads, and jobs."
				actions={
					<Space wrap>
						<Button onClick={openImportModal}>Import YAML</Button>
						<Button type="primary" onClick={openCreateModal}>
							New Profile
						</Button>
					</Space>
				}
			/>
			<ProfilesOnboardingCard
				visible={onboardingVisible}
				backendConnected={metaQuery.isSuccess}
				transferEngine={transferEngine}
				apiTokenEnabled={apiTokenEnabled}
				apiToken={props.apiToken}
				profilesCount={profiles.length}
				profileId={props.profileId}
				onCreateProfile={openCreateModal}
				onDismiss={() => setOnboardingDismissed(true)}
			/>

			<ProfilesStatusSection
				currentScopeKey={currentScopeKey}
				profiles={profiles}
				profilesError={profilesQuery.isError ? profilesQuery.error : null}
				profilesNeedingAttention={profilesNeedingAttention}
				profilesQueryIsFetching={profilesQuery.isFetching}
				showProfilesEmpty={showProfilesEmpty}
				tableRows={tableRows}
				onUseProfile={props.setProfileId}
				onEditProfile={openEditModal}
				onTestProfile={(id) => testMutation.mutate(id)}
				onBenchmarkProfile={(id) => benchmarkMutation.mutate(id)}
				onOpenYaml={openYamlModal}
				onDeleteProfile={handleDeleteProfile}
				isTestPending={testMutation.isPending}
				testingProfileId={testingProfileId}
				isBenchmarkPending={benchmarkMutation.isPending}
				benchmarkingProfileId={benchmarkingProfileId}
				isExportYamlPending={exportYamlPending}
				exportingProfileId={activeExportingProfileId}
				isDeletePending={deleteMutation.isPending}
				deletingProfileId={deletingProfileId}
				onCreateProfile={openCreateModal}
			/>

			{hasOpenModal ? (
				<ProfilesDialogs
					createOpen={createOpen}
					closeCreateModal={closeCreateModal}
					onCreateSubmit={(values) => createMutation.mutate(values)}
					createLoading={createLoading}
					editProfile={activeEditProfile}
					closeEditModal={closeEditModal}
					onEditSubmit={(id, values) => {
						updateMutation.mutate({ id, values })
					}}
					editLoading={editLoading}
					editInitialValues={editInitialValues}
					tlsCapability={tlsCapability ?? null}
					tlsStatus={profileTLSQuery.data ?? null}
					tlsStatusLoading={profileTLSQuery.isFetching}
					tlsStatusError={profileTLSQuery.isError ? formatErr(profileTLSQuery.error) : null}
					yamlOpen={activeYamlOpen}
					closeYamlModal={closeYamlModal}
					yamlProfile={activeYamlProfile}
					yamlError={activeYamlError}
					yamlContent={activeYamlContent}
					yamlDraft={activeYamlDraft}
					yamlFilename={yamlFilename}
					exportYamlLoading={activeYamlOpen && exportYamlPending}
					saveYamlLoading={activeYamlOpen && saveYamlPending}
					onYamlCopy={() => void handleYamlCopy()}
					onYamlDownload={handleYamlDownload}
					onYamlDraftChange={setYamlDraft}
					onYamlSave={saveYaml}
					importOpen={activeImportOpen}
					closeImportModal={closeImportModal}
					importSessionToken={importSessionToken}
					importText={activeImportText}
					importError={activeImportError}
					importLoading={activeImportLoading}
					onImportSubmit={submitImport}
					onImportFileTextLoad={handleImportFileTextLoad}
					onImportTextChange={setImportText}
					onImportErrorClear={clearImportError}
				/>
			) : null}
		</Space>
	)
}
