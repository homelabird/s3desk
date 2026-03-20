import type { Dispatch, SetStateAction } from 'react'

import type { Profile } from '../../api/types'
import {
	createInitialAWSDefaults,
	createInitialAzureDefaults,
	createInitialGCSDefaults,
	type AwsDefaultsState,
	type AzureDefaultsState,
	type GcsDefaultsState,
} from './create/types'

export type BucketCreateRegionMeta = {
	show: boolean
	label: string
	placeholder: string
}

export function getBucketCreateRegionMeta(provider?: Profile['provider']): BucketCreateRegionMeta {
	switch (provider) {
		case 'azure_blob':
			return { show: false, label: '', placeholder: '' }
		case 'gcp_gcs':
			return { show: true, label: 'Location (optional)', placeholder: 'us-central1' }
		default:
			return { show: true, label: 'Region (optional)', placeholder: 'us-east-1' }
	}
}

export function resetBucketCreateModalState(args: {
	setName: Dispatch<SetStateAction<string>>
	setRegion: Dispatch<SetStateAction<string>>
	setSubmitError: Dispatch<SetStateAction<string | null>>
	setAwsDefaults: Dispatch<SetStateAction<AwsDefaultsState>>
	setGcsDefaults: Dispatch<SetStateAction<GcsDefaultsState>>
	setAzureDefaults: Dispatch<SetStateAction<AzureDefaultsState>>
}) {
	args.setName('')
	args.setRegion('')
	args.setSubmitError(null)
	args.setAwsDefaults(createInitialAWSDefaults())
	args.setGcsDefaults(createInitialGCSDefaults())
	args.setAzureDefaults(createInitialAzureDefaults())
}
