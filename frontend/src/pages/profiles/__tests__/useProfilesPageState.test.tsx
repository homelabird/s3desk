import { QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useProfilesPageState } from '../useProfilesPageState'

const { confirmDangerActionMock } = vi.hoisted(() => ({
	confirmDangerActionMock: vi.fn(),
}))

vi.mock('../../../lib/confirmDangerAction', () => ({
	confirmDangerAction: (args: unknown) => confirmDangerActionMock(args),
}))

const useProfilesPageDataMock = vi.fn()
const useProfilesPageControllerStateMock = vi.fn()
const useProfilesPageMutationsMock = vi.fn()
const useProfilesYamlImportExportMock = vi.fn()
const useProfilesPageTLSStateMock = vi.fn()

vi.mock('../useProfilesPageData', () => ({
	useProfilesPageData: (...args: unknown[]) => useProfilesPageDataMock(...args),
}))

vi.mock('../useProfilesPageControllerState', () => ({
	useProfilesPageControllerState: (...args: unknown[]) => useProfilesPageControllerStateMock(...args),
}))

vi.mock('../useProfilesPageMutations', () => ({
	useProfilesPageMutations: (...args: unknown[]) => useProfilesPageMutationsMock(...args),
}))

vi.mock('../useProfilesYamlImportExport', () => ({
	useProfilesYamlImportExport: (...args: unknown[]) => useProfilesYamlImportExportMock(...args),
}))

vi.mock('../useProfilesPageTLSState', () => ({
	useProfilesPageTLSState: (...args: unknown[]) => useProfilesPageTLSStateMock(...args),
}))

describe('useProfilesPageState', () => {
	it('builds shell props and wires delete confirmation through the delete mutation', async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined)
		const setProfileId = vi.fn()

		useProfilesPageDataMock.mockReturnValue({
			api: {
				profiles: {
					getProfileTLS: vi.fn(),
					updateProfileTLS: vi.fn(),
					deleteProfileTLS: vi.fn(),
				},
			},
			metaQuery: {
				isSuccess: true,
				data: {
					apiTokenEnabled: true,
					transferEngine: { available: true, compatible: true, minVersion: '1.68' },
					capabilities: {
						profileTls: { enabled: true },
					},
				},
			},
			profilesQuery: {
				data: [{ id: 'profile-1', name: 'Primary', provider: 's3_compatible' }],
				isFetching: false,
				isError: false,
				error: null,
			},
			queryClient: new QueryClient(),
			searchParams: new URLSearchParams(),
			setSearchParams: vi.fn(),
			invalidateProfilesQuery: vi.fn().mockResolvedValue(undefined),
		})
		useProfilesPageControllerStateMock.mockReturnValue({
			currentScopeKey: 'token-a::profiles',
			createModalSession: 1,
			editModalSession: 2,
			serverScopeVersionRef: { current: 1 },
			isActiveRef: { current: true },
			createOpen: false,
			activeEditProfile: { id: 'profile-2', name: 'Edited Profile', provider: 's3_compatible' },
			onboardingVisible: true,
			editInitialValues: { name: 'Edited Profile' },
			tableRows: [{ id: 'profile-1', name: 'Primary' }],
			profilesNeedingAttention: [],
			openCreateModal: vi.fn(),
			closeCreateModal: vi.fn(),
			openEditModal: vi.fn(),
			closeEditModal: vi.fn(),
			dismissOnboarding: vi.fn(),
		})
		useProfilesPageMutationsMock.mockReturnValue({
			createMutation: { mutate: vi.fn(), isPending: false },
			updateMutation: { mutate: vi.fn() },
			deleteMutation: { mutateAsync, isPending: false },
			testMutation: { mutate: vi.fn(), isPending: true },
			benchmarkMutation: { mutate: vi.fn(), isPending: false },
			createLoading: false,
			editLoading: true,
			testingProfileId: 'profile-1',
			benchmarkingProfileId: null,
			deletingProfileId: null,
		})
		useProfilesYamlImportExportMock.mockReturnValue({
			activeYamlOpen: true,
			activeYamlProfile: { id: 'profile-2', name: 'Edited Profile', provider: 's3_compatible' },
			activeYamlContent: 'name: edited\n',
			activeYamlDraft: 'name: edited\n',
			activeYamlError: null,
			activeExportingProfileId: 'profile-2',
			activeImportOpen: false,
			activeImportText: '',
			activeImportError: null,
			activeImportLoading: false,
			yamlFilename: 'edited.yaml',
			exportYamlPending: true,
			saveYamlPending: false,
			importSessionToken: 3,
			openYamlModal: vi.fn(),
			closeYamlModal: vi.fn(),
			setYamlDraft: vi.fn(),
			handleYamlCopy: vi.fn(),
			handleYamlDownload: vi.fn(),
			saveYaml: vi.fn(),
			openImportModal: vi.fn(),
			closeImportModal: vi.fn(),
			submitImport: vi.fn(),
			setImportText: vi.fn(),
			handleImportFileTextLoad: vi.fn(),
			clearImportError: vi.fn(),
		})
		useProfilesPageTLSStateMock.mockReturnValue({
			applyTLSUpdate: vi.fn(),
			tlsCapability: { enabled: true },
			tlsStatus: null,
			tlsStatusLoading: false,
			tlsStatusError: 'tls failed',
		})

		const { result } = renderHook(() =>
			useProfilesPageState({
				apiToken: 'token-a',
				profileId: 'profile-1',
				setProfileId,
			}),
		)

		expect(result.current.hasOpenModal).toBe(true)
		expect(result.current.onboarding).toMatchObject({
			visible: true,
			apiToken: 'token-a',
			profileId: 'profile-1',
		})
		expect(result.current.status).toMatchObject({
			currentScopeKey: 'token-a::profiles',
			profilesQueryIsFetching: false,
			showProfilesEmpty: false,
			isTestPending: true,
			testingProfileId: 'profile-1',
		})
		expect(result.current.dialogs).toMatchObject({
			editLoading: true,
			yamlOpen: true,
			exportYamlLoading: true,
			tlsStatusError: 'tls failed',
		})
		expect(useProfilesPageTLSStateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				apiToken: 'token-a',
				activeEditProfile: expect.objectContaining({ id: 'profile-2' }),
			}),
		)

		act(() => {
			result.current.status.onDeleteProfile({
				id: 'profile-1',
				name: 'Primary',
				provider: 's3_compatible',
			} as never)
		})

		expect(confirmDangerActionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'Delete profile "Primary"?',
				confirmText: 'Primary',
			}),
		)

		await act(async () => {
			await confirmDangerActionMock.mock.calls[0][0].onConfirm()
		})

		expect(mutateAsync).toHaveBeenCalledWith('profile-1')
		expect(setProfileId).not.toHaveBeenCalled()
	})
})
