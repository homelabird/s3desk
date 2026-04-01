import { Suspense } from 'react'

import type { Profile, ProfileTLSStatus } from '../../api/types'
import { ProfilesModals } from './profilesLazy'
import type { ProfileFormValues, TLSCapability } from './profileTypes'

type Props = {
	createOpen: boolean
	closeCreateModal: () => void
	onCreateSubmit: (values: ProfileFormValues) => void
	createLoading: boolean
	editProfile: Profile | null
	closeEditModal: () => void
	onEditSubmit: (id: string, values: ProfileFormValues) => void
	editLoading: boolean
	editInitialValues: Partial<ProfileFormValues> | undefined
	tlsCapability: TLSCapability | null
	tlsStatus: ProfileTLSStatus | null
	tlsStatusLoading: boolean
	tlsStatusError: string | null
	yamlOpen: boolean
	closeYamlModal: () => void
	yamlProfile: Profile | null
	yamlError: string | null
	yamlContent: string
	yamlDraft: string
	yamlFilename: string
	exportYamlLoading: boolean
	saveYamlLoading: boolean
	onYamlCopy: () => void
	onYamlDownload: () => void
	onYamlDraftChange: (value: string) => void
	onYamlSave: () => void
	importOpen: boolean
	closeImportModal: () => void
	importSessionToken: number
	importText: string
	importError: string | null
	importLoading: boolean
	onImportSubmit: () => void
	onImportFileTextLoad: (sessionToken: number, value: string) => void
	onImportTextChange: (value: string) => void
	onImportErrorClear: () => void
}

export function ProfilesDialogs(props: Props) {
	return (
		<Suspense fallback={null}>
			<ProfilesModals
				createOpen={props.createOpen}
				closeCreateModal={props.closeCreateModal}
				onCreateSubmit={props.onCreateSubmit}
				createLoading={props.createLoading}
				editProfile={props.editProfile}
				closeEditModal={props.closeEditModal}
				onEditSubmit={props.onEditSubmit}
				editLoading={props.editLoading}
				editInitialValues={props.editInitialValues}
				tlsCapability={props.tlsCapability}
				tlsStatus={props.tlsStatus}
				tlsStatusLoading={props.tlsStatusLoading}
				tlsStatusError={props.tlsStatusError}
				yamlOpen={props.yamlOpen}
				closeYamlModal={props.closeYamlModal}
				yamlProfile={props.yamlProfile}
				yamlError={props.yamlError}
				yamlContent={props.yamlContent}
				yamlDraft={props.yamlDraft}
				yamlFilename={props.yamlFilename}
				exportYamlLoading={props.exportYamlLoading}
				saveYamlLoading={props.saveYamlLoading}
				onYamlCopy={props.onYamlCopy}
				onYamlDownload={props.onYamlDownload}
				onYamlDraftChange={props.onYamlDraftChange}
				onYamlSave={props.onYamlSave}
				importOpen={props.importOpen}
				closeImportModal={props.closeImportModal}
				importSessionToken={props.importSessionToken}
				importText={props.importText}
				importError={props.importError}
				importLoading={props.importLoading}
				onImportSubmit={props.onImportSubmit}
				onImportFileTextLoad={props.onImportFileTextLoad}
				onImportTextChange={props.onImportTextChange}
				onImportErrorClear={props.onImportErrorClear}
			/>
		</Suspense>
	)
}
