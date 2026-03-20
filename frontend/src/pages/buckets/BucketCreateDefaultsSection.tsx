import { Alert } from 'antd'
import type { Dispatch, SetStateAction } from 'react'

import type { Profile } from '../../api/types'
import styles from './BucketModal.module.css'
import { AwsBucketCreateDefaults } from './create/aws-defaults'
import { AzureBucketCreateDefaults } from './create/azure-defaults'
import { GcsBucketCreateDefaults } from './create/gcs-defaults'
import type { AwsDefaultsState, AzureDefaultsState, GcsDefaultsState } from './create/types'

export function BucketCreateDefaultsSection(props: {
	provider?: Profile['provider']
	awsDefaults: AwsDefaultsState
	onAwsDefaultsChange: Dispatch<SetStateAction<AwsDefaultsState>>
	gcsDefaults: GcsDefaultsState
	onGcsDefaultsChange: Dispatch<SetStateAction<GcsDefaultsState>>
	azureDefaults: AzureDefaultsState
	onAzureDefaultsChange: Dispatch<SetStateAction<AzureDefaultsState>>
	clearSubmitError: () => void
	nextKey: () => string
}) {
	switch (props.provider) {
		case 'aws_s3':
			return (
				<AwsBucketCreateDefaults
					state={props.awsDefaults}
					onChange={props.onAwsDefaultsChange}
					clearSubmitError={props.clearSubmitError}
				/>
			)
		case 'gcp_gcs':
			return (
				<GcsBucketCreateDefaults
					state={props.gcsDefaults}
					onChange={props.onGcsDefaultsChange}
					clearSubmitError={props.clearSubmitError}
					nextKey={props.nextKey}
				/>
			)
		case 'azure_blob':
			return (
				<AzureBucketCreateDefaults
					state={props.azureDefaults}
					onChange={props.onAzureDefaultsChange}
					clearSubmitError={props.clearSubmitError}
					nextKey={props.nextKey}
				/>
			)
		default:
			if (!props.provider) return null
			return (
				<Alert
					type="info"
					showIcon
					className={styles.providerHint}
					title="Create-time secure defaults are not available for this provider yet."
					description="Create the bucket first, then use provider-specific controls or policy management afterward."
				/>
			)
	}
}
