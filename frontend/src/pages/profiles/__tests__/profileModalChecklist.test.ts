import { describe, expect, it } from 'vitest'

import { buildProfileProviderChecklist } from '../profileModalChecklist'
import { buildProfileModalViewState, type FieldErrors } from '../profileModalValidation'
import type { ProfileFormValues } from '../profileTypes'

function buildValues(overrides: Partial<ProfileFormValues> = {}): ProfileFormValues {
	return {
		provider: 's3_compatible',
		name: 's3 profile',
		endpoint: 'https://s3.example.com',
		publicEndpoint: '',
		region: 'us-east-1',
		accessKeyId: 'access-key',
		secretAccessKey: 'secret-key',
		sessionToken: '',
		clearSessionToken: false,
		forcePathStyle: false,
		preserveLeadingSlash: false,
		tlsInsecureSkipVerify: false,
		tlsEnabled: false,
		tlsAction: 'keep',
		tlsClientCertPem: '',
		tlsClientKeyPem: '',
		tlsCaCertPem: '',
		azureAccountName: '',
		azureAccountKey: '',
		azureEndpoint: '',
		azureSubscriptionId: '',
		azureResourceGroup: '',
		azureTenantId: '',
		azureClientId: '',
		azureClientSecret: '',
		azureUseEmulator: false,
		gcpAnonymous: false,
		gcpServiceAccountJson: '',
		gcpEndpoint: '',
		gcpProjectNumber: '',
		ociNamespace: '',
		ociCompartment: '',
		ociEndpoint: '',
		ociAuthProvider: 'user_principal_auth',
		ociConfigFile: '',
		ociConfigProfile: '',
		...overrides,
	}
}

function checklistFor(values: ProfileFormValues, errors: FieldErrors = {}, editMode = false) {
	const viewState = buildProfileModalViewState({ values, editMode })
	return buildProfileProviderChecklist({ values, errors, editMode, viewState })
}

function itemById(values: ProfileFormValues, id: string, errors: FieldErrors = {}, editMode = false) {
	const checklist = checklistFor(values, errors, editMode)
	const item = checklist.groups.flatMap((group) => group.items).find((entry) => entry.id === id)
	if (!item) throw new Error(`Missing checklist item ${id}`)
	return item
}

describe('profileModalChecklist', () => {
	it('separates S3-compatible connectivity from optional public endpoint fields', () => {
		const values = buildValues({
			provider: 's3_compatible',
			publicEndpoint: 'https://public.example.com',
		})

		expect(itemById(values, 's3-connection')).toMatchObject({
			status: 'complete',
			detail: 'Endpoint URL, region, and name are ready.',
		})
		expect(itemById(values, 's3-public-endpoint')).toMatchObject({
			status: 'complete',
			detail: 'Browser endpoint override is configured.',
		})
	})

	it('distinguishes Azure blob access from partial ARM management fields', () => {
		const values = buildValues({
			provider: 'azure_blob',
			name: 'azure profile',
			endpoint: '',
			accessKeyId: '',
			secretAccessKey: '',
			azureAccountName: 'storageacct',
			azureAccountKey: 'secret',
			azureSubscriptionId: '00000000-0000-4000-8000-000000000000',
		})

		expect(itemById(values, 'azure-blob')).toMatchObject({
			status: 'complete',
			detail: 'Storage account and account key are ready.',
		})
		expect(itemById(values, 'azure-arm')).toMatchObject({
			status: 'incomplete',
			detail: 'Fill Subscription ID, Resource Group, Tenant ID, Client ID, and Client Secret together.',
		})
	})

	it('shows GCS anonymous access separately from service-account JSON', () => {
		const values = buildValues({
			provider: 'gcp_gcs',
			name: 'gcs profile',
			endpoint: '',
			accessKeyId: '',
			secretAccessKey: '',
			gcpAnonymous: true,
			gcpProjectNumber: '123456789012',
		})

		expect(itemById(values, 'gcp-auth')).toMatchObject({
			status: 'complete',
			detail: 'Anonymous access selected; use only for public buckets/endpoints.',
		})
		expect(itemById(values, 'gcp-iam')).toMatchObject({
			status: 'optional',
		})
	})

	it('distinguishes OCI scope from auth/config overrides', () => {
		const values = buildValues({
			provider: 'oci_object_storage',
			name: 'oci profile',
			endpoint: '',
			accessKeyId: '',
			secretAccessKey: '',
			region: 'us-ashburn-1',
			ociNamespace: 'namespace',
			ociCompartment: 'ocid1.compartment.oc1..aaaaaaaaexample',
			ociConfigFile: '/home/user/.oci/config',
		})

		expect(itemById(values, 'oci-scope')).toMatchObject({
			status: 'complete',
			detail: 'OCI region, namespace, compartment, and profile name are ready.',
		})
		expect(itemById(values, 'oci-auth-overrides')).toMatchObject({
			status: 'complete',
			detail: 'OCI auth override values are configured.',
		})
	})

	it('marks checklist items incomplete when validation errors exist', () => {
		const values = buildValues()

		expect(itemById(values, 's3-connection', { endpoint: 'Endpoint URL must start with http:// or https://' })).toMatchObject({
			status: 'incomplete',
			detail: 'Add endpoint URL, region, and profile name.',
		})
	})
})
