import { PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Tag, Typography } from 'antd'
import { useRef, useState } from 'react'

import type {
	BucketAccessBinding,
	BucketCreateRequest,
	BucketStoredAccessPolicy,
	BucketPublicExposureMode,
	Profile,
} from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'
import { NativeSelect } from '../../components/NativeSelect'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import styles from './BucketModal.module.css'

const awsBlockPublicAccess = {
	blockPublicAcls: true,
	ignorePublicAcls: true,
	blockPublicPolicy: true,
	restrictPublicBuckets: true,
} as const

type AwsObjectOwnershipMode = 'bucket_owner_enforced' | 'bucket_owner_preferred' | 'object_writer'
type AwsEncryptionMode = 'sse_s3' | 'sse_kms'
type GCSPublicMode = Extract<BucketPublicExposureMode, 'private' | 'public'>
type AzureVisibilityMode = Extract<BucketPublicExposureMode, 'private' | 'blob' | 'container'>
type GCSBindingRow = {
	key: string
	role: string
	membersText: string
}
type AzureStoredPolicyRow = {
	key: string
	id: string
	start: string
	expiry: string
	permission: string
}

function createInitialAWSDefaults() {
	return {
		enabled: false,
		blockPublicAccess: true,
		objectOwnershipEnabled: true,
		objectOwnership: 'bucket_owner_enforced' as AwsObjectOwnershipMode,
		versioningEnabled: true,
		encryptionEnabled: true,
		encryptionMode: 'sse_s3' as AwsEncryptionMode,
		kmsKeyId: '',
	}
}

function createInitialGCSDefaults() {
	return {
		enabled: false,
		publicMode: 'private' as GCSPublicMode,
		bindingsEnabled: false,
		bindings: [] as GCSBindingRow[],
	}
}

function createInitialAzureDefaults() {
	return {
		enabled: false,
		visibility: 'private' as AzureVisibilityMode,
		storedPoliciesEnabled: false,
		storedPolicies: [] as AzureStoredPolicyRow[],
	}
}

function parseMembersInput(value: string): string[] {
	return Array.from(
		new Set(
			value
				.split(/[\n,]+/)
				.map((item) => item.trim())
				.filter(Boolean),
		),
	)
}

function isRFC3339(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
}

function normalizeGCSBindings(rows: GCSBindingRow[]): BucketAccessBinding[] {
	type BindingCandidate = BucketAccessBinding | null
	return rows
		.map<BindingCandidate>((row, index) => {
			const role = row.role.trim()
			const members = parseMembersInput(row.membersText)
			if (!role && members.length === 0) return null
			if (!role) throw new Error(`GCS binding #${index + 1}: role is required.`)
			if (members.length === 0) throw new Error(`GCS binding #${index + 1}: at least one member is required.`)
			return { role, members }
		})
		.filter((row): row is BucketAccessBinding => row !== null)
}

