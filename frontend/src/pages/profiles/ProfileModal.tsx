import { LinkOutlined, LockOutlined, SettingOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Collapse, Drawer, Grid, Input, Space, Switch, Tag, Typography, message } from 'antd'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ProfileTLSStatus } from '../../api/types'
import { FormField } from '../../components/FormField'
import { NativeSelect } from '../../components/NativeSelect'
import styles from './ProfileModal.module.css'
import type { ProfileFormValues, TLSCapability, TLSAction } from './profileTypes'

function validateOptionalHttpUrl(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	try {
		const parsed = new URL(value.trim())
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return Promise.reject(new Error('Endpoint URL must start with http:// or https://'))
		}
		return Promise.resolve()
	} catch {
		return Promise.reject(new Error('Enter a valid endpoint URL (including protocol)'))
	}
}

function validateRegionLike(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	return /^[a-z0-9-]+$/.test(value.trim())
		? Promise.resolve()
		: Promise.reject(new Error('Use lowercase letters, numbers, and hyphens only'))
}

function validateDigitsOnly(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	return /^\d+$/.test(value.trim()) ? Promise.resolve() : Promise.reject(new Error('Use digits only'))
}

function validateJsonDocument(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	try {
		JSON.parse(value)
		return Promise.resolve()
	} catch {
		return Promise.reject(new Error('Enter valid JSON'))
	}
}

function validateAzureAccountName(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	return /^[a-z0-9]{3,24}$/.test(value.trim())
		? Promise.resolve()
		: Promise.reject(new Error('Use 3-24 lowercase letters or numbers'))
}

function validateOciCompartment(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	return value.trim().startsWith('ocid1.compartment.')
		? Promise.resolve()
		: Promise.reject(new Error('Expected OCID that starts with ocid1.compartment.'))
}

function isBlank(value: unknown): boolean {
	return typeof value !== 'string' ? !value : !value.trim()
}

type FieldErrors = Partial<Record<keyof ProfileFormValues, string>>
type SectionKey = 'basic' | 'credentials' | 'advanced' | 'security'

const DEFAULT_CREATE_SECTIONS: SectionKey[] = ['basic', 'credentials']
const DEFAULT_EDIT_SECTIONS: SectionKey[] = ['basic']
const PROVIDER_LABELS: Record<ProfileFormValues['provider'], string> = {
	s3_compatible: 'S3 Compatible',
	aws_s3: 'AWS S3',
	oci_s3_compat: 'OCI S3 Compat',
	oci_object_storage: 'OCI Object Storage',
	azure_blob: 'Azure Blob',
	gcp_gcs: 'Google Cloud Storage',
}
const FIELD_SECTION_MAP: Partial<Record<keyof ProfileFormValues, SectionKey>> = {
	provider: 'basic',
	name: 'basic',
	endpoint: 'basic',
	region: 'basic',
	azureAccountName: 'basic',
	azureEndpoint: 'basic',
	gcpEndpoint: 'basic',
	gcpProjectNumber: 'basic',
	ociNamespace: 'basic',
	ociCompartment: 'basic',
	ociEndpoint: 'basic',
	accessKeyId: 'credentials',
	secretAccessKey: 'credentials',
	sessionToken: 'credentials',
	clearSessionToken: 'credentials',
	azureAccountKey: 'credentials',
	gcpAnonymous: 'credentials',
	gcpServiceAccountJson: 'credentials',
	ociAuthProvider: 'credentials',
	ociConfigFile: 'credentials',
	ociConfigProfile: 'credentials',
	forcePathStyle: 'advanced',
	preserveLeadingSlash: 'advanced',
	tlsInsecureSkipVerify: 'advanced',
	azureUseEmulator: 'advanced',
	tlsEnabled: 'security',
	tlsAction: 'security',
	tlsClientCertPem: 'security',
	tlsClientKeyPem: 'security',
	tlsCaCertPem: 'security',
}

function SectionHeader(props: { title: string; description: string; tags?: ReactNode }) {
	return (
		<div className={styles.sectionHeader}>
			<div className={styles.sectionText}>
				<Typography.Text className={styles.sectionTitle}>{props.title}</Typography.Text>
				<Typography.Text className={styles.sectionDescription}>{props.description}</Typography.Text>
			</div>
			{props.tags ? <div className={styles.sectionMeta}>{props.tags}</div> : null}
		</div>
	)
}

