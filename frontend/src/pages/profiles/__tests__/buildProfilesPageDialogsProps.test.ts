import { describe, expect, it, vi } from 'vitest'

import { buildProfilesPageDialogsProps } from '../buildProfilesPageDialogsProps'

describe('buildProfilesPageDialogsProps', () => {
	it('builds dialog props and derives the open-modal flag from create/edit/yaml/import state', () => {
		const closeCreateModal = vi.fn()
		const onCreateSubmit = vi.fn()
		const closeEditModal = vi.fn()
		const onEditSubmit = vi.fn()
		const closeYamlModal = vi.fn()
		const onYamlCopy = vi.fn()
		const onYamlDownload = vi.fn()
		const onYamlDraftChange = vi.fn()
		const onYamlSave = vi.fn()
		const closeImportModal = vi.fn()
		const onImportSubmit = vi.fn()
		const onImportFileTextLoad = vi.fn()
		const onImportTextChange = vi.fn()
		const onImportErrorClear = vi.fn()

		const result = buildProfilesPageDialogsProps({
			createOpen: false,
			closeCreateModal,
			onCreateSubmit,
			createLoading: false,
			editProfile: { id: 'profile-1', name: 'Primary', provider: 's3_compatible' } as never,
			closeEditModal,
			onEditSubmit,
			editLoading: true,
			editInitialValues: { name: 'Primary' },
			tlsCapability: { enabled: true } as never,
			tlsStatus: { mode: 'mtls' } as never,
			tlsStatusLoading: false,
			tlsStatusError: 'tls failed',
			yamlOpen: false,
			closeYamlModal,
			yamlProfile: null,
			yamlError: null,
			yamlContent: 'name: primary\n',
			yamlDraft: 'name: primary\n',
			yamlFilename: 'primary.yaml',
			exportYamlLoading: false,
			saveYamlLoading: false,
			onYamlCopy,
			onYamlDownload,
			onYamlDraftChange,
			onYamlSave,
			importOpen: false,
			closeImportModal,
			importSessionToken: 3,
			importText: 'name: imported\n',
			importError: null,
			importLoading: false,
			onImportSubmit,
			onImportFileTextLoad,
			onImportTextChange,
			onImportErrorClear,
		})

		expect(result.hasOpenModal).toBe(true)
		expect(result.dialogs).toMatchObject({
			editLoading: true,
			editInitialValues: { name: 'Primary' },
			tlsStatusError: 'tls failed',
			yamlFilename: 'primary.yaml',
			importSessionToken: 3,
			importText: 'name: imported\n',
		})
		expect(result.dialogs.closeCreateModal).toBe(closeCreateModal)
		expect(result.dialogs.onCreateSubmit).toBe(onCreateSubmit)
		expect(result.dialogs.closeEditModal).toBe(closeEditModal)
		expect(result.dialogs.onEditSubmit).toBe(onEditSubmit)
		expect(result.dialogs.closeYamlModal).toBe(closeYamlModal)
		expect(result.dialogs.onYamlCopy).toBe(onYamlCopy)
		expect(result.dialogs.onYamlDownload).toBe(onYamlDownload)
		expect(result.dialogs.onYamlDraftChange).toBe(onYamlDraftChange)
		expect(result.dialogs.onYamlSave).toBe(onYamlSave)
		expect(result.dialogs.closeImportModal).toBe(closeImportModal)
		expect(result.dialogs.onImportSubmit).toBe(onImportSubmit)
		expect(result.dialogs.onImportFileTextLoad).toBe(onImportFileTextLoad)
		expect(result.dialogs.onImportTextChange).toBe(onImportTextChange)
		expect(result.dialogs.onImportErrorClear).toBe(onImportErrorClear)
	})
})
