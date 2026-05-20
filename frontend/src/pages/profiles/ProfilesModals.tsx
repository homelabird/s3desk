import { Alert, Button, Input, Space, Spin, Typography } from 'antd'
import { lazy, Suspense } from 'react'

import type { Profile, ProfileTLSStatus } from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'
import styles from '../ProfilesPage.module.css'
import type { ProfileFormValues, TLSCapability } from './profileTypes'

const ProfileModal = lazy(async () => {
	const m = await import('./ProfileModal')
	return { default: m.ProfileModal }
})

type ProfilesModalsProps = {
	createOpen: boolean
	closeCreateModal: () => void
	onCreateSubmit: (values: ProfileFormValues) => void
	createLoading: boolean
	editProfile: Profile | null
	closeEditModal: () => void
	onEditSubmit: (id: string, values: ProfileFormValues) => void
	editLoading: boolean
	editInitialValues?: Partial<ProfileFormValues>
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
	yamlIncludesSecrets: boolean
	exportYamlLoading: boolean
	saveYamlLoading: boolean
	onYamlCopy: () => void
	onYamlDownload: () => void
	onYamlLoadSecrets: () => void
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

export function ProfilesModals(props: ProfilesModalsProps) {
	const yamlTextAreaId = 'profile-yaml-contents'
	const yamlErrorId = 'profile-yaml-contents-error'
	const importTextAreaId = 'profile-yaml-import'
	const importErrorId = 'profile-yaml-import-error'

	return (
		<>
			<Suspense fallback={null}>
				{props.createOpen ? (
					<ProfileModal
						open
						title="Create Profile"
						okText="Create"
						onCancel={props.closeCreateModal}
						onSubmit={props.onCreateSubmit}
						loading={props.createLoading}
						tlsCapability={props.tlsCapability}
					/>
				) : null}

				{props.editProfile ? (
					<ProfileModal
						open
						title="Edit Profile"
						okText="Save"
						onCancel={props.closeEditModal}
						onSubmit={(values) => {
							props.onEditSubmit(props.editProfile!.id, values)
						}}
						loading={props.editLoading}
						initialValues={props.editInitialValues}
						editMode
						tlsCapability={props.tlsCapability}
						tlsStatus={props.tlsStatus}
						tlsStatusLoading={props.tlsStatusLoading}
						tlsStatusError={props.tlsStatusError}
					/>
				) : null}
			</Suspense>

			<DialogModal
				open={props.yamlOpen}
				title="Profile YAML"
				onClose={props.closeYamlModal}
				width={720}
				footer={[
					<Button key="copy" disabled={!props.yamlContent} onClick={props.onYamlCopy}>
						Copy
					</Button>,
						<Button key="download" disabled={!props.yamlContent} onClick={props.onYamlDownload}>
							Download
						</Button>,
						<Button
							key="secrets"
							danger
							disabled={!props.yamlProfile || props.yamlIncludesSecrets || props.exportYamlLoading || props.saveYamlLoading}
							loading={props.exportYamlLoading && !!props.yamlContent}
							onClick={props.onYamlLoadSecrets}
						>
							Load with secrets
						</Button>,
						<Button
							key="save"
						type="primary"
						disabled={!props.yamlDraft.trim() || props.exportYamlLoading}
						loading={props.saveYamlLoading}
						onClick={props.onYamlSave}
					>
						Save
					</Button>,
					<Button key="close" onClick={props.closeYamlModal}>
						Close
					</Button>,
				]}
			>
					<Space orientation="vertical" size="middle" className={styles.fullWidth}>
						<Alert
							type={props.yamlIncludesSecrets ? 'warning' : 'info'}
							showIcon
							title={props.yamlIncludesSecrets ? 'Secret-inclusive YAML loaded' : 'Secrets omitted'}
							description={
								props.yamlIncludesSecrets
									? 'This YAML includes credentials and TLS private material. Store it securely.'
									: 'Default YAML omits credentials and TLS private material. Load secrets only for controlled migration.'
							}
						/>
					{props.yamlProfile ? (
						<Typography.Text>
							Profile: <Typography.Text code>{props.yamlProfile.name}</Typography.Text>
						</Typography.Text>
					) : null}
					{props.exportYamlLoading && !props.yamlContent ? (
						<Spin />
					) : (
						<FormField
							label="Profile YAML contents"
							htmlFor={yamlTextAreaId}
							error={props.yamlError ? `YAML action failed: ${props.yamlError}` : undefined}
							errorId={yamlErrorId}
						>
							<Input.TextArea
								id={yamlTextAreaId}
								value={props.yamlDraft}
								onChange={(e) => props.onYamlDraftChange(e.target.value)}
								autoSize={{ minRows: 6, maxRows: 16 }}
								aria-describedby={props.yamlError ? yamlErrorId : undefined}
							/>
						</FormField>
					)}
					{props.yamlDraft ? <Typography.Text type="secondary">Filename: {props.yamlFilename}</Typography.Text> : null}
				</Space>
			</DialogModal>

			<DialogModal
				open={props.importOpen}
				title="Import Profile YAML"
				onClose={props.closeImportModal}
				width={720}
				footer={
					<>
						<Button onClick={props.closeImportModal}>Cancel</Button>
						<Button
							type="primary"
							onClick={props.onImportSubmit}
							disabled={props.importLoading || props.importText.trim() === ''}
							loading={props.importLoading}
						>
							Import
						</Button>
					</>
				}
				>
					<Space orientation="vertical" size="middle" className={styles.fullWidth}>
						<Alert
							type="warning"
							showIcon
							title="YAML may contain credentials"
							description="Import only YAML from trusted sources. Secret fields are saved into the selected profile backend."
						/>
						<Typography.Text type="secondary">
							Import a profile exported from S3Desk. This will create a new profile (the YAML id is ignored).
						</Typography.Text>
					<input
						type="file"
						accept=".yaml,.yml"
						aria-label="Import profile YAML file"
						onChange={(e) => {
							const file = e.target.files?.[0]
							if (!file) return
							const sessionToken = props.importSessionToken
							const reader = new FileReader()
							reader.onload = () => {
								const text = typeof reader.result === 'string' ? reader.result : ''
								props.onImportFileTextLoad(sessionToken, text)
							}
							reader.readAsText(file)
						}}
					/>
					<FormField label="Paste YAML" htmlFor={importTextAreaId} error={props.importError} errorId={importErrorId}>
						<Input.TextArea
							id={importTextAreaId}
							value={props.importText}
							onChange={(e) => {
								props.onImportTextChange(e.target.value)
								props.onImportErrorClear()
							}}
							autoSize={{ minRows: 8, maxRows: 16 }}
							placeholder="Paste YAML here..."
							aria-describedby={props.importError ? importErrorId : undefined}
						/>
					</FormField>
				</Space>
			</DialogModal>
		</>
	)
}
