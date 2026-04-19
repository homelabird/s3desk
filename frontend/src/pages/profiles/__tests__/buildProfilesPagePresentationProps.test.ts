import { describe, expect, it, vi } from 'vitest'

import { buildProfilesPagePresentationProps } from '../buildProfilesPagePresentationProps'

const { confirmDangerActionMock } = vi.hoisted(() => ({
	confirmDangerActionMock: vi.fn(),
}))

vi.mock('../../../lib/confirmDangerAction', () => ({
	confirmDangerAction: (args: unknown) => confirmDangerActionMock(args),
}))

describe('buildProfilesPagePresentationProps', () => {
	it('maps presentation props and wires delete confirmation into the delete mutation', async () => {
		const onOpenImportModal = vi.fn()
		const onOpenCreateModal = vi.fn()
		const onDismissOnboarding = vi.fn()
		const onUseProfile = vi.fn()
		const onEditProfile = vi.fn()
		const onOpenYaml = vi.fn()
		const onCreateProfile = vi.fn()
		const testMutate = vi.fn()
		const benchmarkMutate = vi.fn()
		const deleteMutateAsync = vi.fn().mockResolvedValue(undefined)

		const props = buildProfilesPagePresentationProps({
			apiToken: 'token-a',
			profileId: 'profile-1',
			currentScopeKey: 'token-a::profiles',
			profiles: [{ id: 'profile-1', name: 'Primary', provider: 's3_compatible' } as never],
			profilesError: null,
			profilesNeedingAttention: [],
			profilesQueryIsFetching: false,
			tableRows: [{ id: 'profile-1', name: 'Primary' }] as never,
			onUseProfile,
			onEditProfile,
			onOpenYaml,
			onCreateProfile,
			testMutation: { mutate: testMutate, isPending: true },
			benchmarkMutation: { mutate: benchmarkMutate, isPending: false },
			deleteMutation: { mutateAsync: deleteMutateAsync, isPending: false },
			testingProfileId: 'profile-1',
			benchmarkingProfileId: null,
			exportYamlPending: true,
			activeExportingProfileId: 'profile-1',
			deletingProfileId: null,
			onboardingVisible: true,
			backendConnected: true,
			transferEngine: { available: true, compatible: true, minVersion: '1.68' } as never,
			apiTokenEnabled: true,
			onDismissOnboarding,
			onOpenImportModal,
			onOpenCreateModal,
			hasOpenModal: true,
			dialogs: {
				createOpen: false,
				closeCreateModal: vi.fn(),
				onCreateSubmit: vi.fn(),
				createLoading: false,
				editProfile: { id: 'profile-1', name: 'Primary', provider: 's3_compatible' } as never,
				closeEditModal: vi.fn(),
				onEditSubmit: vi.fn(),
				editLoading: true,
				editInitialValues: { name: 'Primary' },
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
			},
		})

		expect(props.onOpenImportModal).toBe(onOpenImportModal)
		expect(props.onOpenCreateModal).toBe(onOpenCreateModal)
		expect(props.onboarding).toMatchObject({
			visible: true,
			apiToken: 'token-a',
			profilesCount: 1,
			profileId: 'profile-1',
		})
		expect(props.status).toMatchObject({
			currentScopeKey: 'token-a::profiles',
			showProfilesEmpty: false,
			isTestPending: true,
			testingProfileId: 'profile-1',
			isExportYamlPending: true,
			exportingProfileId: 'profile-1',
		})
		expect(props.hasOpenModal).toBe(true)
		expect(props.dialogs.editLoading).toBe(true)

		props.status.onTestProfile('profile-1')
		props.status.onBenchmarkProfile('profile-1')
		props.onboarding.onDismiss()

		expect(testMutate).toHaveBeenCalledWith('profile-1')
		expect(benchmarkMutate).toHaveBeenCalledWith('profile-1')
		expect(onDismissOnboarding).toHaveBeenCalledTimes(1)

		props.status.onDeleteProfile({
			id: 'profile-1',
			name: 'Primary',
			provider: 's3_compatible',
		} as never)

		expect(confirmDangerActionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'Delete profile "Primary"?',
				confirmText: 'Primary',
			}),
		)

		await confirmDangerActionMock.mock.calls[0][0].onConfirm()
		expect(deleteMutateAsync).toHaveBeenCalledWith('profile-1')
	})
})
