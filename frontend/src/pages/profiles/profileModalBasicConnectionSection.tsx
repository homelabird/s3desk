import { Input, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import { NativeSelect } from '../../components/NativeSelect'
import styles from './ProfileModal.module.css'
import type { ProfileFormValues } from './profileTypes'
import {
	countConfiguredValues,
	profileFieldA11y,
	renderAdvancedFieldDisclosure,
	type ProfileModalSectionContentArgs,
} from './profileModalSectionShared'

const PROVIDER_OPTIONS: Array<{ label: string; value: ProfileFormValues['provider'] }> = [
	{ label: 'S3 Compatible', value: 's3_compatible' },
	{ label: 'AWS S3', value: 'aws_s3' },
	{ label: 'Oracle OCI Object Storage (Native)', value: 'oci_object_storage' },
	{ label: 'Azure Blob Storage', value: 'azure_blob' },
	{ label: 'Google Cloud Storage (GCS)', value: 'gcp_gcs' },
]

export function buildBasicConnectionSection(args: ProfileModalSectionContentArgs) {
	const { values, errors, editMode, setField, viewState } = args
	const providerLabel = PROVIDER_OPTIONS.find((option) => option.value === values.provider)?.label ?? values.provider
	const browserEndpointNote = editMode
		? 'Only when browser uploads use a different host than the server.'
		: 'Only when browser uploads need a different host.'

	return (
		<div className={styles.sectionBody}>
			<div className={styles.formGrid}>
				<FormField label="Provider" htmlFor="profile-provider" required error={errors.provider}>
					{editMode ? (
						<Input
							id="profile-provider"
							value={providerLabel}
							readOnly
							className={styles.readOnlyField}
						/>
					) : (
						<NativeSelect
							{...profileFieldA11y('profile-provider', errors.provider)}
							value={values.provider}
							onChange={(v) => setField('provider', v as ProfileFormValues['provider'])}
							options={PROVIDER_OPTIONS}
						/>
					)}
				</FormField>

				<FormField label="Name" htmlFor="profile-name" required error={errors.name}>
					<Input
						{...profileFieldA11y('profile-name', errors.name)}
						value={values.name}
						onChange={(e) => setField('name', e.target.value)}
						autoComplete="off"
						placeholder="Production S3"
					/>
				</FormField>
			</div>

			{viewState.isS3Provider ? (
				<>
					<div className={styles.formGrid}>
						<FormField
							label={viewState.isAws ? 'Endpoint URL (optional)' : 'Endpoint URL'}
							htmlFor="profile-endpoint"
							required={!viewState.isAws}
							error={errors.endpoint}
						>
							<Input
								{...profileFieldA11y('profile-endpoint', errors.endpoint)}
								value={values.endpoint}
								onChange={(e) => setField('endpoint', e.target.value)}
								placeholder={
									viewState.isAws
										? 'Leave blank for AWS default'
										: 'https://s3.example.com'
								}
								autoComplete="off"
							/>
						</FormField>
						<FormField label="Region" htmlFor="profile-region" required error={errors.region}>
							<Input
								{...profileFieldA11y('profile-region', errors.region)}
								value={values.region}
								onChange={(e) => setField('region', e.target.value)}
								placeholder="us-east-1"
							/>
						</FormField>
					</div>
					{renderAdvancedFieldDisclosure({
						title: 'Browser endpoint',
						description: 'Only for a different browser host.',
						configuredCount: countConfiguredValues([values.publicEndpoint]),
						children: (
							<>
								<div className={styles.formGrid}>
									<FormField label="Browser Endpoint (optional)" htmlFor="profile-public-endpoint" error={errors.publicEndpoint}>
										<Input
											{...profileFieldA11y('profile-public-endpoint', errors.publicEndpoint)}
											value={values.publicEndpoint}
											onChange={(e) => setField('publicEndpoint', e.target.value)}
											placeholder="https://storage.example.com"
											autoComplete="off"
										/>
									</FormField>
								</div>
								<Typography.Text type="secondary" className={styles.sectionNote}>
									{browserEndpointNote}
								</Typography.Text>
							</>
						),
					})}
				</>
			) : null}

			{viewState.isOciObjectStorage ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Region" htmlFor="profile-oci-region" required error={errors.region}>
							<Input
								{...profileFieldA11y('profile-oci-region', errors.region)}
								value={values.region}
								onChange={(e) => setField('region', e.target.value)}
								placeholder="us-ashburn-1"
							/>
						</FormField>
						<FormField label="Namespace" htmlFor="profile-oci-namespace" required error={errors.ociNamespace}>
							<Input
								{...profileFieldA11y('profile-oci-namespace', errors.ociNamespace)}
								value={values.ociNamespace}
								onChange={(e) => setField('ociNamespace', e.target.value)}
								placeholder="my-namespace"
							/>
						</FormField>
						<FormField label="Compartment OCID" htmlFor="profile-oci-compartment" required error={errors.ociCompartment}>
							<Input
								{...profileFieldA11y('profile-oci-compartment', errors.ociCompartment)}
								value={values.ociCompartment}
								onChange={(e) => setField('ociCompartment', e.target.value)}
								placeholder="ocid1.compartment.oc1..…"
							/>
						</FormField>
					</div>
					{renderAdvancedFieldDisclosure({
						title: 'OCI endpoint override',
						description: 'Only to override the regional endpoint.',
						configuredCount: countConfiguredValues([values.ociEndpoint]),
						children: (
							<div className={styles.formGrid}>
								<FormField label="Endpoint URL (optional)" htmlFor="profile-oci-endpoint" error={errors.ociEndpoint}>
									<Input
										{...profileFieldA11y('profile-oci-endpoint', errors.ociEndpoint)}
										value={values.ociEndpoint}
										onChange={(e) => setField('ociEndpoint', e.target.value)}
										placeholder="https://objectstorage.{region}.oraclecloud.com"
									/>
								</FormField>
							</div>
						),
					})}
				</>
			) : null}

			{viewState.isAzure ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Storage Account Name" htmlFor="profile-azure-account-name" required error={errors.azureAccountName}>
							<Input
								{...profileFieldA11y('profile-azure-account-name', errors.azureAccountName)}
								value={values.azureAccountName}
								onChange={(e) => setField('azureAccountName', e.target.value)}
								placeholder="mystorageaccount"
							/>
						</FormField>
					</div>
					{renderAdvancedFieldDisclosure({
						title: 'Azure connection overrides',
						description: 'Only for Azurite, custom endpoints, or ARM features.',
						configuredCount: countConfiguredValues([
							values.azureEndpoint,
							values.azureSubscriptionId,
							values.azureResourceGroup,
							values.azureTenantId,
							values.azureClientId,
						]),
						children: (
							<>
								<div className={styles.formGrid}>
									<FormField label="Endpoint URL (optional)" htmlFor="profile-azure-endpoint" error={errors.azureEndpoint}>
										<Input
											{...profileFieldA11y('profile-azure-endpoint', errors.azureEndpoint)}
											value={values.azureEndpoint}
											onChange={(e) => setField('azureEndpoint', e.target.value)}
											placeholder="http://127.0.0.1:10000/devstoreaccount1"
										/>
									</FormField>
								</div>
								<div className={styles.formGrid}>
									<FormField label="Subscription ID" htmlFor="profile-azure-subscription-id" error={errors.azureSubscriptionId}>
										<Input
											{...profileFieldA11y('profile-azure-subscription-id', errors.azureSubscriptionId)}
											value={values.azureSubscriptionId}
											onChange={(e) => setField('azureSubscriptionId', e.target.value)}
											placeholder="00000000-0000-0000-0000-000000000000"
										/>
									</FormField>
									<FormField label="Resource Group" htmlFor="profile-azure-resource-group" error={errors.azureResourceGroup}>
										<Input
											{...profileFieldA11y('profile-azure-resource-group', errors.azureResourceGroup)}
											value={values.azureResourceGroup}
											onChange={(e) => setField('azureResourceGroup', e.target.value)}
											placeholder="my-storage-rg"
										/>
									</FormField>
								</div>
								<div className={styles.formGrid}>
									<FormField label="Tenant ID" htmlFor="profile-azure-tenant-id" error={errors.azureTenantId}>
										<Input
											{...profileFieldA11y('profile-azure-tenant-id', errors.azureTenantId)}
											value={values.azureTenantId}
											onChange={(e) => setField('azureTenantId', e.target.value)}
											placeholder="00000000-0000-0000-0000-000000000000"
										/>
									</FormField>
									<FormField label="Client ID" htmlFor="profile-azure-client-id" error={errors.azureClientId}>
										<Input
											{...profileFieldA11y('profile-azure-client-id', errors.azureClientId)}
											value={values.azureClientId}
											onChange={(e) => setField('azureClientId', e.target.value)}
											placeholder="00000000-0000-0000-0000-000000000000"
										/>
									</FormField>
								</div>
								<Typography.Text type="secondary" className={styles.sectionNote}>
									<Typography.Text strong>Azure ARM fields are optional.</Typography.Text> Fill them together only for ARM features like immutability edits.
								</Typography.Text>
							</>
						),
					})}
				</>
			) : null}

			{viewState.isGcp ? (
				<>
					<div className={styles.formGrid}>
						<FormField label="Project Number" htmlFor="profile-gcp-project-number" required error={errors.gcpProjectNumber}>
							<Input
								{...profileFieldA11y('profile-gcp-project-number', errors.gcpProjectNumber)}
								value={values.gcpProjectNumber}
								onChange={(e) => setField('gcpProjectNumber', e.target.value)}
								placeholder="123456789012"
							/>
						</FormField>
					</div>
					{renderAdvancedFieldDisclosure({
						title: 'GCS endpoint override',
						description: 'Only for a non-default endpoint.',
						configuredCount: countConfiguredValues([values.gcpEndpoint]),
						children: (
							<div className={styles.formGrid}>
								<FormField label="Endpoint URL (optional)" htmlFor="profile-gcp-endpoint" error={errors.gcpEndpoint}>
									<Input
										{...profileFieldA11y('profile-gcp-endpoint', errors.gcpEndpoint)}
										value={values.gcpEndpoint}
										onChange={(e) => setField('gcpEndpoint', e.target.value)}
										placeholder="https://storage.googleapis.com"
									/>
								</FormField>
							</div>
						),
					})}
				</>
			) : null}
		</div>
	)
}
