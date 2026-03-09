import type { MetaResponse } from '../../api/types'

export type ProfileProvider =
	| 'aws_s3'
	| 's3_compatible'
	| 'azure_blob'
	| 'gcp_gcs'
	| 'oci_object_storage'

export type TLSAction = 'keep' | 'enable' | 'disable'
export type TLSCapability = MetaResponse['capabilities']['profileTls']

export type ProfileFormValues = {
	provider: ProfileProvider
	name: string

	// S3-like (AWS/S3-compatible)
	endpoint: string
	publicEndpoint: string
	region: string
	accessKeyId: string
	secretAccessKey: string
	sessionToken?: string
	clearSessionToken: boolean
	forcePathStyle: boolean

	// Azure Blob
	azureAccountName: string
	azureAccountKey: string
	azureEndpoint: string
	azureSubscriptionId: string
	azureResourceGroup: string
	azureTenantId: string
	azureClientId: string
	azureClientSecret: string
	azureUseEmulator: boolean

	// GCP GCS
	gcpAnonymous: boolean
	gcpServiceAccountJson: string
	gcpEndpoint: string
	gcpProjectNumber: string

	// OCI Object Storage (native)
	ociNamespace: string
	ociCompartment: string
	ociEndpoint: string
	ociAuthProvider: string
	ociConfigFile: string
	ociConfigProfile: string

	// Common flags
	preserveLeadingSlash: boolean
	tlsInsecureSkipVerify: boolean

	// TLS config UI
	tlsEnabled?: boolean
	tlsAction?: TLSAction
	tlsClientCertPem?: string
	tlsClientKeyPem?: string
	tlsCaCertPem?: string
}
