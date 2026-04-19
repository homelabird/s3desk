import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProfilesPageShell } from '../ProfilesPageShell'

const onboardingMock = vi.fn()
const statusMock = vi.fn()
const dialogsMock = vi.fn()

vi.mock('../ProfilesOnboardingCard', () => ({
	ProfilesOnboardingCard: (props: unknown) => {
		onboardingMock(props)
		return <div data-testid="profiles-onboarding" />
	},
}))

vi.mock('../ProfilesStatusSection', () => ({
	ProfilesStatusSection: (props: unknown) => {
		statusMock(props)
		return <div data-testid="profiles-status" />
	},
}))

vi.mock('../ProfilesDialogs', () => ({
	ProfilesDialogs: (props: unknown) => {
		dialogsMock(props)
		return <div data-testid="profiles-dialogs" />
	},
}))

describe('ProfilesPageShell', () => {
	it('renders onboarding and status sections and wires header actions', () => {
		const openImportModal = vi.fn()
		const openCreateModal = vi.fn()

		render(
			<ProfilesPageShell
				onOpenImportModal={openImportModal}
				onOpenCreateModal={openCreateModal}
				onboarding={{
					visible: true,
					backendConnected: true,
					transferEngine: null,
					apiTokenEnabled: true,
					apiToken: 'token',
					profilesCount: 0,
					profileId: null,
					onCreateProfile: vi.fn(),
					onDismiss: vi.fn(),
				}}
				status={{
					currentScopeKey: 'token',
					profiles: [],
					profilesError: null,
					profilesNeedingAttention: [],
					profilesQueryIsFetching: false,
					showProfilesEmpty: true,
					tableRows: [],
					onUseProfile: vi.fn(),
					onEditProfile: vi.fn(),
					onTestProfile: vi.fn(),
					onBenchmarkProfile: vi.fn(),
					onOpenYaml: vi.fn(),
					onDeleteProfile: vi.fn(),
					isTestPending: false,
					testingProfileId: null,
					isBenchmarkPending: false,
					benchmarkingProfileId: null,
					isExportYamlPending: false,
					exportingProfileId: null,
					isDeletePending: false,
					deletingProfileId: null,
					onCreateProfile: vi.fn(),
				}}
				hasOpenModal={false}
				dialogs={{
					createOpen: false,
					closeCreateModal: vi.fn(),
					onCreateSubmit: vi.fn(),
					createLoading: false,
					editProfile: null,
					closeEditModal: vi.fn(),
					onEditSubmit: vi.fn(),
					editLoading: false,
					editInitialValues: undefined,
					tlsCapability: null,
					tlsStatus: null,
					tlsStatusLoading: false,
					tlsStatusError: null,
					yamlOpen: false,
					closeYamlModal: vi.fn(),
					yamlProfile: null,
					yamlError: null,
					yamlContent: '',
					yamlDraft: '',
					yamlFilename: 'profiles.yaml',
					exportYamlLoading: false,
					saveYamlLoading: false,
					onYamlCopy: vi.fn(),
					onYamlDownload: vi.fn(),
					onYamlDraftChange: vi.fn(),
					onYamlSave: vi.fn(),
					importOpen: false,
					closeImportModal: vi.fn(),
					importSessionToken: 0,
					importText: '',
					importError: null,
					importLoading: false,
					onImportSubmit: vi.fn(),
					onImportFileTextLoad: vi.fn(),
					onImportTextChange: vi.fn(),
					onImportErrorClear: vi.fn(),
				}}
			/>,
		)

		expect(screen.getByTestId('profiles-onboarding')).toBeInTheDocument()
		expect(screen.getByTestId('profiles-status')).toBeInTheDocument()
		expect(screen.queryByTestId('profiles-dialogs')).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Import YAML' }))
		fireEvent.click(screen.getByRole('button', { name: 'New Profile' }))

		expect(openImportModal).toHaveBeenCalledTimes(1)
		expect(openCreateModal).toHaveBeenCalledTimes(1)
		expect(onboardingMock).toHaveBeenCalledWith(expect.objectContaining({ visible: true, apiToken: 'token' }))
		expect(statusMock).toHaveBeenCalledWith(expect.objectContaining({ currentScopeKey: 'token', showProfilesEmpty: true }))
		expect(dialogsMock).not.toHaveBeenCalled()
	})

	it('renders dialogs when a modal is open', () => {
		render(
			<ProfilesPageShell
				onOpenImportModal={vi.fn()}
				onOpenCreateModal={vi.fn()}
				onboarding={{
					visible: false,
					backendConnected: true,
					transferEngine: null,
					apiTokenEnabled: true,
					apiToken: 'token',
					profilesCount: 1,
					profileId: 'profile-1',
					onCreateProfile: vi.fn(),
					onDismiss: vi.fn(),
				}}
				status={{
					currentScopeKey: 'token',
					profiles: [],
					profilesError: null,
					profilesNeedingAttention: [],
					profilesQueryIsFetching: false,
					showProfilesEmpty: false,
					tableRows: [],
					onUseProfile: vi.fn(),
					onEditProfile: vi.fn(),
					onTestProfile: vi.fn(),
					onBenchmarkProfile: vi.fn(),
					onOpenYaml: vi.fn(),
					onDeleteProfile: vi.fn(),
					isTestPending: false,
					testingProfileId: null,
					isBenchmarkPending: false,
					benchmarkingProfileId: null,
					isExportYamlPending: false,
					exportingProfileId: null,
					isDeletePending: false,
					deletingProfileId: null,
					onCreateProfile: vi.fn(),
				}}
				hasOpenModal
				dialogs={{
					createOpen: true,
					closeCreateModal: vi.fn(),
					onCreateSubmit: vi.fn(),
					createLoading: true,
					editProfile: null,
					closeEditModal: vi.fn(),
					onEditSubmit: vi.fn(),
					editLoading: false,
					editInitialValues: undefined,
					tlsCapability: null,
					tlsStatus: null,
					tlsStatusLoading: false,
					tlsStatusError: null,
					yamlOpen: false,
					closeYamlModal: vi.fn(),
					yamlProfile: null,
					yamlError: null,
					yamlContent: '',
					yamlDraft: '',
					yamlFilename: 'profiles.yaml',
					exportYamlLoading: false,
					saveYamlLoading: false,
					onYamlCopy: vi.fn(),
					onYamlDownload: vi.fn(),
					onYamlDraftChange: vi.fn(),
					onYamlSave: vi.fn(),
					importOpen: false,
					closeImportModal: vi.fn(),
					importSessionToken: 0,
					importText: '',
					importError: null,
					importLoading: false,
					onImportSubmit: vi.fn(),
					onImportFileTextLoad: vi.fn(),
					onImportTextChange: vi.fn(),
					onImportErrorClear: vi.fn(),
				}}
			/>,
		)

		expect(screen.getByTestId('profiles-dialogs')).toBeInTheDocument()
		expect(dialogsMock).toHaveBeenCalledWith(expect.objectContaining({ createOpen: true, createLoading: true }))
	})
})
