import type { Profile } from '../api/types'

export type ProviderCapabilityMatrix = {
	// UI uses these flags to show only features that are actually supported by the backend.
	bucketPolicy: boolean
	gcsIamPolicy: boolean
	azureContainerAccessPolicy: boolean
}

export const providerCapabilities: Record<string, ProviderCapabilityMatrix> = {
	aws_s3: {
		bucketPolicy: true,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: false,
	},
	s3_compatible: {
		bucketPolicy: true,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: false,
	},
	oci_s3_compat: {
		bucketPolicy: true,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: false,
	},
	gcp_gcs: {
		bucketPolicy: false,
		gcsIamPolicy: true,
		azureContainerAccessPolicy: false,
	},
	azure_blob: {
		bucketPolicy: false,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: true,
	},
	oci_object_storage: {
		bucketPolicy: false,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: false,
	},
}

export function getProviderCapabilities(provider?: Profile['provider']): ProviderCapabilityMatrix {
	if (!provider) {
		return {
			bucketPolicy: false,
			gcsIamPolicy: false,
			azureContainerAccessPolicy: false,
		}
	}
	return (
		providerCapabilities[provider] ?? {
			bucketPolicy: false,
			gcsIamPolicy: false,
			azureContainerAccessPolicy: false,
		}
	)
}