function SwitchCard(props: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; ariaLabel?: string }) {
	return (
		<div className={styles.switchCard}>
			<div className={styles.switchCardCopy}>
				<Typography.Text className={styles.switchCardTitle}>{props.title}</Typography.Text>
				<Typography.Text className={styles.switchCardDescription}>{props.description}</Typography.Text>
			</div>
			<Switch checked={props.checked} onChange={props.onChange} disabled={props.disabled} aria-label={props.ariaLabel ?? props.title} />
		</div>
	)
}

export function ProfileModal(props: {
	open: boolean
	title: string
	okText: string
	onCancel: () => void
	onSubmit: (values: ProfileFormValues) => void
	loading: boolean
	initialValues?: Partial<ProfileFormValues>
	editMode?: boolean
	tlsCapability?: TLSCapability | null
	tlsStatus?: ProfileTLSStatus | null
	tlsStatusLoading?: boolean
	tlsStatusError?: string | null
}) {
	const defaults: ProfileFormValues = useMemo(
		() => ({
			provider: 's3_compatible',
			name: '',
			endpoint: 'http://127.0.0.1:9000',
			region: 'us-east-1',
			accessKeyId: '',
			secretAccessKey: '',
			sessionToken: '',
			clearSessionToken: false,
			forcePathStyle: false,
			azureAccountName: '',
			azureAccountKey: '',
			azureEndpoint: '',
			azureUseEmulator: false,
			gcpAnonymous: false,
			gcpServiceAccountJson: '',
			gcpEndpoint: '',
			gcpProjectNumber: '',
			ociNamespace: '',
			ociCompartment: '',
			ociEndpoint: '',
			ociAuthProvider: '',
			ociConfigFile: '',
			ociConfigProfile: '',
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			tlsEnabled: false,
			tlsAction: 'keep',
			tlsClientCertPem: '',
			tlsClientKeyPem: '',
			tlsCaCertPem: '',
		}),
		[],
	)

	const screens = Grid.useBreakpoint()
	const [values, setValues] = useState<ProfileFormValues>(() => ({ ...defaults, ...(props.initialValues ?? {}) }))
	const [errors, setErrors] = useState<FieldErrors>({})
	const [openSections, setOpenSections] = useState<SectionKey[]>(props.editMode ? DEFAULT_EDIT_SECTIONS : DEFAULT_CREATE_SECTIONS)

	const provider = values.provider
	const isS3Provider = provider === 'aws_s3' || provider === 's3_compatible' || provider === 'oci_s3_compat'
	const isOciObjectStorage = provider === 'oci_object_storage'
	const isAws = provider === 'aws_s3'
	const isAzure = provider === 'azure_blob'
	const isGcp = provider === 'gcp_gcs'
	const providerLabel = PROVIDER_LABELS[provider]

	const tlsUnavailable = props.tlsCapability?.enabled === false
	const tlsDisabledReason = props.tlsCapability?.reason ?? 'mTLS is disabled on the server.'
	const tlsStatusLabel = tlsUnavailable
		? 'Unavailable'
		: props.tlsStatusLoading
			? 'Checking…'
			: props.tlsStatus?.mode === 'mtls'
				? 'mTLS enabled'
				: 'mTLS disabled'
	const showTLSStatusError = !tlsUnavailable && props.tlsStatusError

	const tlsAction = (values.tlsAction ?? 'keep') as TLSAction
	const showTLSFields = !tlsUnavailable && (props.editMode ? tlsAction === 'enable' : !!values.tlsEnabled)

	const providerGuide = (() => {
		switch (provider) {
			case 'aws_s3':
				return {
					hint: 'Use your AWS region. Leave endpoint blank unless you need a custom gateway.',
					docsUrl: 'https://rclone.org/s3/#amazon-s3',
				}
			case 's3_compatible':
				return {
					hint: 'Use the full endpoint URL. MinIO and Ceph usually also need Force Path Style in Advanced options.',
					docsUrl: 'https://rclone.org/s3/',
				}
			case 'oci_s3_compat':
				return {
					hint: 'Use the OCI S3-compatible endpoint, region, and S3-style keys.',
					docsUrl: 'https://rclone.org/s3/#oracle-oci-object-storage',
				}
			case 'oci_object_storage':
				return {
					hint: 'Use the native OCI backend when you want namespace and compartment-aware access.',
					docsUrl: 'https://rclone.org/oracleobjectstorage/',
				}
			case 'azure_blob':
				return {
					hint: 'Storage account name is required. Emulator mode is only for local Azurite-style setups.',
					docsUrl: 'https://rclone.org/azureblob/',
				}
			case 'gcp_gcs':
				return {
					hint: 'Service Account JSON is the standard path unless you intentionally need anonymous access.',
					docsUrl: 'https://rclone.org/googlecloudstorage/',
				}
			default:
				return null
		}
	})()

	const drawerPlacement = screens.md ? 'right' : 'bottom'
	useEffect(() => {
		if (!props.open) return
		setOpenSections(props.editMode ? DEFAULT_EDIT_SECTIONS : DEFAULT_CREATE_SECTIONS)
	}, [props.editMode, props.open])

	const setField = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
		setValues((prev) => ({ ...prev, [key]: value }))
		setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
	}

	const ensureSectionsOpenForErrors = useCallback((nextErrors: FieldErrors) => {
		const nextSections = new Set(openSections)
		for (const key of Object.keys(nextErrors) as Array<keyof ProfileFormValues>) {
			const sectionKey = FIELD_SECTION_MAP[key]
			if (sectionKey) nextSections.add(sectionKey)
		}
		setOpenSections(Array.from(nextSections))
	}, [openSections])

	const validateAndSubmit = async () => {
		const next: FieldErrors = {}

		const addError = (key: keyof ProfileFormValues, msg: string) => {
			if (!next[key]) next[key] = msg
		}

		if (isBlank(values.provider)) addError('provider', 'Provider is required')
		if (isBlank(values.name)) addError('name', 'Name is required')

		if (isS3Provider) {
			if (!isAws && isBlank(values.endpoint)) addError('endpoint', 'Endpoint URL is required')
			try {
				await validateOptionalHttpUrl(values.endpoint)
			} catch (err) {
				addError('endpoint', (err as Error).message)
			}

			if (isBlank(values.region)) addError('region', 'Region is required')
			try {
				await validateRegionLike(values.region)
			} catch (err) {
				addError('region', (err as Error).message)
			}

			if (!props.editMode) {
				if (isBlank(values.accessKeyId)) addError('accessKeyId', 'Access Key ID is required')
				if (isBlank(values.secretAccessKey)) addError('secretAccessKey', 'Secret is required')
			}
		}

		if (isOciObjectStorage) {
			if (isBlank(values.region)) addError('region', 'Region is required')
			try {
				await validateRegionLike(values.region)
			} catch (err) {
				addError('region', (err as Error).message)
			}

			if (isBlank(values.ociNamespace)) addError('ociNamespace', 'Namespace is required')
			if (isBlank(values.ociCompartment)) addError('ociCompartment', 'Compartment OCID is required')
			try {
				await validateOciCompartment(values.ociCompartment)
			} catch (err) {
				addError('ociCompartment', (err as Error).message)
			}

			try {
				await validateOptionalHttpUrl(values.ociEndpoint)
			} catch (err) {
				addError('ociEndpoint', (err as Error).message)
			}
		}

		if (isAzure) {
			if (isBlank(values.azureAccountName)) addError('azureAccountName', 'Storage Account Name is required')
			try {
				await validateAzureAccountName(values.azureAccountName)
			} catch (err) {
				addError('azureAccountName', (err as Error).message)
			}

			if (!props.editMode && isBlank(values.azureAccountKey)) addError('azureAccountKey', 'Account Key is required')
			try {
				await validateOptionalHttpUrl(values.azureEndpoint)
			} catch (err) {
				addError('azureEndpoint', (err as Error).message)
			}
		}

		if (isGcp) {
			try {
				await validateOptionalHttpUrl(values.gcpEndpoint)
			} catch (err) {
				addError('gcpEndpoint', (err as Error).message)
			}

			try {
				await validateDigitsOnly(values.gcpProjectNumber)
			} catch (err) {
				addError('gcpProjectNumber', (err as Error).message)
			}

			if (!values.gcpAnonymous) {
				if (!props.editMode && isBlank(values.gcpServiceAccountJson)) {
					addError('gcpServiceAccountJson', 'Service Account JSON is required')
				}
				try {
					await validateJsonDocument(values.gcpServiceAccountJson)
				} catch (err) {
					addError('gcpServiceAccountJson', (err as Error).message)
				}
			}
		}

		if (showTLSFields) {
			if (isBlank(values.tlsClientCertPem)) addError('tlsClientCertPem', 'Client certificate is required')
			if (isBlank(values.tlsClientKeyPem)) addError('tlsClientKeyPem', 'Client key is required')
		}

		setErrors(next)
		if (Object.keys(next).length > 0) {
			ensureSectionsOpenForErrors(next)
			message.error('Fix the highlighted fields.')
			return
		}

		props.onSubmit(values)
	}

	const basicSection = (
		<div className={styles.sectionBody}>
			<div className={styles.formGrid}>
				<FormField label="Provider" required error={errors.provider}>
					<NativeSelect
						disabled={!!props.editMode}
						value={values.provider}
						onChange={(v) => setField('provider', v as ProfileFormValues['provider'])}
						options={[
							{ label: 'S3 Compatible (MinIO/Ceph/Custom)', value: 's3_compatible' },
							{ label: 'AWS S3', value: 'aws_s3' },
							{ label: 'Oracle OCI (S3 Compat)', value: 'oci_s3_compat' },
							{ label: 'Oracle OCI Object Storage (Native)', value: 'oci_object_storage' },
							{ label: 'Azure Blob Storage', value: 'azure_blob' },
							{ label: 'Google Cloud Storage (GCS)', value: 'gcp_gcs' },
						]}
						ariaLabel="Provider"
					/>
				</FormField>

				<FormField label="Name" required error={errors.name}>
					<Input value={values.name} onChange={(e) => setField('name', e.target.value)} autoComplete="off" aria-label="Name" placeholder="Production S3" />
				</FormField>
			</div>

			{providerGuide ? (
				<div className={styles.providerGuide}>
					<Space size={8} align="center">
						<LinkOutlined />
						<Typography.Text strong>Provider setup hint</Typography.Text>
					</Space>
					<Typography.Text type="secondary">{providerGuide.hint}</Typography.Text>
					<Typography.Link href={providerGuide.docsUrl} target="_blank" rel="noopener noreferrer">
						Open provider setup docs
					</Typography.Link>
				</div>
			) : null}

			{isS3Provider ? (
				<div className={styles.formGrid}>
					<FormField label={isAws ? 'Endpoint URL (optional)' : 'Endpoint URL'} required={!isAws} error={errors.endpoint}>
						<Input
							value={values.endpoint}
							onChange={(e) => setField('endpoint', e.target.value)}
							placeholder={isAws ? 'Leave blank for AWS default' : 'https://s3.example.com'}
							autoComplete="off"
							aria-label={isAws ? 'Endpoint URL (optional)' : 'Endpoint URL'}
						/>
					</FormField>
					<FormField label="Region" required error={errors.region}>
						<Input value={values.region} onChange={(e) => setField('region', e.target.value)} placeholder="us-east-1" aria-label="Region" />
					</FormField>
				</div>
			) : null}

			{isOciObjectStorage ? (
				<div className={styles.formGrid}>
					<FormField label="Region" required error={errors.region}>
						<Input value={values.region} onChange={(e) => setField('region', e.target.value)} placeholder="us-ashburn-1" aria-label="Region" />
					</FormField>
					<FormField label="Namespace" required error={errors.ociNamespace}>
						<Input value={values.ociNamespace} onChange={(e) => setField('ociNamespace', e.target.value)} placeholder="my-namespace" aria-label="Namespace" />
					</FormField>
					<FormField label="Compartment OCID" required error={errors.ociCompartment}>
						<Input
							value={values.ociCompartment}
							onChange={(e) => setField('ociCompartment', e.target.value)}
							placeholder="ocid1.compartment.oc1..…"
							aria-label="Compartment OCID"
						/>
					</FormField>
					<FormField label="Endpoint URL (optional)" error={errors.ociEndpoint}>
						<Input
							value={values.ociEndpoint}
							onChange={(e) => setField('ociEndpoint', e.target.value)}
							placeholder="https://objectstorage.{region}.oraclecloud.com"
							aria-label="Endpoint URL (optional)"
						/>
					</FormField>
				</div>
			) : null}

			{isAzure ? (
				<div className={styles.formGrid}>
					<FormField label="Storage Account Name" required error={errors.azureAccountName}>
						<Input
							value={values.azureAccountName}
							onChange={(e) => setField('azureAccountName', e.target.value)}
							placeholder="mystorageaccount"
							aria-label="Storage Account Name"
						/>
					</FormField>
					<FormField label="Endpoint URL (optional)" error={errors.azureEndpoint}>
						<Input
							value={values.azureEndpoint}
							onChange={(e) => setField('azureEndpoint', e.target.value)}
							placeholder="http://127.0.0.1:10000/devstoreaccount1"
							aria-label="Endpoint URL (optional)"
						/>
					</FormField>
				</div>
			) : null}

			{isGcp ? (
				<div className={styles.formGrid}>
					<FormField label="Endpoint URL (optional)" error={errors.gcpEndpoint}>
						<Input
							value={values.gcpEndpoint}
							onChange={(e) => setField('gcpEndpoint', e.target.value)}
							placeholder="https://storage.googleapis.com"
							aria-label="Endpoint URL (optional)"
						/>
					</FormField>
					<FormField label="Project Number (optional)" error={errors.gcpProjectNumber}>
						<Input
							value={values.gcpProjectNumber}
							onChange={(e) => setField('gcpProjectNumber', e.target.value)}
							placeholder="123456789012"
							aria-label="Project Number (optional)"
						/>
					</FormField>
				</div>
			) : null}
		</div>
	)

	const credentialsSection = (
		<div className={styles.sectionBody}>
			<Typography.Text type="secondary" className={styles.sectionNote}>
				{props.editMode ? 'Leave credential fields blank to keep the existing stored values.' : 'Enter the auth material required by this provider.'}
			</Typography.Text>

			{isS3Provider ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Access Key ID" required={!props.editMode} error={errors.accessKeyId}>
							<Input
								value={values.accessKeyId}
								onChange={(e) => setField('accessKeyId', e.target.value)}
								autoComplete="username"
								aria-label="Access Key ID"
							/>
						</FormField>
						<FormField label="Secret" required={!props.editMode} error={errors.secretAccessKey}>
							<Input.Password
								value={values.secretAccessKey}
								onChange={(e) => setField('secretAccessKey', e.target.value)}
								autoComplete="new-password"
								aria-label="Secret"
							/>
						</FormField>
					</div>

					<div className={styles.formGrid}>
						<FormField label="Session Token (optional)">
							<Input.Password
								value={values.sessionToken ?? ''}
								onChange={(e) => setField('sessionToken', e.target.value)}
								autoComplete="off"
								aria-label="Session Token (optional)"
								disabled={!!props.editMode && !!values.clearSessionToken}
							/>
						</FormField>
					</div>

					{props.editMode ? (
						<div className={styles.checkboxRow}>
							<Checkbox checked={!!values.clearSessionToken} onChange={(e) => setField('clearSessionToken', e.target.checked)}>
								Clear existing session token
							</Checkbox>
						</div>
					) : null}
				</>
			) : null}

			{isAzure ? (
				<div className={styles.formGrid}>
					<FormField label="Account Key" required={!props.editMode} error={errors.azureAccountKey}>
						<Input.Password
							value={values.azureAccountKey}
							onChange={(e) => setField('azureAccountKey', e.target.value)}
							autoComplete="new-password"
							aria-label="Account Key"
						/>
					</FormField>
				</div>
			) : null}

			{isGcp ? (
				<>
					<div className={styles.toggleGrid}>
						<SwitchCard
							title="Anonymous"
							description="Skip credentials and only use public access."
							checked={values.gcpAnonymous}
							onChange={(checked) => setField('gcpAnonymous', checked)}
							ariaLabel="Anonymous"
						/>
					</div>

					{values.gcpAnonymous ? (
						<Typography.Text type="secondary" className={styles.sectionNote}>
							Anonymous mode only works when the endpoint allows unauthenticated access.
						</Typography.Text>
					) : (
						<FormField label="Service Account JSON" required={!props.editMode} error={errors.gcpServiceAccountJson}>
							<Input.TextArea
								value={values.gcpServiceAccountJson}
								onChange={(e) => setField('gcpServiceAccountJson', e.target.value)}
								autoSize={{ minRows: 8, maxRows: 14 }}
								aria-label="Service Account JSON"
								placeholder={`{
  "type": "service_account_json",
  "project_id": "example-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "example@project.iam.gserviceaccount.com"
}`}
							/>
						</FormField>
					)}
				</>
			) : null}

			{isOciObjectStorage ? (
				<div className={styles.formGrid}>
					<FormField label="Auth Provider (optional)">
						<Input
							value={values.ociAuthProvider}
							onChange={(e) => setField('ociAuthProvider', e.target.value)}
							placeholder="instance_principal / api_key / resource_principal"
							aria-label="Auth Provider (optional)"
						/>
					</FormField>
					<FormField label="OCI Config File (optional)">
						<Input
							value={values.ociConfigFile}
							onChange={(e) => setField('ociConfigFile', e.target.value)}
							placeholder="/home/user/.oci/config"
							aria-label="OCI Config File (optional)"
						/>
					</FormField>
					<FormField label="OCI Config Profile (optional)">
						<Input
							value={values.ociConfigProfile}
							onChange={(e) => setField('ociConfigProfile', e.target.value)}
							placeholder="DEFAULT"
							aria-label="OCI Config Profile (optional)"
						/>
					</FormField>
				</div>
			) : null}
		</div>
	)

	const advancedSection = (
		<div className={styles.sectionBody}>
			<Typography.Text type="secondary" className={styles.sectionNote}>
				Only change these when your provider requires non-default behavior.
			</Typography.Text>
			<div className={styles.toggleGrid}>
				{isS3Provider ? (
					<SwitchCard
						title="Force Path Style"
						description="Recommended for MinIO, Ceph, and most custom S3 gateways."
						checked={values.forcePathStyle}
						onChange={(checked) => setField('forcePathStyle', checked)}
						ariaLabel="Force Path Style"
					/>
				) : null}
				{isAzure ? (
					<SwitchCard
						title="Use Emulator"
						description="Enable this only for local Azurite or compatible emulators."
						checked={values.azureUseEmulator}
						onChange={(checked) => setField('azureUseEmulator', checked)}
						ariaLabel="Use Emulator"
					/>
				) : null}
				<SwitchCard
					title="Preserve Leading Slash"
					description="Keep a leading slash in object keys for strict S3 semantics."
					checked={values.preserveLeadingSlash}
					onChange={(checked) => setField('preserveLeadingSlash', checked)}
					ariaLabel="Preserve Leading Slash"
				/>
				<SwitchCard
					title="TLS Insecure Skip Verify"
					description="Skip certificate validation for self-signed or development endpoints."
					checked={values.tlsInsecureSkipVerify}
					onChange={(checked) => setField('tlsInsecureSkipVerify', checked)}
					ariaLabel="TLS Insecure Skip Verify"
				/>
			</div>
		</div>
	)

	const securitySection = (
		<div className={styles.sectionBody}>
			<div className={styles.securityStatusRow}>
				<Typography.Text type="secondary">Current status: {tlsStatusLabel}</Typography.Text>
				<Tag color={tlsUnavailable ? 'default' : props.tlsStatus?.mode === 'mtls' ? 'success' : 'default'}>{tlsStatusLabel}</Tag>
			</div>

			{tlsUnavailable ? <Alert type="warning" showIcon title="mTLS is disabled" description={tlsDisabledReason} /> : null}
			{showTLSStatusError ? <Alert type="warning" showIcon title="Failed to load TLS status" description={showTLSStatusError} /> : null}

			{props.editMode ? (
				<FormField label="mTLS action">
					<NativeSelect
						disabled={tlsUnavailable}
						value={tlsAction}
						onChange={(v) => setField('tlsAction', v as TLSAction)}
						options={[
							{ label: 'Keep current', value: 'keep' },
							{ label: 'Enable or update', value: 'enable' },
							{ label: 'Disable', value: 'disable' },
						]}
						ariaLabel="mTLS action"
					/>
				</FormField>
			) : (
				<div className={styles.toggleGrid}>
					<SwitchCard
						title="Enable mTLS"
						description="Attach a client certificate and key for mutual TLS."
						checked={!!values.tlsEnabled}
						onChange={(checked) => setField('tlsEnabled', checked)}
						disabled={tlsUnavailable}
						ariaLabel="Enable mTLS"
					/>
				</div>
			)}

			{props.editMode && tlsAction === 'disable' ? (
				<Typography.Text type="secondary" className={styles.sectionNote}>
					Saving will remove the current mTLS material from this profile.
				</Typography.Text>
			) : null}

			{showTLSFields ? (
				<>
					<FormField label="Client Certificate (PEM)" required error={errors.tlsClientCertPem}>
						<Input.TextArea
							disabled={tlsUnavailable}
							value={values.tlsClientCertPem ?? ''}
							onChange={(e) => setField('tlsClientCertPem', e.target.value)}
							autoSize={{ minRows: 5, maxRows: 10 }}
							aria-label="Client Certificate (PEM)"
							placeholder="-----BEGIN CERTIFICATE-----…"
						/>
					</FormField>
					<FormField label="Client Key (PEM)" required error={errors.tlsClientKeyPem}>
						<Input.TextArea
							disabled={tlsUnavailable}
							value={values.tlsClientKeyPem ?? ''}
							onChange={(e) => setField('tlsClientKeyPem', e.target.value)}
							autoSize={{ minRows: 5, maxRows: 10 }}
							aria-label="Client Key (PEM)"
							placeholder="-----BEGIN PRIVATE KEY-----…"
						/>
					</FormField>
					<FormField label="CA Certificate (optional)">
						<Input.TextArea
							disabled={tlsUnavailable}
							value={values.tlsCaCertPem ?? ''}
							onChange={(e) => setField('tlsCaCertPem', e.target.value)}
							autoSize={{ minRows: 4, maxRows: 8 }}
							aria-label="CA Certificate (optional)"
							placeholder="-----BEGIN CERTIFICATE-----…"
						/>
					</FormField>
				</>
			) : null}
		</div>
	)

	const sectionItems = [
		{
			key: 'basic',
			label: (
				<SectionHeader
					title="Basic Connection"
					description="Provider, display name, and the main endpoint or region values."
					tags={<Tag icon={<LinkOutlined />}>{providerLabel}</Tag>}
				/>
			),
			children: basicSection,
		},
		{
			key: 'credentials',
			label: (
				<SectionHeader
					title="Credentials"
					description="Secrets and auth material used to sign requests."
					tags={props.editMode ? <Tag color="default">Collapsed by default</Tag> : <Tag color="blue">Required on create</Tag>}
				/>
			),
			children: credentialsSection,
		},
		{
			key: 'advanced',
			label: (
				<SectionHeader
					title="Advanced Options"
					description="Compatibility and transport toggles for unusual environments."
					tags={<Tag icon={<SettingOutlined />}>Optional</Tag>}
				/>
			),
			children: advancedSection,
		},
		{
			key: 'security',
			label: (
				<SectionHeader
					title="Security & TLS"
					description="mTLS certificate material and connection trust settings."
					tags={<Tag icon={<SafetyCertificateOutlined />}>{tlsStatusLabel}</Tag>}
				/>
			),
			children: securitySection,
		},
	]

	return (
		<Drawer
			open={props.open}
			onClose={props.onCancel}
			title={props.title}
			placement={drawerPlacement}
			height="100%"
			styles={{
				wrapper: screens.md ? { width: 'min(92vw, 980px)' } : { height: '100dvh' },
				body: { padding: 20 },
				footer: { padding: 16 },
			}}
			footer={
				<div className={styles.drawerFooter}>
					<Button onClick={props.onCancel}>Cancel</Button>
					<Button type="primary" loading={props.loading} onClick={() => void validateAndSubmit()}>
						{props.okText}
					</Button>
				</div>
			}
			destroyOnHidden
		>
			<form
				onSubmit={(event) => {
					event.preventDefault()
					void validateAndSubmit()
				}}
			>
				<div className={styles.formShell}>
					<div className={styles.hero}>
						<div className={styles.heroCopy}>
							<Typography.Text className={styles.heroEyebrow}>Profiles</Typography.Text>
							<Typography.Text className={styles.heroDescription}>
								Configure connection details first, then open the advanced sections only if this provider needs them.
							</Typography.Text>
						</div>
						<div className={styles.heroMeta}>
							<Tag>{providerLabel}</Tag>
							<Tag icon={<LockOutlined />} color={props.editMode ? 'gold' : 'blue'}>
								{props.editMode ? 'Editing existing profile' : 'Creating new profile'}
							</Tag>
						</div>
					</div>

					<Collapse
						className={styles.sections}
						activeKey={openSections}
						onChange={(keys) => {
							const next = Array.isArray(keys) ? keys.map((key) => String(key) as SectionKey) : [String(keys) as SectionKey]
							setOpenSections(next)
						}}
						items={sectionItems}
					/>
				</div>
			</form>
		</Drawer>
	)
}
