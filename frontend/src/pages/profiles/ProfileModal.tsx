import { Alert, Checkbox, Divider, Form, Input, Modal, Select, Space, Switch, Typography } from 'antd'

import type { ProfileTLSStatus } from '../../api/types'
import type { ProfileFormValues, TLSCapability } from './profileTypes'

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
	return /^\d+$/.test(value.trim())
		? Promise.resolve()
		: Promise.reject(new Error('Use digits only'))
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
	const [form] = Form.useForm<ProfileFormValues>()
	const provider = Form.useWatch('provider', form)
	const clearSessionToken = Form.useWatch('clearSessionToken', form)
	const gcpAnonymous = Form.useWatch('gcpAnonymous', form)
	const tlsEnabled = Form.useWatch('tlsEnabled', form)
	const tlsAction = Form.useWatch('tlsAction', form)
	const isS3Provider = provider === 'aws_s3' || provider === 's3_compatible' || provider === 'oci_s3_compat'
	const isOciObjectStorage = provider === 'oci_object_storage'
	const isAws = provider === 'aws_s3'
	const isAzure = provider === 'azure_blob'
	const isGcp = provider === 'gcp_gcs'
	const tlsUnavailable = props.tlsCapability?.enabled === false
	const tlsDisabledReason = props.tlsCapability?.reason ?? 'mTLS is disabled on the server.'
	const showTLSFields = !tlsUnavailable && (props.editMode ? tlsAction === 'enable' : !!tlsEnabled)
	const tlsStatusLabel = tlsUnavailable ? 'unavailable' : props.tlsStatusLoading ? 'loading...' : props.tlsStatus?.mode === 'mtls' ? 'enabled' : 'disabled'
	const showTLSStatusError = !tlsUnavailable && props.tlsStatusError
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

	return (
		<Modal
			open={props.open}
			title={props.title}
			okText={props.okText}
			okButtonProps={{ loading: props.loading }}
			onOk={() => form.submit()}
			onCancel={props.onCancel}
			destroyOnHidden
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{
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
					...props.initialValues,
				}}
				onFinish={(values) => props.onSubmit(values)}
			>
				<Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
					<Select
						disabled={!!props.editMode}
						options={[
							{ label: 'S3 Compatible (MinIO/Ceph/Custom)', value: 's3_compatible' },
							{ label: 'AWS S3', value: 'aws_s3' },
							{ label: 'Oracle OCI (S3 Compat)', value: 'oci_s3_compat' },
							{ label: 'Oracle OCI Object Storage (Native)', value: 'oci_object_storage' },
							{ label: 'Azure Blob Storage', value: 'azure_blob' },
							{ label: 'Google Cloud Storage (GCS)', value: 'gcp_gcs' },
						]}
					/>
				</Form.Item>
				{providerGuide ? (
					<Alert
						type="info"
						showIcon
						title="Provider setup hint"
						style={{ marginBottom: 12 }}
						description={
							<Space direction="vertical" size={2}>
								<Typography.Text type="secondary">{providerGuide.hint}</Typography.Text>
								<Typography.Link href={providerGuide.docsUrl} target="_blank" rel="noreferrer">
									Open provider setup docs
								</Typography.Link>
							</Space>
						}
					/>
				) : null}

				<Form.Item name="name" label="Name" rules={[{ required: true }]}>
					<Input />
				</Form.Item>

				{isS3Provider ? (
					<>
						<Form.Item
							name="endpoint"
							label={isAws ? 'Endpoint URL (optional)' : 'Endpoint URL'}
							rules={[
								...(isAws ? [] : [{ required: true }]),
								{ validator: (_, value) => validateOptionalHttpUrl(value) },
							]}
							extra={isAws ? 'Leave blank to use the AWS default endpoint.' : 'Use full URL including protocol (https://...).'}
						>
							<Input placeholder={isAws ? 'Leave blank for AWS default' : 'https://s3.example.com'} />
						</Form.Item>
						<Form.Item
							name="region"
							label="Region"
							rules={[{ required: true }, { validator: (_, value) => validateRegionLike(value) }]}
							extra="Example: us-east-1"
						>
							<Input placeholder="us-east-1…" />
						</Form.Item>
					</>
				) : null}

				{isOciObjectStorage ? (
					<>
						<Form.Item
							name="region"
							label="Region"
							rules={[{ required: true }, { validator: (_, value) => validateRegionLike(value) }]}
							extra="Example: us-ashburn-1"
						>
							<Input placeholder="us-ashburn-1…" />
						</Form.Item>
						<Form.Item name="ociNamespace" label="Namespace" rules={[{ required: true }]}>
							<Input placeholder="my-namespace…" />
						</Form.Item>
						<Form.Item
							name="ociCompartment"
							label="Compartment OCID"
							rules={[{ required: true }, { validator: (_, value) => validateOciCompartment(value) }]}
						>
							<Input placeholder="ocid1.compartment.oc1..…" />
						</Form.Item>
						<Form.Item
							name="ociEndpoint"
							label="Endpoint URL (optional)"
							rules={[{ validator: (_, value) => validateOptionalHttpUrl(value) }]}
						>
							<Input placeholder="https://objectstorage.{region}.oraclecloud.com…" />
						</Form.Item>
						<Form.Item name="ociAuthProvider" label="Auth Provider (optional)">
							<Input placeholder="instance_principal / api_key / resource_principal…" />
						</Form.Item>
						<Form.Item name="ociConfigFile" label="OCI Config File (optional)">
							<Input placeholder="/home/user/.oci/config…" />
						</Form.Item>
						<Form.Item name="ociConfigProfile" label="OCI Config Profile (optional)">
							<Input placeholder="DEFAULT…" />
						</Form.Item>
						<Typography.Text type="secondary">
							This uses rclone's oracleobjectstorage backend (native).
						</Typography.Text>
					</>
				) : null}

				{isAzure ? (
					<>
						<Form.Item
							name="azureAccountName"
							label="Storage Account Name"
							rules={[{ required: true }, { validator: (_, value) => validateAzureAccountName(value) }]}
							extra="3-24 lowercase letters or numbers."
						>
							<Input placeholder="mystorageaccount…" />
						</Form.Item>
						<Form.Item
							name="azureAccountKey"
							label={props.editMode ? 'Account Key (optional)' : 'Account Key'}
							rules={props.editMode ? [] : [{ required: true }]}
						>
							<Input.Password autoComplete="new-password" />
						</Form.Item>

						<Space size="large" wrap>
							<Form.Item name="azureUseEmulator" label="Use Emulator" valuePropName="checked">
								<Switch />
							</Form.Item>
						</Space>
						<Form.Item
							name="azureEndpoint"
							label="Endpoint URL (optional)"
							rules={[{ validator: (_, value) => validateOptionalHttpUrl(value) }]}
						>
							<Input placeholder="http://127.0.0.1:10000/devstoreaccount1…" />
						</Form.Item>
						<Typography.Text type="secondary">
							If "Use Emulator" is enabled and endpoint is blank, the server may use a default Azurite endpoint.
						</Typography.Text>
					</>
				) : null}
				{isGcp ? (
					<>
						<Space size="large" wrap>
							<Form.Item name="gcpAnonymous" label="Anonymous" valuePropName="checked">
								<Switch />
							</Form.Item>
						</Space>
						<Form.Item
							name="gcpEndpoint"
							label="Endpoint URL (optional)"
							rules={[{ validator: (_, value) => validateOptionalHttpUrl(value) }]}
						>
							<Input placeholder="https://storage.googleapis.com…" />
						</Form.Item>
						<Form.Item
							name="gcpProjectNumber"
							label="Project Number (optional)"
							rules={[{ validator: (_, value) => validateDigitsOnly(value) }]}
						>
							<Input placeholder="123456789012…" />
						</Form.Item>

						{gcpAnonymous ? (
							<Typography.Text type="secondary">
								Anonymous mode does not use credentials. Only works if the endpoint allows unauthenticated access.
							</Typography.Text>
						) : (
							<Form.Item
								name="gcpServiceAccountJson"
								label={props.editMode ? 'Service Account JSON (optional)' : 'Service Account JSON'}
								rules={[
									...(props.editMode ? [] : [{ required: true }]),
									{ validator: (_, value) => validateJsonDocument(value) },
								]}
							>
								<Input.TextArea
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
							</Form.Item>
						)}
					</>
				) : null}
				{isS3Provider ? (
					<>
						<Space style={{ width: '100%' }} size="middle" align="start" wrap>
							<Form.Item
								name="accessKeyId"
								label={props.editMode ? 'Access Key ID (optional)' : 'Access Key ID'}
								rules={props.editMode ? [] : [{ required: true }]}
								style={{ flex: '1 1 260px', minWidth: 0 }}
							>
								<Input autoComplete="username" />
							</Form.Item>
							<Form.Item
								name="secretAccessKey"
								label={props.editMode ? 'Secret (optional)' : 'Secret'}
								rules={props.editMode ? [] : [{ required: true }]}
								style={{ flex: '1 1 260px', minWidth: 0 }}
							>
								<Input.Password autoComplete="new-password" />
							</Form.Item>
						</Space>

						<Form.Item name="sessionToken" label="Session Token (optional)">
							<Input.Password autoComplete="off" disabled={!!props.editMode && clearSessionToken} />
						</Form.Item>
						{props.editMode ? (
							<Form.Item name="clearSessionToken" valuePropName="checked">
								<Checkbox>Clear existing session token</Checkbox>
							</Form.Item>
						) : null}
					</>
				) : null}

				<Space size="large" wrap>
					{isS3Provider ? (
						<Form.Item name="forcePathStyle" label="Force Path Style" valuePropName="checked">
							<Switch />
						</Form.Item>
					) : null}
					<Form.Item name="preserveLeadingSlash" label="Preserve Leading Slash" valuePropName="checked">
						<Switch />
					</Form.Item>
					<Form.Item name="tlsInsecureSkipVerify" label="TLS Insecure Skip Verify" valuePropName="checked">
						<Switch />
					</Form.Item>
				</Space>

				<Divider />

				<Space orientation="vertical" size="small" style={{ width: '100%' }}>
					<Typography.Text strong>Advanced TLS (mTLS)</Typography.Text>
					{tlsUnavailable ? <Alert type="warning" showIcon title="mTLS is disabled" description={tlsDisabledReason} /> : null}
					{props.editMode ? (
						<>
							<Typography.Text type="secondary">
								Current: {tlsStatusLabel}
							</Typography.Text>
							{showTLSStatusError ? (
								<Alert type="warning" showIcon title="Failed to load TLS status" description={showTLSStatusError} />
							) : null}
							<Form.Item name="tlsAction" label="mTLS action">
								<Select
									disabled={tlsUnavailable}
									options={[
										{ label: 'Keep current', value: 'keep' },
										{ label: 'Enable or update', value: 'enable' },
										{ label: 'Disable', value: 'disable' },
									]}
								/>
							</Form.Item>
							{tlsAction === 'disable' ? (
								<Typography.Text type="secondary">mTLS will be removed for this profile.</Typography.Text>
							) : null}
						</>
					) : (
						<Form.Item name="tlsEnabled" label="Enable mTLS" valuePropName="checked">
							<Switch disabled={tlsUnavailable} />
						</Form.Item>
					)}

					{showTLSFields ? (
						<>
							<Form.Item
								name="tlsClientCertPem"
								label="Client Certificate (PEM)"
								rules={[{ required: true, message: 'Client certificate is required' }]}
							>
								<Input.TextArea
									disabled={tlsUnavailable}
									autoSize={{ minRows: 4, maxRows: 8 }}
									placeholder="-----BEGIN CERTIFICATE-----…"
								/>
							</Form.Item>
							<Form.Item
								name="tlsClientKeyPem"
								label="Client Key (PEM)"
								rules={[{ required: true, message: 'Client key is required' }]}
							>
								<Input.TextArea
									disabled={tlsUnavailable}
									autoSize={{ minRows: 4, maxRows: 8 }}
									placeholder="-----BEGIN PRIVATE KEY-----…"
								/>
							</Form.Item>
							<Form.Item name="tlsCaCertPem" label="CA Certificate (optional)">
								<Input.TextArea
									disabled={tlsUnavailable}
									autoSize={{ minRows: 3, maxRows: 6 }}
									placeholder="-----BEGIN CERTIFICATE-----…"
								/>
							</Form.Item>
						</>
					) : null}
				</Space>
			</Form>
		</Modal>
	)
}
