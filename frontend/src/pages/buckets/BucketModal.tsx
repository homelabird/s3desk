import { Alert, Button, Input } from 'antd'
import { useRef, useState } from 'react'

import type { BucketCreateRequest, Profile } from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'
import styles from './BucketModal.module.css'
import { AwsBucketCreateDefaults } from './create/aws-defaults'
import { AzureBucketCreateDefaults } from './create/azure-defaults'
import { GcsBucketCreateDefaults } from './create/gcs-defaults'
import {
	awsBlockPublicAccess,
	createInitialAWSDefaults,
	createInitialAzureDefaults,
	createInitialGCSDefaults,
	normalizeAzureStoredPolicies,
	normalizeGCSBindings,
} from './create/types'

export function BucketModal(props: {
	open: boolean
	onCancel: () => void
	onSubmit: (req: BucketCreateRequest) => void
	loading: boolean
	provider?: Profile['provider']
}) {
	const [name, setName] = useState('')
	const [region, setRegion] = useState('')
	const [submitError, setSubmitError] = useState<string | null>(null)
	const [awsDefaults, setAwsDefaults] = useState(createInitialAWSDefaults)
	const [gcsDefaults, setGcsDefaults] = useState(createInitialGCSDefaults)
	const [azureDefaults, setAzureDefaults] = useState(createInitialAzureDefaults)
	const keyCounter = useRef(0)
	const nextKey = () => {
		keyCounter.current += 1
		return `create-default-${keyCounter.current}`
	}

	const regionMeta = (() => {
		switch (props.provider) {
			case 'azure_blob':
				return { show: false, label: '', placeholder: '' }
			case 'gcp_gcs':
				return { show: true, label: 'Location (optional)', placeholder: 'us-central1' }
			default:
				return { show: true, label: 'Region (optional)', placeholder: 'us-east-1' }
		}
	})()

	const canSubmit = !!name.trim()
	const reset = () => {
		setName('')
		setRegion('')
		setSubmitError(null)
		setAwsDefaults(createInitialAWSDefaults())
		setGcsDefaults(createInitialGCSDefaults())
		setAzureDefaults(createInitialAzureDefaults())
	}

	const buildAWSDefaults = (): BucketCreateRequest['defaults'] | undefined => {
		if (props.provider !== 'aws_s3' || !awsDefaults.enabled) return undefined
		const defaults: NonNullable<BucketCreateRequest['defaults']> = {}

		if (awsDefaults.blockPublicAccess) {
			defaults.publicExposure = { blockPublicAccess: awsBlockPublicAccess }
		}
		if (awsDefaults.objectOwnershipEnabled) {
			defaults.access = { objectOwnership: awsDefaults.objectOwnership }
		}
		if (awsDefaults.versioningEnabled) {
			defaults.versioning = { status: 'enabled' }
		}
		if (awsDefaults.encryptionEnabled) {
			const kmsKeyId = awsDefaults.kmsKeyId.trim()
			defaults.encryption = {
				mode: awsDefaults.encryptionMode,
				kmsKeyId: awsDefaults.encryptionMode === 'sse_kms' && kmsKeyId ? kmsKeyId : undefined,
			}
		}

		return Object.keys(defaults).length > 0 ? defaults : undefined
	}

	const buildGCSDefaults = (): BucketCreateRequest['defaults'] | undefined => {
		if (props.provider !== 'gcp_gcs' || !gcsDefaults.enabled) return undefined
		const defaults: NonNullable<BucketCreateRequest['defaults']> = {
			publicExposure: {
				mode: gcsDefaults.publicMode,
			},
		}

		if (gcsDefaults.bindingsEnabled) {
			const bindings = normalizeGCSBindings(gcsDefaults.bindings)
			if (bindings.length > 0) {
				defaults.access = { bindings }
			}
		}

		return defaults
	}

	const buildAzureDefaults = (): BucketCreateRequest['defaults'] | undefined => {
		if (props.provider !== 'azure_blob' || !azureDefaults.enabled) return undefined
		const defaults: NonNullable<BucketCreateRequest['defaults']> = {
			publicExposure: {
				mode: azureDefaults.visibility,
				visibility: azureDefaults.visibility,
			},
		}

		if (azureDefaults.storedPoliciesEnabled) {
			const storedAccessPolicies = normalizeAzureStoredPolicies(azureDefaults.storedPolicies)
			if (storedAccessPolicies.length > 0) {
				defaults.access = { storedAccessPolicies }
			}
		}

		return defaults
	}

	const buildDefaults = (): BucketCreateRequest['defaults'] | undefined => {
		switch (props.provider) {
			case 'aws_s3':
				return buildAWSDefaults()
			case 'gcp_gcs':
				return buildGCSDefaults()
			case 'azure_blob':
				return buildAzureDefaults()
			default:
				return undefined
		}
	}

	const handleSubmit = () => {
		const trimmedName = name.trim()
		if (!trimmedName) return
		const trimmedRegion = region.trim()

		try {
			const defaults = buildDefaults()
			setSubmitError(null)
			props.onSubmit({
				name: trimmedName,
				region: trimmedRegion ? trimmedRegion : undefined,
				defaults,
			})
		} catch (error) {
			setSubmitError(error instanceof Error ? error.message : 'Invalid secure defaults')
		}
	}

	const handleCancel = () => {
		reset()
		props.onCancel()
	}

	const renderSecureDefaults = () => {
		switch (props.provider) {
			case 'aws_s3':
				return (
					<AwsBucketCreateDefaults
						state={awsDefaults}
						onChange={setAwsDefaults}
						clearSubmitError={() => setSubmitError(null)}
					/>
				)
			case 'gcp_gcs':
				return (
					<GcsBucketCreateDefaults
						state={gcsDefaults}
						onChange={setGcsDefaults}
						clearSubmitError={() => setSubmitError(null)}
						nextKey={nextKey}
					/>
				)
			case 'azure_blob':
				return (
					<AzureBucketCreateDefaults
						state={azureDefaults}
						onChange={setAzureDefaults}
						clearSubmitError={() => setSubmitError(null)}
						nextKey={nextKey}
					/>
				)
			default:
				if (!props.provider) return null
				return (
					<Alert
						type="info"
						showIcon
						className={styles.providerHint}
						title="Create-time secure defaults are not available for this provider yet."
						description="Create the bucket first, then use provider-specific controls or policy management afterward."
					/>
				)
		}
	}

	return (
		<DialogModal
			open={props.open}
			title="Create Bucket"
			onClose={handleCancel}
			footer={
				<>
					<Button onClick={handleCancel}>Cancel</Button>
					<Button type="primary" loading={props.loading} disabled={!canSubmit} onClick={handleSubmit}>
						Create
					</Button>
				</>
			}
		>
			<form
				className={styles.form}
				onSubmit={(e) => {
					e.preventDefault()
					handleSubmit()
				}}
			>
				<FormField label="Bucket name" required htmlFor="bucket-create-name">
					<Input
						id="bucket-create-name"
						value={name}
						onChange={(e) => {
							setSubmitError(null)
							setName(e.target.value)
						}}
						placeholder="my-bucket…"
						autoComplete="off"
					/>
				</FormField>

				{regionMeta.show ? (
					<FormField label={regionMeta.label} htmlFor="bucket-create-region">
						<Input
							id="bucket-create-region"
							value={region}
							onChange={(e) => {
								setSubmitError(null)
								setRegion(e.target.value)
							}}
							placeholder={regionMeta.placeholder}
							autoComplete="off"
						/>
					</FormField>
				) : null}

				{submitError ? <Alert type="error" showIcon title="Secure defaults are invalid" description={submitError} /> : null}

				{renderSecureDefaults()}
			</form>
		</DialogModal>
	)
}
