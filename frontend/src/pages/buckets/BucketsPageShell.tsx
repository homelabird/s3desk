import { Alert, Button, Empty, Space, Spin, Tooltip, Typography } from 'antd'

import { LinkButton } from '../../components/LinkButton'
import { PageHeader } from '../../components/PageHeader'
import { failedToLoadBucketsTitle } from '../../lib/actionHints'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import styles from '../BucketsPage.module.css'
import { BucketsDialogsPanel } from './BucketsDialogsPanel'
import { BucketsList } from './BucketsList'
import type { BucketsPageShellProps } from './bucketsPagePresentationTypes'

export function BucketsPageShell(props: BucketsPageShellProps) {
	return (
		<Space orientation="vertical" size="large" className={styles.fullWidth}>
			<PageHeader
				eyebrow="Storage"
				title="Buckets"
				subtitle={
					props.selectedProfile
						? `${props.selectedProfile.name} profile is active. Review bucket inventory, open policy management, and create new buckets from one place.`
						: 'Review bucket inventory, open policy management, and create new buckets from one place.'
				}
				actions={
					<Tooltip title={props.bucketCrudSupported ? 'Create a new bucket' : props.bucketCrudUnsupportedReason}>
						<span>
							<Button type="primary" disabled={!props.bucketCrudSupported} onClick={props.openCreateModal}>
								New Bucket
							</Button>
						</span>
					</Tooltip>
				}
			/>

			{!props.bucketCrudSupported ? (
				<Alert
					type="warning"
					showIcon
					title="Bucket operations unavailable"
					description={props.bucketCrudUnsupportedReason}
				/>
			) : null}

			{props.bucketsQueryError ? (
				<Alert
					type="error"
					showIcon
					title={failedToLoadBucketsTitle()}
					description={formatErr(props.bucketsQueryError)}
				/>
			) : null}

			{!props.bucketCrudSupported ? null : props.bucketsLoading ? (
				<div className={styles.loadingRow} role="status" aria-live="polite" aria-label="Loading buckets">
					<Spin />
					<span className="sr-only">Loading buckets...</span>
				</div>
			) : props.bucketsQueryError ? null : props.showBucketsEmpty ? (
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
						<Button type="primary" onClick={props.openCreateModal}>
							Create bucket
						</Button>
						<LinkButton to="/profiles" aria-label="View and edit profiles">
							Check profiles
						</LinkButton>
					</Space>
				</Empty>
			) : (
				<BucketsList {...props.list} />
			)}

			<BucketsDialogsPanel
				api={props.api}
				apiToken={props.apiToken}
				profileId={props.profileId}
				selectedProfileProvider={props.selectedProfileProvider}
				createOpen={props.createOpen}
				closeCreateModal={props.closeCreateModal}
				submitCreateBucket={props.submitCreateBucket}
				createLoading={props.createLoading}
				{...props.dialogs}
			/>
		</Space>
	)
}
