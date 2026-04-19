import type { ProfilesPageShellProps } from './ProfilesPageShell'
import { buildProfilesPageDialogsProps } from './buildProfilesPageDialogsProps'
import { buildProfilesPagePresentationProps } from './buildProfilesPagePresentationProps'
import { useProfilesPageControllerState } from './useProfilesPageControllerState'
import { useProfilesPageData } from './useProfilesPageData'
import { useProfilesPageMutations } from './useProfilesPageMutations'
import { useProfilesPageTLSState } from './useProfilesPageTLSState'
import { useProfilesYamlImportExport } from './useProfilesYamlImportExport'

type UseProfilesPageStateArgs = {
	apiToken: string
	profileId: string | null
	setProfileId: (value: string | null) => void
}

export function useProfilesPageState(args: UseProfilesPageStateArgs): ProfilesPageShellProps {
	const { apiToken, profileId, setProfileId } = args
	const {
		api,
		metaQuery,
		profilesQuery,
		queryClient,
		searchParams,
		setSearchParams,
		invalidateProfilesQuery,
	} = useProfilesPageData({
		apiToken,
	})
	const profiles = profilesQuery.data ?? []
	const {
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
		dismissOnboarding,
	} = useProfilesPageControllerState({
		apiToken,
		profileId,
		profiles,
		searchParams,
		setSearchParams,
	})
	const tlsState = useProfilesPageTLSState({
		api,
		apiToken,
		queryClient,
		activeEditProfile,
		tlsCapability: metaQuery.data?.capabilities?.profileTls,
	})

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
		apiToken,
		currentScopeKey,
		profileId,
		setProfileId,
		createModalSession,
		editModalSession,
		closeCreateModal,
		closeEditModal,
		invalidateProfilesQuery,
		applyTLSUpdate: tlsState.applyTLSUpdate,
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
		apiToken,
		currentScopeKey,
		queryClient,
		isActiveRef,
		serverScopeVersionRef,
	})
	const { hasOpenModal, dialogs } = buildProfilesPageDialogsProps({
		createOpen,
		closeCreateModal,
		onCreateSubmit: (values) => createMutation.mutate(values),
		createLoading,
		editProfile: activeEditProfile,
		closeEditModal,
		onEditSubmit: (id, values) => {
			updateMutation.mutate({ id, values })
		},
		editLoading,
		editInitialValues,
		tlsCapability: tlsState.tlsCapability,
		tlsStatus: tlsState.tlsStatus,
		tlsStatusLoading: tlsState.tlsStatusLoading,
		tlsStatusError: tlsState.tlsStatusError,
		yamlOpen: activeYamlOpen,
		closeYamlModal,
		yamlProfile: activeYamlProfile,
		yamlError: activeYamlError,
		yamlContent: activeYamlContent,
		yamlDraft: activeYamlDraft,
		yamlFilename,
		exportYamlLoading: activeYamlOpen && exportYamlPending,
		saveYamlLoading: activeYamlOpen && saveYamlPending,
		onYamlCopy: () => void handleYamlCopy(),
		onYamlDownload: handleYamlDownload,
		onYamlDraftChange: setYamlDraft,
		onYamlSave: saveYaml,
		importOpen: activeImportOpen,
		closeImportModal,
		importSessionToken,
		importText: activeImportText,
		importError: activeImportError,
		importLoading: activeImportLoading,
		onImportSubmit: submitImport,
		onImportFileTextLoad: handleImportFileTextLoad,
		onImportTextChange: setImportText,
		onImportErrorClear: clearImportError,
	})

	return buildProfilesPagePresentationProps({
		apiToken,
		profileId,
		currentScopeKey,
		profiles,
		profilesError: profilesQuery.isError ? profilesQuery.error : null,
		profilesNeedingAttention,
		profilesQueryIsFetching: profilesQuery.isFetching,
		tableRows,
		onUseProfile: setProfileId,
		onEditProfile: openEditModal,
		onOpenYaml: openYamlModal,
		onCreateProfile: openCreateModal,
		testMutation,
		benchmarkMutation,
		deleteMutation,
		testingProfileId,
		benchmarkingProfileId,
		exportYamlPending,
		activeExportingProfileId,
		deletingProfileId,
		onboardingVisible,
		backendConnected: metaQuery.isSuccess,
		transferEngine: metaQuery.data?.transferEngine,
		apiTokenEnabled: metaQuery.data?.apiTokenEnabled ?? false,
		onDismissOnboarding: dismissOnboarding,
		onOpenImportModal: openImportModal,
		onOpenCreateModal: openCreateModal,
		dialogs,
		hasOpenModal,
	})
}
