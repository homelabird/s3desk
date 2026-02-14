import { Alert, Checkbox, Divider, Input, Modal, Space, Switch, Typography, message } from 'antd'
import { useMemo, useState } from 'react'

import type { ProfileTLSStatus } from '../../api/types'
import { FormField } from '../../components/FormField'
import { NativeSelect } from '../../components/NativeSelect'
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

	const [values, setValues] = useState<ProfileFormValues>(() => ({ ...defaults, ...(props.initialValues ?? {}) }))
	const [errors, setErrors] = useState<FieldErrors>({})

	const provider = values.provider
	const isS3Provider = provider === 'aws_s3' || provider === 's3_compatible' || provider === 'oci_s3_compat'
	const isOciObjectStorage = provider === 'oci_object_storage'
	const isAws = provider === 'aws_s3'
	const isAzure = provider === 'azure_blob'
	const isGcp = provider === 'gcp_gcs'

	const tlsUnavailable = props.tlsCapability?.enabled === false
	const tlsDisabledReason = props.tlsCapability?.reason ?? 'mTLS is disabled on the server.'
	const tlsStatusLabel = tlsUnavailable
		? 'unavailable'
		: props.tlsStatusLoading
			? 'loading…'
			: props.tlsStatus?.mode === 'mtls'
				? 'enabled'
				: 'disabled'
	const showTLSStatusError = !tlsUnavailable && props.tlsStatusError

	const tlsAction = (values.tlsAction ?? 'keep') as TLSAction
	const showTLSFields = !tlsUnavailable && (props.editMode ? tlsAction === 'enable' : !!values.tlsEnabled)

	const providerGuide = (() => {
		switch (provider) {
			case 'aws_s3':
				return {
					hint: 'Use AWS region code (for example us-east-1). Endpoint is usually left empty.',
					docsUrl: 'https://rclone.org/s3/#amazon-s3',
				}
			case 's3_compatible':
				return {
					hint: 'Set the full endpoint URL and keep region consistent with your server.',
					docsUrl: 'https://rclone.org/s3/',
				}
			case 'oci_s3_compat':
				return {
					hint: 'Use OCI S3-compatible endpoint + region + access keys.',
					docsUrl: 'https://rclone.org/s3/#oracle-oci-object-storage',
				}
			case 'oci_object_storage':
				return {
					hint: 'Use namespace, compartment OCID, and region for native OCI backend.',
					docsUrl: 'https://rclone.org/oracleobjectstorage/',
				}
			case 'azure_blob':
				return {
					hint: 'Account name is lowercase only. Use emulator mode for Azurite.',
					docsUrl: 'https://rclone.org/azureblob/',
				}
			case 'gcp_gcs':
				return {
					hint: 'Use Service Account JSON unless anonymous mode is intended.',
					docsUrl: 'https://rclone.org/googlecloudstorage/',
				}
			default:
				return null
		}
	})()

	const setField = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
		setValues((prev) => ({ ...prev, [key]: value }))
		setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
	}

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
			message.error('Fix the highlighted fields.')
			return
		}

		props.onSubmit(values)
	}

	return (
		<Modal
			open={props.open}
			title={props.title}
			okText={props.okText}
			okButtonProps={{ loading: props.loading }}
			onOk={() => {
				void validateAndSubmit()
			}}
			onCancel={props.onCancel}
			destroyOnHidden
		>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					void validateAndSubmit()
				}}
			>
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

				{providerGuide ? (
					<Alert
						type="info"
						showIcon
						title="Provider setup hint"
						style={{ marginBottom: 12 }}
						description={
							<Space direction="vertical" size={2}>
								<Typography.Text type="secondary">{providerGuide.hint}</Typography.Text>
								<Typography.Link href={providerGuide.docsUrl} target="_blank" rel="noopener noreferrer">
									Open provider setup docs (new tab)
								</Typography.Link>
							</Space>
						}
					/>
				) : null}

				<FormField label="Name" required error={errors.name}>
					<Input value={values.name} onChange={(e) => setField('name', e.target.value)} autoComplete="off" aria-label="Name" />
				</FormField>

				{isS3Provider ? (
					<>
						<FormField
							label={isAws ? 'Endpoint URL (optional)' : 'Endpoint URL'}
							required={!isAws}
							extra={isAws ? 'Leave blank to use the AWS default endpoint.' : 'Use full URL including protocol (https://…).'}
							error={errors.endpoint}
						>
							<Input
								value={values.endpoint}
								onChange={(e) => setField('endpoint', e.target.value)}
								placeholder={isAws ? 'Leave blank for AWS default' : 'https://s3.example.com'}
								autoComplete="off"
								aria-label={isAws ? 'Endpoint URL (optional)' : 'Endpoint URL'}
							/>
						</FormField>

						<FormField label="Region" required extra="Example: us-east-1" error={errors.region}>
							<Input value={values.region} onChange={(e) => setField('region', e.target.value)} placeholder="us-east-1…" aria-label="Region" />
						</FormField>
					</>
				) : null}

				{isOciObjectStorage ? (
					<>
						<FormField label="Region" required extra="Example: us-ashburn-1" error={errors.region}>
							<Input value={values.region} onChange={(e) => setField('region', e.target.value)} placeholder="us-ashburn-1…" />
						</FormField>

						<FormField label="Namespace" required error={errors.ociNamespace}>
							<Input value={values.ociNamespace} onChange={(e) => setField('ociNamespace', e.target.value)} placeholder="my-namespace…" />
						</FormField>

						<FormField label="Compartment OCID" required error={errors.ociCompartment}>
							<Input
								value={values.ociCompartment}
								onChange={(e) => setField('ociCompartment', e.target.value)}
								placeholder="ocid1.compartment.oc1..…"
							/>
						</FormField>

						<FormField label="Endpoint URL (optional)" error={errors.ociEndpoint}>
							<Input
								value={values.ociEndpoint}
								onChange={(e) => setField('ociEndpoint', e.target.value)}
								placeholder="https://objectstorage.{region}.oraclecloud.com…"
							/>
						</FormField>

						<FormField label="Auth Provider (optional)">
							<Input
								value={values.ociAuthProvider}
								onChange={(e) => setField('ociAuthProvider', e.target.value)}
								placeholder="instance_principal / api_key / resource_principal…"
							/>
						</FormField>

						<FormField label="OCI Config File (optional)">
							<Input
								value={values.ociConfigFile}
								onChange={(e) => setField('ociConfigFile', e.target.value)}
								placeholder="/home/user/.oci/config…"
							/>
						</FormField>

						<FormField label="OCI Config Profile (optional)">
							<Input
								value={values.ociConfigProfile}
								onChange={(e) => setField('ociConfigProfile', e.target.value)}
								placeholder="DEFAULT…"
							/>
						</FormField>

						<Typography.Text type="secondary">This uses rclone's oracleobjectstorage backend (native).</Typography.Text>
					</>
				) : null}

				{isAzure ? (
					<>
						<FormField label="Storage Account Name" required extra="3-24 lowercase letters or numbers." error={errors.azureAccountName}>
							<Input
								value={values.azureAccountName}
								onChange={(e) => setField('azureAccountName', e.target.value)}
								placeholder="mystorageaccount…"
							/>
						</FormField>

						<FormField label={props.editMode ? 'Account Key (optional)' : 'Account Key'} required={!props.editMode} error={errors.azureAccountKey}>
							<Input.Password
								value={values.azureAccountKey}
								onChange={(e) => setField('azureAccountKey', e.target.value)}
								autoComplete="new-password"
							/>
						</FormField>

						<div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
							<FormField label="Use Emulator" style={{ marginBottom: 0 }}>
								<Switch checked={values.azureUseEmulator} onChange={(checked) => setField('azureUseEmulator', checked)} />
							</FormField>
						</div>

						<FormField label="Endpoint URL (optional)" error={errors.azureEndpoint}>
							<Input
								value={values.azureEndpoint}
								onChange={(e) => setField('azureEndpoint', e.target.value)}
								placeholder="http://127.0.0.1:10000/devstoreaccount1…"
							/>
						</FormField>

						<Typography.Text type="secondary">
							If "Use Emulator" is enabled and endpoint is blank, the server may use a default Azurite endpoint.
						</Typography.Text>
					</>
				) : null}

				{isGcp ? (
					<>
						<div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
							<FormField label="Anonymous" style={{ marginBottom: 0 }}>
								<Switch checked={values.gcpAnonymous} onChange={(checked) => setField('gcpAnonymous', checked)} />
							</FormField>
						</div>

						<FormField label="Endpoint URL (optional)" error={errors.gcpEndpoint}>
							<Input
								value={values.gcpEndpoint}
								onChange={(e) => setField('gcpEndpoint', e.target.value)}
								placeholder="https://storage.googleapis.com…"
							/>
						</FormField>

						<FormField label="Project Number (optional)" error={errors.gcpProjectNumber}>
							<Input
								value={values.gcpProjectNumber}
								onChange={(e) => setField('gcpProjectNumber', e.target.value)}
								placeholder="123456789012…"
							/>
						</FormField>

						{values.gcpAnonymous ? (
							<Typography.Text type="secondary">
								Anonymous mode does not use credentials. Only works if the endpoint allows unauthenticated access.
							</Typography.Text>
						) : (
							<FormField
								label={props.editMode ? 'Service Account JSON (optional)' : 'Service Account JSON'}
								required={!props.editMode}
								error={errors.gcpServiceAccountJson}
							>
								<Input.TextArea
									value={values.gcpServiceAccountJson}
									onChange={(e) => setField('gcpServiceAccountJson', e.target.value)}
									autoSize={{ minRows: 6, maxRows: 12 }}
									placeholder={`{
  "type": "service_account_json",
  "project_id": "example-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "example@project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}`}
								/>
							</FormField>
						)}
					</>
				) : null}

				{isS3Provider ? (
					<>
						<div style={{ display: 'flex', width: '100%', gap: 12, flexWrap: 'wrap' }}>
							<FormField
								label={props.editMode ? 'Access Key ID (optional)' : 'Access Key ID'}
								required={!props.editMode}
								error={errors.accessKeyId}
								style={{ flex: '1 1 260px', minWidth: 0 }}
							>
								<Input
									value={values.accessKeyId}
									onChange={(e) => setField('accessKeyId', e.target.value)}
									autoComplete="username"
									aria-label={props.editMode ? 'Access Key ID (optional)' : 'Access Key ID'}
								/>
							</FormField>
							<FormField
								label={props.editMode ? 'Secret (optional)' : 'Secret'}
								required={!props.editMode}
								error={errors.secretAccessKey}
								style={{ flex: '1 1 260px', minWidth: 0 }}
							>
								<Input.Password
									value={values.secretAccessKey}
									onChange={(e) => setField('secretAccessKey', e.target.value)}
									autoComplete="new-password"
									aria-label={props.editMode ? 'Secret (optional)' : 'Secret'}
								/>
							</FormField>
						</div>

						<FormField label="Session Token (optional)">
							<Input.Password
								value={values.sessionToken ?? ''}
								onChange={(e) => setField('sessionToken', e.target.value)}
								autoComplete="off"
								disabled={!!props.editMode && !!values.clearSessionToken}
							/>
						</FormField>

						{props.editMode ? (
							<div style={{ marginBottom: 12 }}>
								<Checkbox
									checked={!!values.clearSessionToken}
									onChange={(e) => setField('clearSessionToken', e.target.checked)}
								>
									Clear existing session token
								</Checkbox>
							</div>
						) : null}
					</>
				) : null}

				<div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
					{isS3Provider ? (
						<FormField label="Force Path Style" style={{ marginBottom: 0 }}>
							<Switch checked={values.forcePathStyle} onChange={(checked) => setField('forcePathStyle', checked)} aria-label="Force Path Style" />
						</FormField>
					) : null}
					<FormField label="Preserve Leading Slash" style={{ marginBottom: 0 }}>
						<Switch
							checked={values.preserveLeadingSlash}
							onChange={(checked) => setField('preserveLeadingSlash', checked)}
						/>
					</FormField>
					<FormField label="TLS Insecure Skip Verify" style={{ marginBottom: 0 }}>
						<Switch
							checked={values.tlsInsecureSkipVerify}
							onChange={(checked) => setField('tlsInsecureSkipVerify', checked)}
							aria-label="TLS Insecure Skip Verify"
						/>
					</FormField>
				</div>

				<Divider />

				<Space orientation="vertical" size="small" style={{ width: '100%' }}>
					<Typography.Text strong>Advanced TLS (mTLS)</Typography.Text>
					{tlsUnavailable ? (
						<Alert type="warning" showIcon title="mTLS is disabled" description={tlsDisabledReason} />
					) : null}
					{props.editMode ? (
						<>
							<Typography.Text type="secondary">Current: {tlsStatusLabel}</Typography.Text>
							{showTLSStatusError ? (
								<Alert type="warning" showIcon title="Failed to load TLS status" description={showTLSStatusError} />
								) : null}
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
							{tlsAction === 'disable' ? (
								<Typography.Text type="secondary">mTLS will be removed for this profile.</Typography.Text>
							) : null}
						</>
					) : (
						<FormField label="Enable mTLS">
							<Switch
								disabled={tlsUnavailable}
								checked={!!values.tlsEnabled}
								onChange={(checked) => setField('tlsEnabled', checked)}
							/>
						</FormField>
					)}

					{showTLSFields ? (
						<>
							<FormField label="Client Certificate (PEM)" required error={errors.tlsClientCertPem}>
								<Input.TextArea
									disabled={tlsUnavailable}
									value={values.tlsClientCertPem ?? ''}
									onChange={(e) => setField('tlsClientCertPem', e.target.value)}
									autoSize={{ minRows: 4, maxRows: 8 }}
									placeholder="-----BEGIN CERTIFICATE-----…"
								/>
							</FormField>
							<FormField label="Client Key (PEM)" required error={errors.tlsClientKeyPem}>
								<Input.TextArea
									disabled={tlsUnavailable}
									value={values.tlsClientKeyPem ?? ''}
									onChange={(e) => setField('tlsClientKeyPem', e.target.value)}
									autoSize={{ minRows: 4, maxRows: 8 }}
									placeholder="-----BEGIN PRIVATE KEY-----…"
								/>
							</FormField>
							<FormField label="CA Certificate (optional)">
								<Input.TextArea
									disabled={tlsUnavailable}
									value={values.tlsCaCertPem ?? ''}
									onChange={(e) => setField('tlsCaCertPem', e.target.value)}
									autoSize={{ minRows: 3, maxRows: 6 }}
									placeholder="-----BEGIN CERTIFICATE-----…"
								/>
							</FormField>
						</>
					) : null}
				</Space>
			</form>
		</Modal>
	)
}
