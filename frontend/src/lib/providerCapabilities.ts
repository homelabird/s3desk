import type { MetaResponse, Profile } from '../api/types'

export type ProviderCapabilityName =
	| 'bucketCrud'
	| 'objectCrud'
	| 'jobTransfer'
	| 'bucketPolicy'
	| 'gcsIamPolicy'
	| 'azureContainerAccessPolicy'
	| 'presignedUpload'
	| 'presignedMultipartUpload'
	| 'directUpload'

export type ProviderCapabilityReasonMap = Partial<Record<ProviderCapabilityName, string>>

export type ProviderCapabilityMatrix = {
	bucketCrud: boolean
	objectCrud: boolean
	jobTransfer: boolean
	// UI uses these flags to show only features that are actually supported by the backend.
	bucketPolicy: boolean
	gcsIamPolicy: boolean
	azureContainerAccessPolicy: boolean
	presignedUpload: boolean
	presignedMultipartUpload: boolean
	directUpload: boolean
	reasons: ProviderCapabilityReasonMap
}

const reasonS3PolicyOnly = 'Supported only by S3-compatible providers (aws_s3, s3_compatible, oci_s3_compat).'
const reasonGCSIAMOnly = 'Supported only by gcp_gcs.'
const reasonAzureContainerPolicyOnly = 'Supported only by azure_blob.'
const reasonPresignedS3Only = 'Presigned upload is supported only by S3-compatible providers (aws_s3, s3_compatible, oci_s3_compat).'
const reasonPresignedMultipartS3Only =
	'Presigned multipart upload is supported only by S3-compatible providers (aws_s3, s3_compatible, oci_s3_compat).'
const reasonDirectUploadUnavailable = 'Direct upload is not available for this backend configuration.'

export const providerCapabilities: Record<string, ProviderCapabilityMatrix> = {
	aws_s3: {
		bucketCrud: true,
		objectCrud: true,
		jobTransfer: true,
		bucketPolicy: true,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: false,
		presignedUpload: true,
		presignedMultipartUpload: true,
		directUpload: false,
		reasons: {
			gcsIamPolicy: reasonGCSIAMOnly,
			azureContainerAccessPolicy: reasonAzureContainerPolicyOnly,
			directUpload: reasonDirectUploadUnavailable,
		},
	},
	s3_compatible: {
		bucketCrud: true,
		objectCrud: true,
		jobTransfer: true,
		bucketPolicy: true,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: false,
		presignedUpload: true,
		presignedMultipartUpload: true,
		directUpload: false,
		reasons: {
			gcsIamPolicy: reasonGCSIAMOnly,
			azureContainerAccessPolicy: reasonAzureContainerPolicyOnly,
			directUpload: reasonDirectUploadUnavailable,
		},
	},
	oci_s3_compat: {
		bucketCrud: true,
		objectCrud: true,
		jobTransfer: true,
		bucketPolicy: true,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: false,
		presignedUpload: true,
		presignedMultipartUpload: true,
		directUpload: false,
		reasons: {
			gcsIamPolicy: reasonGCSIAMOnly,
			azureContainerAccessPolicy: reasonAzureContainerPolicyOnly,
			directUpload: reasonDirectUploadUnavailable,
		},
	},
	gcp_gcs: {
		bucketCrud: true,
		objectCrud: true,
		jobTransfer: true,
		bucketPolicy: false,
		gcsIamPolicy: true,
		azureContainerAccessPolicy: false,
		presignedUpload: false,
		presignedMultipartUpload: false,
		directUpload: false,
		reasons: {
			bucketPolicy: reasonS3PolicyOnly,
			azureContainerAccessPolicy: reasonAzureContainerPolicyOnly,
			presignedUpload: reasonPresignedS3Only,
			presignedMultipartUpload: reasonPresignedMultipartS3Only,
			directUpload: reasonDirectUploadUnavailable,
		},
	},
	azure_blob: {
		bucketCrud: true,
		objectCrud: true,
		jobTransfer: true,
		bucketPolicy: false,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: true,
		presignedUpload: false,
		presignedMultipartUpload: false,
		directUpload: false,
		reasons: {
			bucketPolicy: reasonS3PolicyOnly,
			gcsIamPolicy: reasonGCSIAMOnly,
			presignedUpload: reasonPresignedS3Only,
			presignedMultipartUpload: reasonPresignedMultipartS3Only,
			directUpload: reasonDirectUploadUnavailable,
		},
	},
	oci_object_storage: {
		bucketCrud: true,
		objectCrud: true,
		jobTransfer: true,
		bucketPolicy: false,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: false,
		presignedUpload: false,
		presignedMultipartUpload: false,
		directUpload: false,
		reasons: {
			bucketPolicy: reasonS3PolicyOnly,
			gcsIamPolicy: reasonGCSIAMOnly,
			azureContainerAccessPolicy: reasonAzureContainerPolicyOnly,
			presignedUpload: reasonPresignedS3Only,
			presignedMultipartUpload: reasonPresignedMultipartS3Only,
			directUpload: reasonDirectUploadUnavailable,
		},
	},
}

