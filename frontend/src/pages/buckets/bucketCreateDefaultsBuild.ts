import type { BucketCreateRequest, Profile } from '../../api/types'
import {
	awsBlockPublicAccess,
	normalizeAzureStoredPolicies,
	normalizeGCSBindings,
	type AwsDefaultsState,
	type AzureDefaultsState,
	type GcsDefaultsState,
} from './create/types'

function buildAWSDefaults(awsDefaults: AwsDefaultsState): BucketCreateRequest['defaults'] | undefined {
	if (!awsDefaults.enabled) return undefined
	const defaults: NonNullable<BucketCreateRequest['defaults']> = {}

	if (awsDefaults.blockPublicAccess) {
		defaults.publicExposure = { blockPublicAccess: awsBlockPublicAccess }
	}
	if (awsDefaults.objectOwnershipEnabled) {
		defaults.access = { objectOwnership: awsDefaults.objectOwnership }
	}
	if (awsDefaults.versioningEnabled) {
		defaults.versioning = { status: 'enabled' }
	}
	if (awsDefaults.encryptionEnabled) {
		const kmsKeyId = awsDefaults.kmsKeyId.trim()
		defaults.encryption = {
			mode: awsDefaults.encryptionMode,
			kmsKeyId: awsDefaults.encryptionMode === 'sse_kms' && kmsKeyId ? kmsKeyId : undefined,
		}
	}

	return Object.keys(defaults).length > 0 ? defaults : undefined
}

function buildGCSDefaults(gcsDefaults: GcsDefaultsState): BucketCreateRequest['defaults'] | undefined {
	if (!gcsDefaults.enabled) return undefined
	const defaults: NonNullable<BucketCreateRequest['defaults']> = {
		publicExposure: {
			mode: gcsDefaults.publicMode,
		},
	}

	if (gcsDefaults.bindingsEnabled) {
		const bindings = normalizeGCSBindings(gcsDefaults.bindings)
		if (bindings.length > 0) {
			defaults.access = { bindings }
		}
	}

	return defaults
}

function buildAzureDefaults(azureDefaults: AzureDefaultsState): BucketCreateRequest['defaults'] | undefined {
	if (!azureDefaults.enabled) return undefined
	const defaults: NonNullable<BucketCreateRequest['defaults']> = {
		publicExposure: {
			mode: azureDefaults.visibility,
			visibility: azureDefaults.visibility,
		},
	}

	if (azureDefaults.storedPoliciesEnabled) {
		const storedAccessPolicies = normalizeAzureStoredPolicies(azureDefaults.storedPolicies)
		if (storedAccessPolicies.length > 0) {
			defaults.access = { storedAccessPolicies }
		}
	}

	return defaults
}

export function buildBucketCreateDefaults(args: {
	provider?: Profile['provider']
	awsDefaults: AwsDefaultsState
	gcsDefaults: GcsDefaultsState
	azureDefaults: AzureDefaultsState
}): BucketCreateRequest['defaults'] | undefined {
	switch (args.provider) {
		case 'aws_s3':
			return buildAWSDefaults(args.awsDefaults)
		case 'gcp_gcs':
			return buildGCSDefaults(args.gcsDefaults)
		case 'azure_blob':
			return buildAzureDefaults(args.azureDefaults)
		default:
			return undefined
	}
}
