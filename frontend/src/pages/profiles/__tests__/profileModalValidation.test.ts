import { describe, expect, it } from 'vitest'

import { buildProfileModalViewState, validateProfileFormValues } from '../profileModalValidation'
import type { ProfileFormValues } from '../profileTypes'

function buildValues(overrides: Partial<ProfileFormValues> = {}): ProfileFormValues {
	return {
		provider: 's3_compatible',
		name: 's3 profile',
		endpoint: 'https://s3.example.com',
		publicEndpoint: '',
		region: 'ap-tokyo-1',
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
		ociAuthProvider: '',
		ociConfigFile: '',
		ociConfigProfile: '',
		...overrides,
	}
}

describe('profileModalValidation', () => {
	it('rejects non-http endpoints for s3-compatible profiles', async () => {
		const values = buildValues({
			endpoint: 'ftp://s3.example.com',
		})
		const viewState = buildProfileModalViewState({ values })

		const errors = await validateProfileFormValues({ values, viewState })

		expect(errors.endpoint).toContain('Endpoint URL must start with http:// or https://')
	})

	it('rejects invalid OCI native compartment values', async () => {
		const values = buildValues({
			provider: 'oci_object_storage',
			endpoint: '',
			accessKeyId: '',
			secretAccessKey: '',
			ociNamespace: 'nrszxupgigok',
			ociCompartment: 'ocid1.tenancy.oc1..aaaa',
		})
		const viewState = buildProfileModalViewState({ values })

		const errors = await validateProfileFormValues({ values, viewState })

		expect(errors.ociCompartment).toContain('Expected OCID that starts with ocid1.compartment.')
	})

	it('accepts namespace-scoped OCI native settings', async () => {
		const values = buildValues({
			provider: 'oci_object_storage',
			endpoint: 'https://objectstorage.ap-tokyo-1.oraclecloud.com',
			accessKeyId: '',
			secretAccessKey: '',
			ociNamespace: 'nrszxupgigok',
			ociCompartment: 'ocid1.compartment.oc1..aaaaaaaaexample',
		})
		const viewState = buildProfileModalViewState({ values })

		const errors = await validateProfileFormValues({ values, viewState })

		expect(errors.ociCompartment).toBeUndefined()
		expect(errors.ociEndpoint).toBeUndefined()
	})
})
