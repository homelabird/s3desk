import { Alert, Button, Input, Space, Spin, Typography } from 'antd'
import { lazy, Suspense } from 'react'

import type { Profile, ProfileTLSStatus } from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
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
	yamlFilename: string
	exportYamlLoading: boolean
	onYamlCopy: () => void
	onYamlDownload: () => void
	importOpen: boolean
	closeImportModal: () => void
	importText: string
	importError: string | null
	importLoading: boolean
	onImportSubmit: () => void
	onImportTextChange: (value: string) => void
	onImportErrorClear: () => void
}

export function ProfilesModals(props: ProfilesModalsProps) {
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
					<Button key="download" type="primary" disabled={!props.yamlContent} onClick={props.onYamlDownload}>
						Download
					</Button>,
					<Button key="close" onClick={props.closeYamlModal}>
						Close
					</Button>,
				]}
			>
				<Space orientation="vertical" size="middle" className={styles.fullWidth}>
					<Alert
						type="warning"
						showIcon
						title="Contains credentials"
						description="This export includes access keys and secrets. Store it securely."
					/>
					{props.yamlProfile ? (
						<Typography.Text>
							Profile: <Typography.Text code>{props.yamlProfile.name}</Typography.Text>
						</Typography.Text>
					) : null}
					{props.yamlError ? <Alert type="error" showIcon title="Failed to load YAML" description={props.yamlError} /> : null}
					{props.exportYamlLoading && !props.yamlContent ? (
						<Spin />
					) : (
						<Input.TextArea value={props.yamlContent} readOnly autoSize={{ minRows: 6, maxRows: 16 }} />
					)}
					{props.yamlContent ? <Typography.Text type="secondary">Filename: {props.yamlFilename}</Typography.Text> : null}
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
							const reader = new FileReader()
							reader.onload = () => {
								const text = typeof reader.result === 'string' ? reader.result : ''
								props.onImportTextChange(text)
								props.onImportErrorClear()
							}
							reader.readAsText(file)
						}}
					/>
					<Input.TextArea
						value={props.importText}
						onChange={(e) => {
							props.onImportTextChange(e.target.value)
							props.onImportErrorClear()
						}}
						autoSize={{ minRows: 8, maxRows: 16 }}
						placeholder="Paste YAML here…"
					/>
					{props.importError ? <Alert type="error" showIcon title={props.importError} /> : null}
				</Space>
			</DialogModal>
		</>
	)
}
