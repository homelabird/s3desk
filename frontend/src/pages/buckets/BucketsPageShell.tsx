import { Alert, Button, Empty, Space, Spin, Tooltip, Typography } from 'antd'
import type { ComponentProps } from 'react'

import type { APIClient } from '../../api/client'
import type { BucketCreateRequest, Profile } from '../../api/types'
import { LinkButton } from '../../components/LinkButton'
import { PageHeader } from '../../components/PageHeader'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import styles from '../BucketsPage.module.css'
import { BucketsDialogsPanel } from './BucketsDialogsPanel'
import { BucketsList, type BucketsListProps } from './BucketsList'

type BucketsDialogsPanelProps = ComponentProps<typeof BucketsDialogsPanel>

export type BucketsPageShellProps = {
	api: APIClient
	apiToken: string
	profileId: string
	selectedProfile: Profile | null
	bucketCrudSupported: boolean
	bucketCrudUnsupportedReason: string
	bucketsQueryError: unknown | null
	bucketsLoading: boolean
	buckets: BucketsListProps['buckets']
	showBucketsEmpty: boolean
	openCreateModal: () => void
	createOpen: boolean
	closeCreateModal: () => void
	submitCreateBucket: (req: BucketCreateRequest) => void
	createLoading: boolean
	selectedProfileProvider?: Profile['provider']
	list: BucketsListProps
	dialogs: Omit<
		BucketsDialogsPanelProps,
		'api' | 'apiToken' | 'profileId' | 'selectedProfileProvider' | 'createOpen' | 'closeCreateModal' | 'submitCreateBucket' | 'createLoading'
	>
}

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
					title="Failed to load buckets"
					description={formatErr(props.bucketsQueryError)}
				/>
			) : null}

			{!props.bucketCrudSupported ? null : props.bucketsLoading ? (
				<div className={styles.loadingRow}>
					<Spin />
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
