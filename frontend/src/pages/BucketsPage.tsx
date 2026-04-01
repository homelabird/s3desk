import { Alert, Button, Empty, Space, Spin, Tooltip, Typography } from 'antd'

import { PageHeader } from '../components/PageHeader'
import { SetupCallout } from '../components/SetupCallout'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import styles from './BucketsPage.module.css'
import { BucketsList } from './buckets/BucketsList'
import { BucketsDialogsPanel } from './buckets/BucketsDialogsPanel'
import { useBucketsPageState } from './buckets/useBucketsPageState'

type Props = {
	apiToken: string
	profileId: string | null
}

export function BucketsPage(props: Props) {
	const {
		api,
		useCompactList,
		selectedProfile,
		bucketCrudSupported,
		bucketCrudUnsupportedReason,
		policySupported,
		policyUnsupportedReason,
		controlsSupported,
		controlsUnsupportedReason,
		bucketsQuery,
		buckets,
		showBucketsEmpty,
		createOpen,
		openCreateModal,
		closeCreateModal,
		createMutation,
		deleteMutation,
		submitCreateBucket,
		deleteBucket,
		deletingBucket,
		openPolicyModal,
		openControlsModal,
		closePolicyModal,
		closeControlsModal,
		policyBucket,
		controlsBucket,
		bucketNotEmptyDialogBucket,
		closeBucketNotEmptyDialog,
		openBucketNotEmptyObjects,
		openBucketNotEmptyDeleteJob,
	} = useBucketsPageState({ apiToken: props.apiToken, profileId: props.profileId })

	if (!props.profileId) {
		return (
			<SetupCallout
				apiToken={props.apiToken}
				profileId={props.profileId}
				message="Select a profile to view buckets"
			/>
		)
	}

	return (
		<Space orientation="vertical" size="large" className={styles.fullWidth}>
			<PageHeader
				eyebrow="Storage"
				title="Buckets"
				subtitle={
					selectedProfile
						? `${selectedProfile.name} profile is active. Review bucket inventory, open policy management, and create new buckets from one place.`
						: 'Review bucket inventory, open policy management, and create new buckets from one place.'
				}
				actions={
					<Tooltip title={bucketCrudSupported ? 'Create a new bucket' : bucketCrudUnsupportedReason}>
						<span>
							<Button
								type="primary"
								disabled={!bucketCrudSupported}
								onClick={openCreateModal}
							>
								New Bucket
							</Button>
						</span>
					</Tooltip>
				}
			/>

			{!bucketCrudSupported ? (
				<Alert
					type="warning"
					showIcon
					title="Bucket operations unavailable"
					description={bucketCrudUnsupportedReason}
				/>
			) : null}

			{bucketsQuery.isError ? (
				<Alert
					type="error"
					showIcon
					title="Failed to load buckets"
					description={formatErr(bucketsQuery.error)}
				/>
			) : null}

			{!bucketCrudSupported ? null : bucketsQuery.isFetching && buckets.length === 0 ? (
				<div className={styles.loadingRow}>
					<Spin />
				</div>
			) : showBucketsEmpty ? (
				<Empty
					description={
						<Space orientation="vertical" size={4}>
							<Typography.Text>No buckets found in this storage.</Typography.Text>
							<Typography.Text type="secondary">
								Create a new bucket, or check that your profile has the right permissions to list buckets.
							</Typography.Text>
						</Space>
					}
				>
					<Space>
						<Button type="primary" onClick={openCreateModal}>
							Create bucket
						</Button>
						<Button
							onClick={() => {
								window.location.assign('/profiles')
							}}
							aria-label="View and edit profiles"
						>
							Check profiles
						</Button>
					</Space>
				</Empty>
			) : (
				<BucketsList
					buckets={buckets}
					useCompactList={useCompactList}
					policySupported={policySupported}
					policyUnsupportedReason={policyUnsupportedReason}
					controlsSupported={controlsSupported}
					controlsUnsupportedReason={controlsUnsupportedReason}
					deletePending={deleteMutation.isPending}
					deletingBucket={deletingBucket}
					onOpenControls={openControlsModal}
					onOpenPolicy={openPolicyModal}
					onDelete={deleteBucket}
				/>
			)}

			<BucketsDialogsPanel
				api={api}
				apiToken={props.apiToken}
				profileId={props.profileId}
				selectedProfileProvider={selectedProfile?.provider}
				createOpen={createOpen}
				closeCreateModal={closeCreateModal}
				submitCreateBucket={submitCreateBucket}
				createLoading={createMutation.isPending}
				policyBucket={policyBucket}
				closePolicyModal={closePolicyModal}
				openControlsModal={openControlsModal}
				controlsBucket={controlsBucket}
				closeControlsModal={closeControlsModal}
				openPolicyModal={openPolicyModal}
				bucketNotEmptyDialogBucket={bucketNotEmptyDialogBucket}
				closeBucketNotEmptyDialog={closeBucketNotEmptyDialog}
				openBucketNotEmptyObjects={openBucketNotEmptyObjects}
				openBucketNotEmptyDeleteJob={openBucketNotEmptyDeleteJob}
			/>
		</Space>
	)
}
