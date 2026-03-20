import { Tag, Typography } from 'antd'
import type { ReactNode } from 'react'

import type { ProfileFormValues } from './profileTypes'
import type { FieldErrors, ProfileModalViewState } from './profileModalValidation'

export type ProfileModalSectionContentArgs = {
	values: ProfileFormValues
	errors: FieldErrors
	editMode?: boolean
	setField: <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => void
	viewState: ProfileModalViewState
	renderSwitchCard: (props: {
		title: string
		description: string
		checked: boolean
		onChange: (checked: boolean) => void
		disabled?: boolean
		ariaLabel?: string
	}) => ReactNode
}

type AdvancedFieldDisclosureProps = {
	title: string
	description: string
	configuredCount?: number
	children: ReactNode
}

export function countConfiguredValues(values: Array<string | null | undefined>) {
	return values.reduce((count, value) => (value && value.trim() ? count + 1 : count), 0)
}

export function getConnectionSummary(viewState: ProfileModalViewState) {
	if (viewState.isS3Provider) {
		return viewState.isAws
			? 'Required now: name and region. Endpoint override and browser-only endpoint override are optional.'
			: 'Required now: name, endpoint URL, and region. Browser-only endpoint override is optional.'
	}
	if (viewState.isOciObjectStorage) {
		return 'Required now: region, namespace, and compartment OCID. Endpoint override is optional.'
	}
	if (viewState.isAzure) {
		return 'Required now: storage account name. Endpoint override and Azure ARM fields are only needed for emulator or management-plane features.'
	}
	if (viewState.isGcp) {
		return 'Required now: project number. Endpoint override is optional.'
	}
	return 'Required now: provider and profile name.'
}

export function getCredentialsSummary(viewState: ProfileModalViewState, editMode?: boolean) {
	const prefix = editMode ? 'Only fill the fields you want to replace.' : 'Required now:'
	if (viewState.isS3Provider) {
		return `${prefix} access key ID and secret. Session token is only needed for temporary credentials.`
	}
	if (viewState.isOciObjectStorage) {
		return `${prefix} OCI user, tenancy, fingerprint, and private key or config-based auth.`
	}
	if (viewState.isAzure) {
		return `${prefix} account key for data-plane access. Client secret is only needed when Azure ARM fields are configured.`
	}
	if (viewState.isGcp) {
		return `${prefix} service account credentials JSON.`
	}
	return `${prefix} the provider auth material shown below.`
}

export function renderAdvancedFieldDisclosure({
	title,
	description,
	configuredCount = 0,
	children,
}: AdvancedFieldDisclosureProps) {
	return (
		<details
			style={{
				marginTop: 12,
				padding: '12px 14px',
				border: '1px solid var(--s3d-color-border, #d9d9d9)',
				borderRadius: 8,
				background: 'var(--s3d-color-bg-elevated, rgba(0, 0, 0, 0.02))',
			}}
		>
			<summary style={{ cursor: 'pointer', fontWeight: 600 }}>{title}</summary>
			<div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
					<Typography.Text type="secondary">{description}</Typography.Text>
					<Tag>{configuredCount > 0 ? `${configuredCount} configured` : 'Optional'}</Tag>
				</div>
				{children}
			</div>
		</details>
	)
}
