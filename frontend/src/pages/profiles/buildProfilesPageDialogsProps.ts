import type { ProfilesPageShellProps } from './ProfilesPageShell'

type ProfilesDialogsProps = ProfilesPageShellProps['dialogs']

type BuildProfilesPageDialogsPropsArgs = {
	createOpen: boolean
	closeCreateModal: ProfilesDialogsProps['closeCreateModal']
	onCreateSubmit: ProfilesDialogsProps['onCreateSubmit']
	createLoading: boolean
	editProfile: ProfilesDialogsProps['editProfile']
	closeEditModal: ProfilesDialogsProps['closeEditModal']
	onEditSubmit: ProfilesDialogsProps['onEditSubmit']
	editLoading: boolean
	editInitialValues: ProfilesDialogsProps['editInitialValues']
	tlsCapability: ProfilesDialogsProps['tlsCapability']
	tlsStatus: ProfilesDialogsProps['tlsStatus']
	tlsStatusLoading: boolean
	tlsStatusError: string | null
	yamlOpen: boolean
	closeYamlModal: ProfilesDialogsProps['closeYamlModal']
	yamlProfile: ProfilesDialogsProps['yamlProfile']
	yamlError: string | null
	yamlContent: string
	yamlDraft: string
	yamlFilename: string
	exportYamlLoading: boolean
	saveYamlLoading: boolean
	onYamlCopy: ProfilesDialogsProps['onYamlCopy']
	onYamlDownload: ProfilesDialogsProps['onYamlDownload']
	onYamlDraftChange: ProfilesDialogsProps['onYamlDraftChange']
	onYamlSave: ProfilesDialogsProps['onYamlSave']
	importOpen: boolean
	closeImportModal: ProfilesDialogsProps['closeImportModal']
	importSessionToken: number
	importText: string
	importError: string | null
	importLoading: boolean
	onImportSubmit: ProfilesDialogsProps['onImportSubmit']
	onImportFileTextLoad: ProfilesDialogsProps['onImportFileTextLoad']
	onImportTextChange: ProfilesDialogsProps['onImportTextChange']
	onImportErrorClear: ProfilesDialogsProps['onImportErrorClear']
}

export function buildProfilesPageDialogsProps(
	args: BuildProfilesPageDialogsPropsArgs,
): Pick<ProfilesPageShellProps, 'hasOpenModal' | 'dialogs'> {
	const hasOpenModal = args.createOpen || !!args.editProfile || args.yamlOpen || args.importOpen

	return {
		hasOpenModal,
		dialogs: {
			createOpen: args.createOpen,
			closeCreateModal: args.closeCreateModal,
			onCreateSubmit: args.onCreateSubmit,
			createLoading: args.createLoading,
			editProfile: args.editProfile,
			closeEditModal: args.closeEditModal,
			onEditSubmit: args.onEditSubmit,
			editLoading: args.editLoading,
			editInitialValues: args.editInitialValues,
			tlsCapability: args.tlsCapability,
			tlsStatus: args.tlsStatus,
			tlsStatusLoading: args.tlsStatusLoading,
			tlsStatusError: args.tlsStatusError,
			yamlOpen: args.yamlOpen,
			closeYamlModal: args.closeYamlModal,
			yamlProfile: args.yamlProfile,
			yamlError: args.yamlError,
			yamlContent: args.yamlContent,
			yamlDraft: args.yamlDraft,
			yamlFilename: args.yamlFilename,
			exportYamlLoading: args.exportYamlLoading,
			saveYamlLoading: args.saveYamlLoading,
			onYamlCopy: args.onYamlCopy,
			onYamlDownload: args.onYamlDownload,
			onYamlDraftChange: args.onYamlDraftChange,
			onYamlSave: args.onYamlSave,
			importOpen: args.importOpen,
			closeImportModal: args.closeImportModal,
			importSessionToken: args.importSessionToken,
			importText: args.importText,
			importError: args.importError,
			importLoading: args.importLoading,
			onImportSubmit: args.onImportSubmit,
			onImportFileTextLoad: args.onImportFileTextLoad,
			onImportTextChange: args.onImportTextChange,
			onImportErrorClear: args.onImportErrorClear,
		},
	}
}