function normalizeAzureStoredPolicies(rows: AzureStoredPolicyRow[]): BucketStoredAccessPolicy[] {
	const seen = new Set<string>()
	const out: BucketStoredAccessPolicy[] = []
	rows.forEach((row, index) => {
		const id = row.id.trim()
		const start = row.start.trim()
		const expiry = row.expiry.trim()
		const permission = row.permission.trim()
		if (!id && !start && !expiry && !permission) return
		if (!id) throw new Error(`Azure stored access policy #${index + 1}: id is required.`)
		const key = id.toLowerCase()
		if (seen.has(key)) throw new Error(`Azure stored access policy id "${id}" is duplicated.`)
		seen.add(key)
		if (start && !isRFC3339(start)) {
			throw new Error(`Azure stored access policy ${id}: start must be RFC3339.`)
		}
		if (expiry && !isRFC3339(expiry)) {
			throw new Error(`Azure stored access policy ${id}: expiry must be RFC3339.`)
		}
		if (permission && !/^[rwdlacup]+$/i.test(permission)) {
			throw new Error(`Azure stored access policy ${id}: permission must use only r/w/d/l/a/c/u/p.`)
		}
		out.push({
			id,
			start: start || undefined,
			expiry: expiry || undefined,
			permission: permission || undefined,
		})
	})
	if (out.length > 5) {
		throw new Error('Azure allows a maximum of 5 stored access policies.')
	}
	return out
}

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
		if (props.provider === 'aws_s3') {
			return (
				<section className={styles.secureDefaultsCard} data-testid="bucket-modal-secure-defaults">
					<div className={styles.secureDefaultsHeader}>
						<div className={styles.secureDefaultsCopy}>
							<Typography.Text strong>Secure Defaults</Typography.Text>
							<Typography.Text type="secondary">
								Apply the recommended AWS S3 baseline during bucket creation, then tune controls later if needed.
							</Typography.Text>
							<Tag color="green" variant="filled">
								Recommended preset
							</Tag>
						</div>
						<ToggleSwitch
							checked={awsDefaults.enabled}
							onChange={(checked) => {
								setSubmitError(null)
								setAwsDefaults((current) => ({ ...current, enabled: checked }))
							}}
							ariaLabel="Apply recommended AWS secure defaults"
						/>
					</div>

					{awsDefaults.enabled ? (
						<div className={styles.secureDefaultsGrid}>
							<section className={styles.settingCard}>
								<div className={styles.settingHeader}>
									<div className={styles.settingCopy}>
										<Typography.Text strong>Block Public Access</Typography.Text>
										<Typography.Text type="secondary">All four S3 public access block flags are enabled.</Typography.Text>
									</div>
									<ToggleSwitch
										checked={awsDefaults.blockPublicAccess}
										onChange={(checked) => {
											setSubmitError(null)
											setAwsDefaults((current) => ({ ...current, blockPublicAccess: checked }))
										}}
										ariaLabel="Enable block public access defaults"
									/>
								</div>
							</section>

							<section className={styles.settingCard}>
								<div className={styles.settingHeader}>
									<div className={styles.settingCopy}>
										<Typography.Text strong>Object Ownership</Typography.Text>
										<Typography.Text type="secondary">Start with ACLs disabled and bucket ownership enforced.</Typography.Text>
									</div>
									<ToggleSwitch
										checked={awsDefaults.objectOwnershipEnabled}
										onChange={(checked) => {
											setSubmitError(null)
											setAwsDefaults((current) => ({ ...current, objectOwnershipEnabled: checked }))
										}}
										ariaLabel="Enable object ownership defaults"
									/>
								</div>
								{awsDefaults.objectOwnershipEnabled ? (
									<div className={styles.settingBody}>
										<FormField label="Ownership mode" htmlFor="bucket-create-object-ownership">
											<NativeSelect
												id="bucket-create-object-ownership"
												value={awsDefaults.objectOwnership}
												onChange={(value) => {
													setSubmitError(null)
													setAwsDefaults((current) => ({
														...current,
														objectOwnership: value as AwsObjectOwnershipMode,
													}))
												}}
												options={[
													{ value: 'bucket_owner_enforced', label: 'Bucket owner enforced' },
													{ value: 'bucket_owner_preferred', label: 'Bucket owner preferred' },
													{ value: 'object_writer', label: 'Object writer' },
												]}
												ariaLabel="Ownership mode"
											/>
										</FormField>
									</div>
								) : null}
							</section>

							<section className={styles.settingCard}>
								<div className={styles.settingHeader}>
									<div className={styles.settingCopy}>
										<Typography.Text strong>Versioning</Typography.Text>
										<Typography.Text type="secondary">Enable version history at creation time.</Typography.Text>
									</div>
									<ToggleSwitch
										checked={awsDefaults.versioningEnabled}
										onChange={(checked) => {
											setSubmitError(null)
											setAwsDefaults((current) => ({ ...current, versioningEnabled: checked }))
										}}
										ariaLabel="Enable versioning defaults"
									/>
								</div>
							</section>

							<section className={styles.settingCard}>
								<div className={styles.settingHeader}>
									<div className={styles.settingCopy}>
										<Typography.Text strong>Default Encryption</Typography.Text>
										<Typography.Text type="secondary">Use SSE-S3 by default or promote to SSE-KMS when a managed key policy is ready.</Typography.Text>
									</div>
									<ToggleSwitch
										checked={awsDefaults.encryptionEnabled}
										onChange={(checked) => {
											setSubmitError(null)
											setAwsDefaults((current) => ({ ...current, encryptionEnabled: checked }))
										}}
										ariaLabel="Enable encryption defaults"
									/>
								</div>
								{awsDefaults.encryptionEnabled ? (
									<div className={styles.settingBody}>
										<FormField label="Encryption mode" htmlFor="bucket-create-encryption-mode">
											<NativeSelect
												id="bucket-create-encryption-mode"
												value={awsDefaults.encryptionMode}
												onChange={(value) => {
													setSubmitError(null)
													setAwsDefaults((current) => ({
														...current,
														encryptionMode: value as AwsEncryptionMode,
													}))
												}}
												options={[
													{ value: 'sse_s3', label: 'SSE-S3' },
													{ value: 'sse_kms', label: 'SSE-KMS' },
												]}
												ariaLabel="Encryption mode"
											/>
										</FormField>
										{awsDefaults.encryptionMode === 'sse_kms' ? (
											<FormField
												label="KMS key ID (optional)"
												htmlFor="bucket-create-kms-key-id"
												extra={<span className={styles.inlineHint}>Leave blank to use the AWS managed KMS key.</span>}
											>
												<Input
													id="bucket-create-kms-key-id"
													value={awsDefaults.kmsKeyId}
													onChange={(e) => {
														setSubmitError(null)
														setAwsDefaults((current) => ({ ...current, kmsKeyId: e.target.value }))
													}}
													placeholder="alias/my-bucket-key"
													autoComplete="off"
												/>
											</FormField>
										) : null}
									</div>
								) : null}
							</section>
						</div>
					) : null}
				</section>
			)
		}

		if (props.provider === 'gcp_gcs') {
			return (
				<section className={styles.secureDefaultsCard} data-testid="bucket-modal-secure-defaults">
					<div className={styles.secureDefaultsHeader}>
						<div className={styles.secureDefaultsCopy}>
							<Typography.Text strong>Secure Defaults</Typography.Text>
							<Typography.Text type="secondary">
								Start new GCS buckets with private exposure, then optionally seed the first IAM bindings during creation.
							</Typography.Text>
							<Tag color="green" variant="filled">
								Private baseline
							</Tag>
						</div>
						<ToggleSwitch
							checked={gcsDefaults.enabled}
							onChange={(checked) => {
								setSubmitError(null)
								setGcsDefaults((current) => ({ ...current, enabled: checked }))
							}}
							ariaLabel="Apply recommended GCS secure defaults"
						/>
					</div>

					{gcsDefaults.enabled ? (
						<>
							<Alert
								type="info"
								showIcon
								className={styles.providerDefaultsHint}
								title="Current create-time GCS controls are limited"
								description="Uniform bucket-level access and Public Access Prevention are not wired into this create flow yet. Use Controls after creation when you need deeper governance."
							/>
							<div className={styles.secureDefaultsGrid}>
								<section className={styles.settingCard}>
									<div className={styles.settingCopy}>
										<Typography.Text strong>Public Exposure</Typography.Text>
										<Typography.Text type="secondary">Keep the bucket private by default or bootstrap it as public if the workload explicitly needs anonymous reads.</Typography.Text>
									</div>
									<div className={styles.settingBody}>
										<FormField label="Access mode" htmlFor="bucket-create-gcs-public-mode">
											<NativeSelect
												id="bucket-create-gcs-public-mode"
												value={gcsDefaults.publicMode}
												onChange={(value) => {
													setSubmitError(null)
													setGcsDefaults((current) => ({
														...current,
														publicMode: (value === 'public' ? 'public' : 'private') as GCSPublicMode,
													}))
												}}
												options={[
													{ value: 'private', label: 'Private' },
													{ value: 'public', label: 'Public' },
												]}
												ariaLabel="GCS access mode"
											/>
										</FormField>
									</div>
								</section>

								<section className={styles.settingCard}>
									<div className={styles.settingHeader}>
										<div className={styles.settingCopy}>
											<Typography.Text strong>Initial IAM bindings</Typography.Text>
											<Typography.Text type="secondary">Optionally seed the first bucket-level IAM bindings without dropping into raw JSON.</Typography.Text>
										</div>
										<ToggleSwitch
											checked={gcsDefaults.bindingsEnabled}
											onChange={(checked) => {
												setSubmitError(null)
												setGcsDefaults((current) => ({ ...current, bindingsEnabled: checked }))
											}}
											ariaLabel="Seed GCS IAM bindings during creation"
										/>
									</div>
									{gcsDefaults.bindingsEnabled ? (
										<div className={styles.settingBody}>
											{gcsDefaults.bindings.length === 0 ? (
												<Typography.Text type="secondary">No initial bindings</Typography.Text>
											) : (
												<div className={styles.structuredCardList}>
													{gcsDefaults.bindings.map((row, index) => (
														<section key={row.key} className={styles.structuredCard}>
															<div className={styles.structuredCardHeader}>
																<Typography.Text strong>{`Binding ${index + 1}`}</Typography.Text>
																<Button
																	danger
																	size="small"
																	onClick={() =>
																		setGcsDefaults((current) => ({
																			...current,
																			bindings: current.bindings.filter((binding) => binding.key !== row.key),
																		}))
																	}
																>
																	Remove
																</Button>
															</div>
															<div className={styles.structuredField}>
																<Typography.Text type="secondary" className={styles.structuredFieldLabel}>
																	Role
																</Typography.Text>
																<Input
																	value={row.role}
																	aria-label={`GCS binding ${index + 1} role`}
																	onChange={(e) => {
																		const value = e.target.value
																		setSubmitError(null)
																		setGcsDefaults((current) => ({
																			...current,
																			bindings: current.bindings.map((binding) =>
																				binding.key === row.key ? { ...binding, role: value } : binding,
																			),
																		}))
																	}}
																	placeholder="roles/storage.objectViewer"
																/>
															</div>
															<div className={styles.structuredField}>
																<Typography.Text type="secondary" className={styles.structuredFieldLabel}>
																	Members
																</Typography.Text>
																<Input.TextArea
																	value={row.membersText}
																	aria-label={`GCS binding ${index + 1} members`}
																	onChange={(e) => {
																		const value = e.target.value
																		setSubmitError(null)
																		setGcsDefaults((current) => ({
																			...current,
																			bindings: current.bindings.map((binding) =>
																				binding.key === row.key ? { ...binding, membersText: value } : binding,
																			),
																		}))
																	}}
																	className={styles.membersInput}
																	rows={4}
																	placeholder="One per line: user:ops@example.com"
																/>
															</div>
														</section>
													))}
												</div>
											)}
											<Button
												icon={<PlusOutlined />}
												onClick={() => {
													setSubmitError(null)
													setGcsDefaults((current) => ({
														...current,
														bindings: [
															...current.bindings,
															{ key: nextKey(), role: '', membersText: '' },
														],
													}))
												}}
											>
												Add binding
											</Button>
											<Typography.Text type="secondary" className={styles.inlineHint}>
												Use one member per line, for example <Typography.Text code>user:ops@example.com</Typography.Text> or <Typography.Text code>allUsers</Typography.Text>.
											</Typography.Text>
										</div>
									) : null}
								</section>
							</div>
						</>
					) : null}
				</section>
			)
		}

		if (props.provider === 'azure_blob') {
			return (
				<section className={styles.secureDefaultsCard} data-testid="bucket-modal-secure-defaults">
					<div className={styles.secureDefaultsHeader}>
						<div className={styles.secureDefaultsCopy}>
							<Typography.Text strong>Secure Defaults</Typography.Text>
							<Typography.Text type="secondary">
								Start new Azure containers with private anonymous access, then optionally seed stored access policies during creation.
							</Typography.Text>
							<Tag color="green" variant="filled">
								Private baseline
							</Tag>
						</div>
						<ToggleSwitch
							checked={azureDefaults.enabled}
							onChange={(checked) => {
								setSubmitError(null)
								setAzureDefaults((current) => ({ ...current, enabled: checked }))
							}}
							ariaLabel="Apply recommended Azure secure defaults"
						/>
					</div>

					{azureDefaults.enabled ? (
						<>
							<Alert
								type="info"
								showIcon
								className={styles.providerDefaultsHint}
								title="Current create-time Azure controls are limited"
								description="Anonymous access visibility and stored access policies are available here. Immutability, versioning, and broader account-level governance still need post-create controls."
							/>
							<div className={styles.secureDefaultsGrid}>
								<section className={styles.settingCard}>
									<div className={styles.settingCopy}>
										<Typography.Text strong>Anonymous Access</Typography.Text>
										<Typography.Text type="secondary">Keep anonymous access private unless the container must serve blobs publicly.</Typography.Text>
									</div>
									<div className={styles.settingBody}>
										<FormField label="Visibility" htmlFor="bucket-create-azure-visibility">
											<NativeSelect
												id="bucket-create-azure-visibility"
												value={azureDefaults.visibility}
												onChange={(value) => {
													setSubmitError(null)
													setAzureDefaults((current) => ({
														...current,
														visibility: (value === 'blob' || value === 'container' ? value : 'private') as AzureVisibilityMode,
													}))
												}}
												options={[
													{ value: 'private', label: 'Private' },
													{ value: 'blob', label: 'Blob' },
													{ value: 'container', label: 'Container' },
												]}
												ariaLabel="Azure visibility"
											/>
										</FormField>
									</div>
								</section>

								<section className={styles.settingCard}>
									<div className={styles.settingHeader}>
										<div className={styles.settingCopy}>
											<Typography.Text strong>Stored access policies</Typography.Text>
											<Typography.Text type="secondary">Optionally seed SAS-scoped stored access policies with structured fields.</Typography.Text>
										</div>
										<ToggleSwitch
											checked={azureDefaults.storedPoliciesEnabled}
											onChange={(checked) => {
												setSubmitError(null)
												setAzureDefaults((current) => ({ ...current, storedPoliciesEnabled: checked }))
											}}
											ariaLabel="Seed Azure stored access policies during creation"
										/>
									</div>
									{azureDefaults.storedPoliciesEnabled ? (
										<div className={styles.settingBody}>
											{azureDefaults.storedPolicies.length === 0 ? (
												<Typography.Text type="secondary">No stored access policies</Typography.Text>
											) : (
												<div className={styles.structuredCardList}>
													{azureDefaults.storedPolicies.map((row, index) => (
														<section key={row.key} className={styles.structuredCard}>
															<div className={styles.structuredCardHeader}>
																<Typography.Text strong>{`Stored access policy ${index + 1}`}</Typography.Text>
																<Button
																	danger
																	size="small"
																	onClick={() =>
																		setAzureDefaults((current) => ({
																			...current,
																			storedPolicies: current.storedPolicies.filter((policy) => policy.key !== row.key),
																		}))
																	}
																>
																	Remove
																</Button>
															</div>
															<div className={styles.structuredFieldGrid}>
																<div className={styles.structuredField}>
																	<Typography.Text type="secondary" className={styles.structuredFieldLabel}>
																		ID
																	</Typography.Text>
																	<Input
																		value={row.id}
																		aria-label={`Azure stored access policy ${index + 1} id`}
																		onChange={(e) => {
																			const value = e.target.value
																			setSubmitError(null)
																			setAzureDefaults((current) => ({
																				...current,
																				storedPolicies: current.storedPolicies.map((policy) =>
																					policy.key === row.key ? { ...policy, id: value } : policy,
																				),
																			}))
																		}}
																		placeholder="readonly"
																	/>
																</div>
																<div className={styles.structuredField}>
																	<Typography.Text type="secondary" className={styles.structuredFieldLabel}>
																		Start
																	</Typography.Text>
																	<Input
																		value={row.start}
																		aria-label={`Azure stored access policy ${index + 1} start`}
																		onChange={(e) => {
																			const value = e.target.value
																			setSubmitError(null)
																			setAzureDefaults((current) => ({
																				...current,
																				storedPolicies: current.storedPolicies.map((policy) =>
																					policy.key === row.key ? { ...policy, start: value } : policy,
																				),
																			}))
																		}}
																		placeholder="2026-03-10T00:00:00Z"
																	/>
																</div>
																<div className={styles.structuredField}>
																	<Typography.Text type="secondary" className={styles.structuredFieldLabel}>
																		Expiry
																	</Typography.Text>
																	<Input
																		value={row.expiry}
																		aria-label={`Azure stored access policy ${index + 1} expiry`}
																		onChange={(e) => {
																			const value = e.target.value
																			setSubmitError(null)
																			setAzureDefaults((current) => ({
																				...current,
																				storedPolicies: current.storedPolicies.map((policy) =>
																					policy.key === row.key ? { ...policy, expiry: value } : policy,
																				),
																			}))
																		}}
																		placeholder="2026-03-31T00:00:00Z"
																	/>
																</div>
																<div className={styles.structuredField}>
																	<Typography.Text type="secondary" className={styles.structuredFieldLabel}>
																		Permission
																	</Typography.Text>
																	<Input
																		value={row.permission}
																		aria-label={`Azure stored access policy ${index + 1} permission`}
																		onChange={(e) => {
																			const value = e.target.value
																			setSubmitError(null)
																			setAzureDefaults((current) => ({
																				...current,
																				storedPolicies: current.storedPolicies.map((policy) =>
																					policy.key === row.key ? { ...policy, permission: value } : policy,
																				),
																			}))
																		}}
																		placeholder="rl"
																	/>
																</div>
															</div>
														</section>
													))}
												</div>
											)}
											<Button
												icon={<PlusOutlined />}
												disabled={azureDefaults.storedPolicies.length >= 5}
												onClick={() => {
													setSubmitError(null)
													setAzureDefaults((current) => ({
														...current,
														storedPolicies: [
															...current.storedPolicies,
															{ key: nextKey(), id: '', start: '', expiry: '', permission: '' },
														],
													}))
												}}
											>
												Add stored access policy
											</Button>
											<Typography.Text type="secondary" className={styles.inlineHint}>
												Permissions letters: r(read), w(write), d(delete), l(list), a(add), c(create), u(update), p(process)
											</Typography.Text>
										</div>
									) : null}
								</section>
							</div>
						</>
					) : null}
				</section>
			)
		}

		if (props.provider) {
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

		return null
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

				{submitError ? (
					<Alert type="error" showIcon title="Secure defaults are invalid" description={submitError} />
				) : null}

				{renderSecureDefaults()}
			</form>
		</DialogModal>
	)
}
