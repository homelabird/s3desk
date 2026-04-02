import type { ComponentProps } from 'react'

import { BucketsDialogs } from './BucketsDialogs'

type Props = ComponentProps<typeof BucketsDialogs>

export function BucketsDialogsHost(props: Props) {
	return (
		<BucketsDialogs
			api={props.api}
			apiToken={props.apiToken}
			profileId={props.profileId}
			selectedProfileProvider={props.selectedProfileProvider}
			createOpen={props.createOpen}
			closeCreateModal={props.closeCreateModal}
			submitCreateBucket={props.submitCreateBucket}
			createLoading={props.createLoading}
			policyBucket={props.policyBucket}
			closePolicyModal={props.closePolicyModal}
			openControlsModal={props.openControlsModal}
			controlsBucket={props.controlsBucket}
			closeControlsModal={props.closeControlsModal}
			openPolicyModal={props.openPolicyModal}
			bucketNotEmptyDialogBucket={props.bucketNotEmptyDialogBucket}
			closeBucketNotEmptyDialog={props.closeBucketNotEmptyDialog}
			openBucketNotEmptyObjects={props.openBucketNotEmptyObjects}
			openBucketNotEmptyDeleteJob={props.openBucketNotEmptyDeleteJob}
		/>
	)
}
