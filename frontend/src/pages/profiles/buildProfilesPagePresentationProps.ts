import type { Profile } from '../../api/types'
import { confirmDangerAction } from '../../lib/confirmDangerAction'
import type { ProfilesPageShellProps } from './ProfilesPageShell'

type ProfilesOnboardingProps = ProfilesPageShellProps['onboarding']
type ProfilesStatusProps = ProfilesPageShellProps['status']
type ProfilesDialogsProps = ProfilesPageShellProps['dialogs']

type BuildProfilesPagePresentationPropsArgs = {
	apiToken: string
	profileId: string | null
	currentScopeKey: ProfilesStatusProps['currentScopeKey']
	profiles: ProfilesStatusProps['profiles']
	profilesError: ProfilesStatusProps['profilesError']
	profilesNeedingAttention: ProfilesStatusProps['profilesNeedingAttention']
	profilesQueryIsFetching: ProfilesStatusProps['profilesQueryIsFetching']
	tableRows: ProfilesStatusProps['tableRows']
	onUseProfile: ProfilesStatusProps['onUseProfile']
	onEditProfile: ProfilesStatusProps['onEditProfile']
	onOpenYaml: ProfilesStatusProps['onOpenYaml']
	onCreateProfile: ProfilesStatusProps['onCreateProfile']
	testMutation: { mutate: ProfilesStatusProps['onTestProfile']; isPending: boolean }
	benchmarkMutation: { mutate: ProfilesStatusProps['onBenchmarkProfile']; isPending: boolean }
	deleteMutation: { mutateAsync: (id: string) => Promise<unknown>; isPending: boolean }
	testingProfileId: ProfilesStatusProps['testingProfileId']
	benchmarkingProfileId: ProfilesStatusProps['benchmarkingProfileId']
	exportYamlPending: ProfilesStatusProps['isExportYamlPending']
	activeExportingProfileId: ProfilesStatusProps['exportingProfileId']
	deletingProfileId: ProfilesStatusProps['deletingProfileId']
	onboardingVisible: ProfilesOnboardingProps['visible']
	backendConnected: ProfilesOnboardingProps['backendConnected']
	transferEngine: ProfilesOnboardingProps['transferEngine']
	apiTokenEnabled: ProfilesOnboardingProps['apiTokenEnabled']
	onDismissOnboarding: ProfilesOnboardingProps['onDismiss']
	onOpenImportModal: () => void
	onOpenCreateModal: () => void
	hasOpenModal: boolean
	dialogs: ProfilesDialogsProps
}

export function buildProfilesPagePresentationProps(
	args: BuildProfilesPagePresentationPropsArgs,
): ProfilesPageShellProps {
	const showProfilesEmpty = !args.profilesQueryIsFetching && args.profiles.length === 0

	const handleDeleteProfile = (profile: Profile) => {
		confirmDangerAction({
			title: `Delete profile "${profile.name}"?`,
			description: 'This removes the profile and any TLS settings associated with it.',
			confirmText: profile.name,
			confirmHint: `Type "${profile.name}" to confirm`,
			onConfirm: async () => {
				await args.deleteMutation.mutateAsync(profile.id)
			},
		})
	}

	return {
		onOpenImportModal: args.onOpenImportModal,
		onOpenCreateModal: args.onOpenCreateModal,
		onboarding: {
			visible: args.onboardingVisible,
			backendConnected: args.backendConnected,
			transferEngine: args.transferEngine,
			apiTokenEnabled: args.apiTokenEnabled,
			apiToken: args.apiToken,
			profilesCount: args.profiles.length,
			profileId: args.profileId,
			onCreateProfile: args.onCreateProfile,
			onDismiss: args.onDismissOnboarding,
		},
		status: {
			currentScopeKey: args.currentScopeKey,
			profiles: args.profiles,
			profilesError: args.profilesError,
			profilesNeedingAttention: args.profilesNeedingAttention,
			profilesQueryIsFetching: args.profilesQueryIsFetching,
			showProfilesEmpty,
			tableRows: args.tableRows,
			onUseProfile: args.onUseProfile,
			onEditProfile: args.onEditProfile,
			onTestProfile: (id) => args.testMutation.mutate(id),
			onBenchmarkProfile: (id) => args.benchmarkMutation.mutate(id),
			onOpenYaml: args.onOpenYaml,
			onDeleteProfile: handleDeleteProfile,
			isTestPending: args.testMutation.isPending,
			testingProfileId: args.testingProfileId,
			isBenchmarkPending: args.benchmarkMutation.isPending,
			benchmarkingProfileId: args.benchmarkingProfileId,
			isExportYamlPending: args.exportYamlPending,
			exportingProfileId: args.activeExportingProfileId,
			isDeletePending: args.deleteMutation.isPending,
			deletingProfileId: args.deletingProfileId,
			onCreateProfile: args.onCreateProfile,
		},
		hasOpenModal: args.hasOpenModal,
		dialogs: args.dialogs,
	}
}