function disabledCapabilities(reason = 'This provider is not supported by this server.'): ProviderCapabilityMatrix {
	return {
		bucketCrud: false,
		objectCrud: false,
		jobTransfer: false,
		bucketPolicy: false,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: false,
		presignedUpload: false,
		presignedMultipartUpload: false,
		directUpload: false,
		reasons: {
			bucketCrud: reason,
			objectCrud: reason,
			jobTransfer: reason,
			bucketPolicy: reason,
			gcsIamPolicy: reason,
			azureContainerAccessPolicy: reason,
			presignedUpload: reason,
			presignedMultipartUpload: reason,
			directUpload: reason,
		},
	}
}

type ServerProviderCapability = NonNullable<MetaResponse['capabilities']['providers']>[string]

function normalizeServerReasons(reasons?: ServerProviderCapability['reasons']): ProviderCapabilityReasonMap {
	if (!reasons) return {}
	const out: ProviderCapabilityReasonMap = {}
	const assign = (key: ProviderCapabilityName, value: unknown) => {
		if (typeof value !== 'string') return
		const trimmed = value.trim()
		if (!trimmed) return
		out[key] = trimmed
	}
	assign('bucketCrud', reasons.bucketCrud)
	assign('objectCrud', reasons.objectCrud)
	assign('jobTransfer', reasons.jobTransfer)
	assign('bucketPolicy', reasons.bucketPolicy)
	assign('gcsIamPolicy', reasons.gcsIamPolicy)
	assign('azureContainerAccessPolicy', reasons.azureContainerAccessPolicy)
	assign('presignedUpload', reasons.presignedUpload)
	assign('presignedMultipartUpload', reasons.presignedMultipartUpload)
	assign('directUpload', reasons.directUpload)
	return out
}

export function getProviderCapabilities(
	provider?: Profile['provider'],
	metaProviders?: MetaResponse['capabilities']['providers'],
): ProviderCapabilityMatrix {
	if (!provider) {
		return disabledCapabilities('Select a profile first.')
	}
	const serverCapability = metaProviders?.[provider]
	if (serverCapability) {
		return {
			bucketCrud: serverCapability.bucketCrud,
			objectCrud: serverCapability.objectCrud,
			jobTransfer: serverCapability.jobTransfer,
			bucketPolicy: serverCapability.bucketPolicy,
			gcsIamPolicy: serverCapability.gcsIamPolicy,
			azureContainerAccessPolicy: serverCapability.azureContainerAccessPolicy,
			presignedUpload: serverCapability.presignedUpload,
			presignedMultipartUpload: serverCapability.presignedMultipartUpload,
			directUpload: serverCapability.directUpload,
			reasons: normalizeServerReasons(serverCapability.reasons),
		}
	}
	return providerCapabilities[provider] ?? disabledCapabilities()
}

export function getProviderCapabilityReason(
	capability: ProviderCapabilityMatrix | null | undefined,
	name: ProviderCapabilityName,
	fallback?: string,
): string | null {
	if (!capability) return fallback ?? null
	if (capability[name]) return null
	const reason = capability.reasons[name]
	if (typeof reason === 'string' && reason.trim()) return reason
	return fallback ?? null
}

export function getUploadCapabilityDisabledReason(capability: ProviderCapabilityMatrix | null | undefined): string | null {
	if (!capability) return null
	if (!capability.objectCrud) {
		return getProviderCapabilityReason(capability, 'objectCrud', 'Selected provider does not support object upload APIs.')
	}
	if (!capability.jobTransfer) {
		return getProviderCapabilityReason(capability, 'jobTransfer', 'Selected provider does not support transfer jobs.')
	}
	return null
}
