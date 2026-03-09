import type { ProfileCreateRequest, ProfileTLSConfig, ProfileUpdateRequest } from '../../api/types'
import type { ProfileFormValues } from './profileTypes'

type ProfileCreateRequestWithPublicEndpoint = ProfileCreateRequest & { publicEndpoint?: string }
type ProfileUpdateRequestWithPublicEndpoint = ProfileUpdateRequest & { publicEndpoint?: string }

export function buildTLSConfigFromValues(values: ProfileFormValues): ProfileTLSConfig | null {
	const clientCertPem = values.tlsClientCertPem?.trim() ?? ''
	const clientKeyPem = values.tlsClientKeyPem?.trim() ?? ''
	if (!clientCertPem || !clientKeyPem) return null
	const caCertPem = values.tlsCaCertPem?.trim() ?? ''

	const cfg: ProfileTLSConfig = {
		mode: 'mtls',
		clientCertPem,
		clientKeyPem,
	}
	if (caCertPem) cfg.caCertPem = caCertPem
	return cfg
}

export function toUpdateRequest(values: ProfileFormValues): ProfileUpdateRequest {
	const provider = values.provider

	if (provider === 'azure_blob') {
		return {
			provider,
			name: values.name,
			accountName: values.azureAccountName,
			endpoint: values.azureEndpoint,
			useEmulator: values.azureUseEmulator,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
			...(values.azureAccountKey ? { accountKey: values.azureAccountKey } : {}),
		}
	}

	if (provider === 'gcp_gcs') {
		return {
			provider,
			name: values.name,
			anonymous: values.gcpAnonymous,
			endpoint: values.gcpEndpoint,
			projectNumber: values.gcpProjectNumber,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
			...(values.gcpAnonymous
				? { serviceAccountJson: '' }
				: values.gcpServiceAccountJson
					? { serviceAccountJson: values.gcpServiceAccountJson }
					: {}),
		}
	}

	if (provider === 'oci_object_storage') {
		return {
			provider,
			name: values.name,
			endpoint: values.ociEndpoint,
			region: values.region,
			namespace: values.ociNamespace,
			compartment: values.ociCompartment,
			authProvider: values.ociAuthProvider,
			configFile: values.ociConfigFile,
			configProfile: values.ociConfigProfile,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
		}
	}

	const base = {
		name: values.name,
		region: values.region,
		forcePathStyle: values.forcePathStyle,
		preserveLeadingSlash: values.preserveLeadingSlash,
		tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
		...(values.accessKeyId ? { accessKeyId: values.accessKeyId } : {}),
		...(values.secretAccessKey ? { secretAccessKey: values.secretAccessKey } : {}),
		...(values.clearSessionToken ? { sessionToken: '' } : values.sessionToken ? { sessionToken: values.sessionToken } : {}),
	}
	if (provider === 'aws_s3') {
		const req: ProfileUpdateRequestWithPublicEndpoint = {
			provider,
			...base,
			endpoint: values.endpoint,
			publicEndpoint: values.publicEndpoint,
		}
		return req
	}
	if (provider === 's3_compatible') {
		const req: ProfileUpdateRequestWithPublicEndpoint = {
			provider,
			...base,
			endpoint: values.endpoint,
			publicEndpoint: values.publicEndpoint,
		}
		return req
	}
	const req: ProfileUpdateRequestWithPublicEndpoint = {
		provider: 's3_compatible',
		...base,
		endpoint: values.endpoint,
		publicEndpoint: values.publicEndpoint,
	}
	return req
}

export function toCreateRequest(values: ProfileFormValues): ProfileCreateRequest {
	const provider = values.provider

	if (provider === 'azure_blob') {
		return {
			provider,
			name: values.name,
			accountName: values.azureAccountName,
			accountKey: values.azureAccountKey,
			endpoint: values.azureEndpoint,
			useEmulator: values.azureUseEmulator,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
		}
	}

	if (provider === 'gcp_gcs') {
		return {
			provider,
			name: values.name,
			anonymous: values.gcpAnonymous,
			endpoint: values.gcpEndpoint,
			projectNumber: values.gcpProjectNumber,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
			...(values.gcpServiceAccountJson ? { serviceAccountJson: values.gcpServiceAccountJson } : {}),
		}
	}

	if (provider === 'oci_object_storage') {
		return {
			provider,
			name: values.name,
			endpoint: values.ociEndpoint,
			region: values.region,
			namespace: values.ociNamespace,
			compartment: values.ociCompartment,
			authProvider: values.ociAuthProvider,
			configFile: values.ociConfigFile,
			configProfile: values.ociConfigProfile,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
		}
	}

	const base = {
		name: values.name,
		region: values.region,
		accessKeyId: values.accessKeyId,
		secretAccessKey: values.secretAccessKey,
		sessionToken: values.sessionToken ? values.sessionToken : null,
		forcePathStyle: values.forcePathStyle,
		preserveLeadingSlash: values.preserveLeadingSlash,
		tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
	}
	if (provider === 'aws_s3') {
		const req: ProfileCreateRequestWithPublicEndpoint = {
			provider,
			...base,
			...(values.endpoint ? { endpoint: values.endpoint } : {}),
			...(values.publicEndpoint ? { publicEndpoint: values.publicEndpoint } : {}),
		}
		return req
	}
	if (provider === 's3_compatible') {
		const req: ProfileCreateRequestWithPublicEndpoint = {
			provider,
			...base,
			endpoint: values.endpoint,
			...(values.publicEndpoint ? { publicEndpoint: values.publicEndpoint } : {}),
		}
		return req
	}
	const req: ProfileCreateRequestWithPublicEndpoint = {
		provider: 's3_compatible',
		...base,
		endpoint: values.endpoint,
		...(values.publicEndpoint ? { publicEndpoint: values.publicEndpoint } : {}),
	}
	return req
}

export function downloadTextFile(filename: string, content: string): void {
	const blob = new Blob([content], { type: 'text/plain' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.style.display = 'none'
	document.body.appendChild(a)
	a.click()
	a.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
