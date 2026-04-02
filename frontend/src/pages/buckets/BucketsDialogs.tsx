import { lazy, Suspense, useState } from 'react'

import { Button, Checkbox, Space, Typography } from 'antd'

import type { APIClient } from '../../api/client'
import type { BucketCreateRequest, Profile } from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
import { buildDialogPreferenceKey, setDialogDismissed } from '../../lib/dialogPreferences'
import styles from '../BucketsPage.module.css'

const BucketModal = lazy(async () => {
	const m = await import('./BucketModal')
	return { default: m.BucketModal }
})
const BucketPolicyModal = lazy(async () => {
	const m = await import('./BucketPolicyModal')
	return { default: m.BucketPolicyModal }
})
const BucketGovernanceModal = lazy(async () => {
	const m = await import('./BucketGovernanceModal')
	return { default: m.BucketGovernanceModal }
})

const BUCKET_NOT_EMPTY_DIALOG_KEY = buildDialogPreferenceKey('warning', 'bucket_not_empty')

type BucketDialogsProps = {
	api: APIClient
	apiToken: string
	profileId: string | null
	selectedProfileProvider?: Profile['provider']
	createOpen: boolean
	closeCreateModal: () => void
	submitCreateBucket: (req: BucketCreateRequest) => void
	createLoading: boolean
	policyBucket: string | null
	closePolicyModal: () => void
	openControlsModal: (bucketName: string) => void
	controlsBucket: string | null
	closeControlsModal: () => void
	openPolicyModal: (bucketName: string) => void
	bucketNotEmptyDialogBucket: string | null
	closeBucketNotEmptyDialog: () => void
	openBucketNotEmptyObjects: () => void
	openBucketNotEmptyDeleteJob: () => void
}

function BucketNotEmptyDialog(props: {
	apiToken: string
	bucketName: string
	onOpenObjects: () => void
	onCreateDeleteJob: () => void
	onClose: () => void
}) {
	const [dismissNextTime, setDismissNextTime] = useState(false)
	const closeAndRemember = () => {
		if (dismissNextTime) {
			setDialogDismissed(BUCKET_NOT_EMPTY_DIALOG_KEY, true, props.apiToken)
		}
		props.onClose()
	}

	return (
		<DialogModal
			open
			onClose={closeAndRemember}
			title={`Bucket "${props.bucketName}" isn’t empty`}
			width={560}
			footer={
				<>
					<Button onClick={closeAndRemember}>Close</Button>
					<Button
						type="primary"
						danger
						onClick={() => {
							closeAndRemember()
							props.onCreateDeleteJob()
						}}
					>
						Delete all objects (job)
					</Button>
				</>
			}
		>
			<Space orientation="vertical" className={styles.dialogBody}>
				<Typography.Text>Only empty buckets can be deleted.</Typography.Text>
				<Typography.Text type="secondary">
					Browse the objects first or create a delete job to empty it.
				</Typography.Text>
				<Button
					type="link"
					onClick={() => {
						closeAndRemember()
						props.onOpenObjects()
					}}
				>
					Open Objects
				</Button>
				<Checkbox checked={dismissNextTime} onChange={(event) => setDismissNextTime(event.target.checked)}>
					Do not show this warning modal again. You can re-enable it from Settings.
				</Checkbox>
			</Space>
		</DialogModal>
	)
}

export function BucketsDialogs(props: BucketDialogsProps) {
	const policyBucket = props.policyBucket
	const controlsBucket = props.controlsBucket
	const bucketNotEmptyDialogBucket = props.bucketNotEmptyDialogBucket

	return (
		<Suspense fallback={null}>
			{props.createOpen ? (
				<BucketModal
					key={`${props.profileId ?? 'none'}:${props.apiToken}:${props.selectedProfileProvider ?? 'unknown'}`}
					open
					provider={props.selectedProfileProvider}
					onCancel={props.closeCreateModal}
					onSubmit={(req) => {
						void props.submitCreateBucket(req)
					}}
					loading={props.createLoading}
				/>
			) : null}

			{policyBucket && props.profileId ? (
				<BucketPolicyModal
					key={policyBucket}
					api={props.api}
					apiToken={props.apiToken}
					profileId={props.profileId}
					provider={props.selectedProfileProvider}
					bucket={policyBucket}
					onClose={props.closePolicyModal}
					onOpenControls={props.openControlsModal}
				/>
			) : null}

			{controlsBucket && props.profileId ? (
				<BucketGovernanceModal
					key={controlsBucket}
					api={props.api}
					apiToken={props.apiToken}
					profileId={props.profileId}
					provider={props.selectedProfileProvider}
					bucket={controlsBucket}
					onClose={props.closeControlsModal}
					onOpenAdvancedPolicy={props.openPolicyModal}
				/>
			) : null}

			{bucketNotEmptyDialogBucket ? (
				<BucketNotEmptyDialog
					apiToken={props.apiToken}
					bucketName={bucketNotEmptyDialogBucket}
					onClose={props.closeBucketNotEmptyDialog}
					onOpenObjects={props.openBucketNotEmptyObjects}
					onCreateDeleteJob={props.openBucketNotEmptyDeleteJob}
				/>
			) : null}
		</Suspense>
	)
}
