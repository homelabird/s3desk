import { useState } from 'react'

import type { Profile } from '../../api/types'
import {
	getProviderCapabilityReason,
	type ProviderCapabilityMatrix,
} from '../../lib/providerCapabilities'
import type { ScopedBucketState } from './useBucketScopedViewState'

type UseBucketsPageOverlaysStateArgs = {
	currentScopeKey: string
	selectedProfile: Profile | null
	capabilities: ProviderCapabilityMatrix | null
}

export function useBucketsPageOverlaysState({
	currentScopeKey,
	selectedProfile,
	capabilities,
}: UseBucketsPageOverlaysStateArgs) {
	const [policyBucketState, setPolicyBucketState] = useState<ScopedBucketState | null>(null)
	const [controlsBucketState, setControlsBucketState] = useState<ScopedBucketState | null>(null)

	const policySupported = capabilities
		? capabilities.bucketPolicy || capabilities.gcsIamPolicy || capabilities.azureContainerAccessPolicy
		: false
	const policyUnsupportedReason =
		getProviderCapabilityReason(capabilities, 'bucketPolicy') ??
		getProviderCapabilityReason(capabilities, 'gcsIamPolicy') ??
		getProviderCapabilityReason(capabilities, 'azureContainerAccessPolicy') ??
		'Policy management is not supported by this provider.'

	const controlsSupported =
		selectedProfile?.provider === 'aws_s3' ||
		selectedProfile?.provider === 'gcp_gcs' ||
		selectedProfile?.provider === 'azure_blob' ||
		selectedProfile?.provider === 'oci_object_storage'
	const controlsUnsupportedReason = 'Typed controls are available for AWS S3, GCS, Azure Blob, and OCI summary views.'

	return {
		policySupported,
		policyUnsupportedReason,
		controlsSupported,
		controlsUnsupportedReason,
		policyBucket:
			policyBucketState?.scopeKey === currentScopeKey ? policyBucketState.bucketName : null,
		controlsBucket:
			controlsBucketState?.scopeKey === currentScopeKey ? controlsBucketState.bucketName : null,
		openPolicyModal: (bucketName: string) => {
			setControlsBucketState(null)
			setPolicyBucketState({ bucketName, scopeKey: currentScopeKey })
		},
		openControlsModal: (bucketName: string) => {
			setPolicyBucketState(null)
			setControlsBucketState({ bucketName, scopeKey: currentScopeKey })
		},
		closePolicyModal: () => setPolicyBucketState(null),
		closeControlsModal: () => setControlsBucketState(null),
	}
}
