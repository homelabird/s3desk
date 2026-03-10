import { Alert, Checkbox, Input, Tag, Typography } from 'antd'
import type { ReactNode } from 'react'

import { FormField } from '../../components/FormField'
import { NativeSelect } from '../../components/NativeSelect'
import styles from './ProfileModal.module.css'
import type { ProfileFormValues, TLSAction } from './profileTypes'
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

function countConfiguredValues(values: Array<string | null | undefined>) {
	return values.reduce((count, value) => (value && value.trim() ? count + 1 : count), 0)
}

function getConnectionSummary(viewState: ProfileModalViewState) {
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

function getCredentialsSummary(viewState: ProfileModalViewState, editMode?: boolean) {
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

function AdvancedFieldDisclosure({ title, description, configuredCount = 0, children }: AdvancedFieldDisclosureProps) {
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

export function buildBasicConnectionSection(args: ProfileModalSectionContentArgs) {
	const { values, errors, editMode, setField, viewState } = args

	return (
		<div className={styles.sectionBody}>
			<div className={styles.formGrid}>
				<FormField label="Provider" required error={errors.provider}>
					<NativeSelect
						disabled={!!editMode}
						value={values.provider}
						onChange={(v) => setField('provider', v as ProfileFormValues['provider'])}
						options={[
							{ label: 'S3 Compatible (MinIO/Ceph/Custom)', value: 's3_compatible' },
							{ label: 'AWS S3', value: 'aws_s3' },
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

			{viewState.providerGuide ? (
				<div className={styles.providerGuide}>
					<Typography.Text strong>Provider setup hint</Typography.Text>
					<Typography.Text type="secondary">{viewState.providerGuide.hint}</Typography.Text>
					<Typography.Link href={viewState.providerGuide.docsUrl} target="_blank" rel="noopener noreferrer">
						Open provider setup docs
					</Typography.Link>
				</div>
			) : null}

			<Alert type="info" showIcon message="Connection fields" description={getConnectionSummary(viewState)} />

			{viewState.isS3Provider ? (
				<>
					<div className={styles.formGrid}>
						<FormField label={viewState.isAws ? 'Endpoint URL (optional)' : 'Endpoint URL'} required={!viewState.isAws} error={errors.endpoint}>
							<Input
								value={values.endpoint}
								onChange={(e) => setField('endpoint', e.target.value)}
								placeholder={
									viewState.isAws
										? 'Leave blank for AWS default'
										: 'https://s3.example.com'
								}
								autoComplete="off"
								aria-label={viewState.isAws ? 'Endpoint URL (optional)' : 'Endpoint URL'}
							/>
						</FormField>
						<FormField label="Region" required error={errors.region}>
							<Input value={values.region} onChange={(e) => setField('region', e.target.value)} placeholder="us-east-1" aria-label="Region" />
						</FormField>
					</div>
					<AdvancedFieldDisclosure
						title="Browser-only endpoint override"
						description="Only set this when the browser must use a different hostname than the server for presigned uploads."
						configuredCount={countConfiguredValues([values.publicEndpoint])}
					>
						<div className={styles.formGrid}>
							<FormField label="Public Endpoint URL (optional)" error={errors.publicEndpoint}>
								<Input
									value={values.publicEndpoint}
									onChange={(e) => setField('publicEndpoint', e.target.value)}
									placeholder="http://127.0.0.1:9000"
									autoComplete="off"
									aria-label="Public Endpoint URL (optional)"
								/>
							</FormField>
						</div>
						<Typography.Text type="secondary" className={styles.sectionNote}>
							Use Public Endpoint when the server reaches storage through an internal hostname like <Typography.Text code>minio:9000</Typography.Text>,
							but the browser must use a different host like <Typography.Text code>127.0.0.1:9000</Typography.Text> for presigned uploads.
						</Typography.Text>
					</AdvancedFieldDisclosure>
				</>
			) : null}

			{viewState.isOciObjectStorage ? (
				<>
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
					</div>
					<AdvancedFieldDisclosure
						title="OCI endpoint override"
						description="Leave this closed unless you need to override the default regional endpoint."
						configuredCount={countConfiguredValues([values.ociEndpoint])}
					>
						<div className={styles.formGrid}>
							<FormField label="Endpoint URL (optional)" error={errors.ociEndpoint}>
								<Input
									value={values.ociEndpoint}
									onChange={(e) => setField('ociEndpoint', e.target.value)}
									placeholder="https://objectstorage.{region}.oraclecloud.com"
									aria-label="Endpoint URL (optional)"
								/>
							</FormField>
						</div>
					</AdvancedFieldDisclosure>
				</>
			) : null}

			{viewState.isAzure ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Storage Account Name" required error={errors.azureAccountName}>
							<Input
								value={values.azureAccountName}
								onChange={(e) => setField('azureAccountName', e.target.value)}
								placeholder="mystorageaccount"
								aria-label="Storage Account Name"
							/>
						</FormField>
					</div>
					<AdvancedFieldDisclosure
						title="Azure connection overrides"
						description="Open this only for Azurite, custom endpoints, or management-plane features."
						configuredCount={countConfiguredValues([
							values.azureEndpoint,
							values.azureSubscriptionId,
							values.azureResourceGroup,
							values.azureTenantId,
							values.azureClientId,
						])}
					>
						<div className={styles.formGrid}>
							<FormField label="Endpoint URL (optional)" error={errors.azureEndpoint}>
								<Input
									value={values.azureEndpoint}
									onChange={(e) => setField('azureEndpoint', e.target.value)}
									placeholder="http://127.0.0.1:10000/devstoreaccount1"
									aria-label="Endpoint URL (optional)"
								/>
							</FormField>
						</div>
						<div className={styles.formGrid}>
							<FormField label="Subscription ID (optional)" error={errors.azureSubscriptionId}>
								<Input
									value={values.azureSubscriptionId}
									onChange={(e) => setField('azureSubscriptionId', e.target.value)}
									placeholder="00000000-0000-0000-0000-000000000000"
									aria-label="Subscription ID (optional)"
								/>
							</FormField>
							<FormField label="Resource Group (optional)" error={errors.azureResourceGroup}>
								<Input
									value={values.azureResourceGroup}
									onChange={(e) => setField('azureResourceGroup', e.target.value)}
									placeholder="my-storage-rg"
									aria-label="Resource Group (optional)"
								/>
							</FormField>
						</div>
						<div className={styles.formGrid}>
							<FormField label="Tenant ID (optional)" error={errors.azureTenantId}>
								<Input
									value={values.azureTenantId}
									onChange={(e) => setField('azureTenantId', e.target.value)}
									placeholder="00000000-0000-0000-0000-000000000000"
									aria-label="Tenant ID (optional)"
								/>
							</FormField>
							<FormField label="Client ID (optional)" error={errors.azureClientId}>
								<Input
									value={values.azureClientId}
									onChange={(e) => setField('azureClientId', e.target.value)}
									placeholder="00000000-0000-0000-0000-000000000000"
									aria-label="Client ID (optional)"
								/>
							</FormField>
						</div>
						<Alert
							type="info"
							showIcon
							message="Azure ARM fields are optional for basic blob access"
							description="Fill Subscription ID, Resource Group, Tenant ID, Client ID, and Client Secret together when you want management-plane features such as container immutability editing."
						/>
					</AdvancedFieldDisclosure>
				</>
			) : null}

			{viewState.isGcp ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Project Number" required error={errors.gcpProjectNumber}>
							<Input
								value={values.gcpProjectNumber}
								onChange={(e) => setField('gcpProjectNumber', e.target.value)}
								placeholder="123456789012"
								aria-label="Project Number"
							/>
						</FormField>
					</div>
					<AdvancedFieldDisclosure
						title="GCS endpoint override"
						description="Only open this when you are targeting a non-default endpoint."
						configuredCount={countConfiguredValues([values.gcpEndpoint])}
					>
						<div className={styles.formGrid}>
							<FormField label="Endpoint URL (optional)" error={errors.gcpEndpoint}>
								<Input
									value={values.gcpEndpoint}
									onChange={(e) => setField('gcpEndpoint', e.target.value)}
									placeholder="https://storage.googleapis.com"
									aria-label="Endpoint URL (optional)"
								/>
							</FormField>
						</div>
					</AdvancedFieldDisclosure>
				</>
			) : null}
		</div>
	)
}

export function buildCredentialsSection(args: ProfileModalSectionContentArgs) {
	const { values, errors, editMode, setField, viewState } = args

	return (
		<div className={styles.sectionBody}>
			<Typography.Text type="secondary" className={styles.sectionNote}>
				{editMode ? 'Leave credential fields blank to keep the existing stored values.' : 'Enter the auth material required by this provider.'}
			</Typography.Text>
			<Alert type="info" showIcon message="Credential fields" description={getCredentialsSummary(viewState, editMode)} />

			{viewState.isS3Provider ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Access Key ID" required={!editMode} error={errors.accessKeyId}>
							<Input
								value={values.accessKeyId}
								onChange={(e) => setField('accessKeyId', e.target.value)}
								autoComplete="username"
								aria-label="Access Key ID"
							/>
						</FormField>
						<FormField label="Secret" required={!editMode} error={errors.secretAccessKey}>
							<Input.Password
								value={values.secretAccessKey}
								onChange={(e) => setField('secretAccessKey', e.target.value)}
								autoComplete="new-password"
								aria-label="Secret"
							/>
						</FormField>
					</div>

					<AdvancedFieldDisclosure
						title="Temporary credential extras"
						description="Open this only when the provider issued a session token on top of the access key and secret."
						configuredCount={countConfiguredValues([values.sessionToken])}
					>
						<div className={styles.formGrid}>
							<FormField label="Session Token (optional)">
								<Input.Password
									value={values.sessionToken ?? ''}
									onChange={(e) => setField('sessionToken', e.target.value)}
									autoComplete="off"
									aria-label="Session Token (optional)"
									disabled={!!editMode && !!values.clearSessionToken}
								/>
							</FormField>
						</div>
						{editMode ? (
							<div className={styles.checkboxRow}>
								<Checkbox checked={!!values.clearSessionToken} onChange={(e) => setField('clearSessionToken', e.target.checked)}>
									Clear existing session token
								</Checkbox>
							</div>
						) : null}
					</AdvancedFieldDisclosure>
				</>
			) : null}

			{viewState.isAzure ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Account Key" required={!editMode} error={errors.azureAccountKey}>
							<Input.Password
								value={values.azureAccountKey}
								onChange={(e) => setField('azureAccountKey', e.target.value)}
								autoComplete="new-password"
								aria-label="Account Key"
							/>
						</FormField>
					</div>
					<AdvancedFieldDisclosure
						title="Azure management-plane secret"
						description="Only open this when you are also filling the Azure ARM fields for management-plane features."
						configuredCount={countConfiguredValues([values.azureClientSecret])}
					>
						<div className={styles.formGrid}>
							<FormField label="Client Secret (optional)" error={errors.azureClientSecret}>
								<Input.Password
									value={values.azureClientSecret}
									onChange={(e) => setField('azureClientSecret', e.target.value)}
									autoComplete="new-password"
									aria-label="Client Secret (optional)"
								/>
							</FormField>
						</div>
					</AdvancedFieldDisclosure>
				</>
			) : null}

			{viewState.isGcp ? (
				<>
					<div className={styles.toggleGrid}>
						{args.renderSwitchCard({
							title: 'Anonymous',
							description: 'Skip credentials and only use public access.',
							checked: values.gcpAnonymous,
							onChange: (checked) => setField('gcpAnonymous', checked),
							ariaLabel: 'Anonymous',
						})}
					</div>

					{values.gcpAnonymous ? (
						<Typography.Text type="secondary" className={styles.sectionNote}>
							Anonymous mode only works when the endpoint allows unauthenticated access. Project Number is still required.
						</Typography.Text>
					) : (
						<FormField label="Service Account JSON" required={!editMode} error={errors.gcpServiceAccountJson}>
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

			{viewState.isOciObjectStorage ? (
				<AdvancedFieldDisclosure
					title="OCI credential overrides"
					description="Open this only when you need a non-default auth provider or config path."
					configuredCount={countConfiguredValues([values.ociAuthProvider, values.ociConfigFile, values.ociConfigProfile])}
				>
					<div className={styles.formGrid}>
						<FormField label="Auth Provider (optional)">
							<Input
								value={values.ociAuthProvider}
								onChange={(e) => setField('ociAuthProvider', e.target.value)}
								placeholder="user_principal_auth / instance_principal / api_key / resource_principal"
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
				</AdvancedFieldDisclosure>
			) : null}
		</div>
	)
}

export function buildAdvancedSection(args: ProfileModalSectionContentArgs) {
	const { values, setField, viewState } = args

	return (
		<div className={styles.sectionBody}>
			<Typography.Text type="secondary" className={styles.sectionNote}>
				Only change these when your provider requires non-default behavior.
			</Typography.Text>
			<div className={styles.toggleGrid}>
				{viewState.isS3Provider
					? args.renderSwitchCard({
							title: 'Force Path Style',
							description: 'Recommended for MinIO, Ceph, and most custom S3 gateways.',
							checked: values.forcePathStyle,
							onChange: (checked) => setField('forcePathStyle', checked),
							ariaLabel: 'Force Path Style',
						})
					: null}
				{viewState.isAzure
					? args.renderSwitchCard({
							title: 'Use Emulator',
							description: 'Enable this only for local Azurite or compatible emulators.',
							checked: values.azureUseEmulator,
							onChange: (checked) => setField('azureUseEmulator', checked),
							ariaLabel: 'Use Emulator',
						})
					: null}
				{args.renderSwitchCard({
					title: 'Preserve Leading Slash',
					description: 'Keep a leading slash in object keys for strict S3 semantics.',
					checked: values.preserveLeadingSlash,
					onChange: (checked) => setField('preserveLeadingSlash', checked),
					ariaLabel: 'Preserve Leading Slash',
				})}
				{args.renderSwitchCard({
					title: 'TLS Insecure Skip Verify',
					description: 'Skip certificate validation for self-signed or development endpoints.',
					checked: values.tlsInsecureSkipVerify,
					onChange: (checked) => setField('tlsInsecureSkipVerify', checked),
					ariaLabel: 'TLS Insecure Skip Verify',
				})}
			</div>
		</div>
	)
}

export function buildSecuritySection(args: ProfileModalSectionContentArgs) {
	const { values, errors, editMode, setField, viewState } = args
	const tlsAction = viewState.tlsAction as TLSAction

	return (
		<div className={styles.sectionBody}>
			<div className={styles.securityStatusRow}>
				<Typography.Text type="secondary">Current status: {viewState.tlsStatusLabel}</Typography.Text>
				<Tag color={viewState.tlsUnavailable ? 'default' : viewState.tlsStatusLabel === 'mTLS enabled' ? 'success' : 'default'}>
					{viewState.tlsStatusLabel}
				</Tag>
			</div>

			{viewState.tlsUnavailable ? <Alert type="warning" showIcon title="mTLS is disabled" description={viewState.tlsDisabledReason} /> : null}
			{viewState.showTLSStatusError ? <Alert type="warning" showIcon title="Failed to load TLS status" description={viewState.showTLSStatusError} /> : null}

			{editMode ? (
				<FormField label="mTLS action">
					<NativeSelect
						disabled={viewState.tlsUnavailable}
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
					{args.renderSwitchCard({
						title: 'Enable mTLS',
						description: 'Attach a client certificate and key for mutual TLS.',
						checked: !!values.tlsEnabled,
						onChange: (checked) => setField('tlsEnabled', checked),
						disabled: viewState.tlsUnavailable,
						ariaLabel: 'Enable mTLS',
					})}
				</div>
			)}

			{editMode && tlsAction === 'disable' ? (
				<Typography.Text type="secondary" className={styles.sectionNote}>
					Saving will remove the current mTLS material from this profile.
				</Typography.Text>
			) : null}

			{viewState.showTLSFields ? (
				<>
					<FormField label="Client Certificate (PEM)" required error={errors.tlsClientCertPem}>
						<Input.TextArea
							disabled={viewState.tlsUnavailable}
							value={values.tlsClientCertPem ?? ''}
							onChange={(e) => setField('tlsClientCertPem', e.target.value)}
							autoSize={{ minRows: 5, maxRows: 10 }}
							aria-label="Client Certificate (PEM)"
							placeholder="-----BEGIN CERTIFICATE-----…"
						/>
					</FormField>
					<FormField label="Client Key (PEM)" required error={errors.tlsClientKeyPem}>
						<Input.TextArea
							disabled={viewState.tlsUnavailable}
							value={values.tlsClientKeyPem ?? ''}
							onChange={(e) => setField('tlsClientKeyPem', e.target.value)}
							autoSize={{ minRows: 5, maxRows: 10 }}
							aria-label="Client Key (PEM)"
							placeholder="-----BEGIN PRIVATE KEY-----…"
						/>
					</FormField>
					<FormField label="CA Certificate (optional)">
						<Input.TextArea
							disabled={viewState.tlsUnavailable}
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
}
