import { Alert, Input, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import { NativeSelect } from '../../components/NativeSelect'
import styles from './ProfileModal.module.css'
import type { ProfileFormValues } from './profileTypes'
import {
	countConfiguredValues,
	getConnectionSummary,
	renderAdvancedFieldDisclosure,
	type ProfileModalSectionContentArgs,
} from './profileModalSectionShared'

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

			<Alert type="info" showIcon title="Connection fields" description={getConnectionSummary(viewState)} />

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
					{renderAdvancedFieldDisclosure({
						title: 'Browser-only endpoint override',
						description: 'Only set this when the browser must use a different hostname than the server for presigned uploads.',
						configuredCount: countConfiguredValues([values.publicEndpoint]),
						children: (
							<>
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
							</>
						),
					})}
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
					{renderAdvancedFieldDisclosure({
						title: 'OCI endpoint override',
						description: 'Leave this closed unless you need to override the default regional endpoint.',
						configuredCount: countConfiguredValues([values.ociEndpoint]),
						children: (
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
						),
					})}
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
					{renderAdvancedFieldDisclosure({
						title: 'Azure connection overrides',
						description: 'Open this only for Azurite, custom endpoints, or management-plane features.',
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
							</>
						),
					})}
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
					{renderAdvancedFieldDisclosure({
						title: 'GCS endpoint override',
						description: 'Only open this when you are targeting a non-default endpoint.',
						configuredCount: countConfiguredValues([values.gcpEndpoint]),
						children: (
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
						),
					})}
				</>
			) : null}
		</div>
	)
}
