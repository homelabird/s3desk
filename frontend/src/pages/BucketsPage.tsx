import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Empty, Grid, Space, Spin, Tooltip, Typography, message } from 'antd'
import { DeleteOutlined, FileTextOutlined } from '@ant-design/icons'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError } from '../api/client'
import type { BucketCreateRequest, Profile } from '../api/types'
import { DialogModal } from '../components/DialogModal'
import { PageHeader } from '../components/PageHeader'
import { SetupCallout } from '../components/SetupCallout'
import { mountImperativeDialog } from '../components/imperativeDialog'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { getProviderCapabilities, getProviderCapabilityReason } from '../lib/providerCapabilities'
import styles from './BucketsPage.module.css'

type Props = {
	apiToken: string
	profileId: string | null
}

const BucketModal = lazy(async () => {
	const m = await import('./buckets/BucketModal')
	return { default: m.BucketModal }
})
const BucketPolicyModal = lazy(async () => {
	const m = await import('./buckets/BucketPolicyModal')
	return { default: m.BucketPolicyModal }
})

function showBucketNotEmptyDialog(args: { bucketName: string; onOpenObjects: () => void; onCreateDeleteJob: () => void }) {
	mountImperativeDialog((close) => (
		<DialogModal
			open
			onClose={close}
			title={`Bucket "${args.bucketName}" isn’t empty`}
			width={560}
			footer={
				<>
					<Button onClick={close}>Close</Button>
					<Button
						type="primary"
						danger
						onClick={() => {
							close()
							args.onCreateDeleteJob()
						}}
					>
						Delete all objects (job)
					</Button>
				</>
			}
		>
			<Space orientation="vertical" className={styles.dialogBody}>
				<Typography.Text>Only empty buckets can be deleted.</Typography.Text>
				<Typography.Text type="secondary">Browse the objects first or create a delete job to empty it.</Typography.Text>
				<Button
					type="link"
					onClick={() => {
						close()
						args.onOpenObjects()
					}}
				>
					Open Objects
				</Button>
			</Space>
		</DialogModal>
	))
}

export function BucketsPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const navigate = useNavigate()
	const screens = Grid.useBreakpoint()
	const useCompactList = !screens.lg

	const [createOpen, setCreateOpen] = useState(false)
	const [deletingBucket, setDeletingBucket] = useState<string | null>(null)
	const [policyBucket, setPolicyBucket] = useState<string | null>(null)

	const metaQuery = useQuery({
		queryKey: ['meta', props.apiToken],
		queryFn: () => api.getMeta(),
		enabled: !!props.apiToken,
	})

	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: () => api.listProfiles(),
		enabled: !!props.apiToken,
	})
	const selectedProfile: Profile | null = useMemo(() => {
		if (!props.profileId) return null
		return profilesQuery.data?.find((p) => p.id === props.profileId) ?? null
	}, [profilesQuery.data, props.profileId])
	const profileResolved = !props.profileId || profilesQuery.isSuccess
	const capabilities = selectedProfile
		? getProviderCapabilities(selectedProfile.provider, metaQuery.data?.capabilities?.providers, selectedProfile)
		: null
	const bucketCrudSupported = capabilities?.bucketCrud ?? true
	const bucketCrudUnsupportedReason =
		getProviderCapabilityReason(capabilities, 'bucketCrud') ??
		'Bucket operations are not supported by this profile.'
	const policySupported = capabilities ? capabilities.bucketPolicy || capabilities.gcsIamPolicy || capabilities.azureContainerAccessPolicy : false
	const policyUnsupportedReason =
		getProviderCapabilityReason(capabilities, 'bucketPolicy') ??
		getProviderCapabilityReason(capabilities, 'gcsIamPolicy') ??
		getProviderCapabilityReason(capabilities, 'azureContainerAccessPolicy') ??
		'Policy management is not supported by this provider.'

	const bucketsQuery = useQuery({
		queryKey: ['buckets', props.profileId, props.apiToken],
		queryFn: () => api.listBuckets(props.profileId!),
		enabled: !!props.profileId && profileResolved && bucketCrudSupported,
	})
	const buckets = bucketsQuery.data ?? []
	const showBucketsEmpty = bucketCrudSupported && !bucketsQuery.isFetching && buckets.length === 0

	const createMutation = useMutation({
		mutationFn: (req: BucketCreateRequest) => api.createBucket(props.profileId!, req),
		onSuccess: async () => {
			message.success('Bucket created')
			await queryClient.invalidateQueries({ queryKey: ['buckets'] })
			setCreateOpen(false)
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const deleteMutation = useMutation({
		mutationFn: (bucketName: string) => api.deleteBucket(props.profileId!, bucketName),
		onMutate: (bucketName) => setDeletingBucket(bucketName),
		onSuccess: async () => {
			message.success('Bucket deleted')
			await queryClient.invalidateQueries({ queryKey: ['buckets'] })
		},
		onSettled: (_, __, bucketName) => setDeletingBucket((prev) => (prev === bucketName ? null : prev)),
		onError: (err, bucketName) => {
			if (err instanceof APIError && err.code === 'bucket_not_empty') {
				showBucketNotEmptyDialog({
					bucketName,
					onOpenObjects: () => {
						window.localStorage.setItem('bucket', JSON.stringify(bucketName))
						window.localStorage.setItem('prefix', JSON.stringify(''))
						navigate('/objects')
					},
					onCreateDeleteJob: () => {
						window.localStorage.setItem('bucket', JSON.stringify(bucketName))
						navigate('/jobs', { state: { openDeleteJob: true, bucket: bucketName, deleteAll: true } })
					},
				})
				return
			}
			message.error(formatErr(err))
		},
	})

	if (!props.profileId) {
		return <SetupCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to view buckets" />
	}

	const renderBucketActions = (bucketName: string) => (
		<div className={styles.actionGroup}>
			<Tooltip title={policySupported ? 'Manage bucket policy' : policyUnsupportedReason}>
				<span>
					<Button
						size="small"
						icon={<FileTextOutlined />}
						disabled={!policySupported}
						onClick={() => {
							setPolicyBucket(bucketName)
						}}
					>
						Policy
					</Button>
				</span>
			</Tooltip>

			<Button
				size="small"
				danger
				icon={<DeleteOutlined />}
				loading={deleteMutation.isPending && deletingBucket === bucketName}
				onClick={() => {
					confirmDangerAction({
						title: `Delete bucket "${bucketName}"?`,
						description: 'Only empty buckets can be deleted. If this fails, you can create a delete job to empty it.',
						confirmText: bucketName,
						confirmHint: `Type "${bucketName}" to confirm`,
						onConfirm: async () => {
							await deleteMutation.mutateAsync(bucketName)
						},
					})
				}}
			>
				Delete
			</Button>
		</div>
	)

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
							<Button type="primary" disabled={!bucketCrudSupported} onClick={() => setCreateOpen(true)}>
								New Bucket
							</Button>
						</span>
					</Tooltip>
				}
			/>

			{!bucketCrudSupported ? (
				<Alert type="warning" showIcon title="Bucket operations unavailable" description={bucketCrudUnsupportedReason} />
			) : null}

			{bucketsQuery.isError ? (
				<Alert type="error" showIcon title="Failed to load buckets" description={formatErr(bucketsQuery.error)} />
			) : null}

			{!bucketCrudSupported ? null : bucketsQuery.isFetching && buckets.length === 0 ? (
				<div className={styles.loadingRow}>
					<Spin />
				</div>
			) : showBucketsEmpty ? (
				<Empty description={
					<Space orientation="vertical" size={4}>
						<Typography.Text>No buckets found in this storage.</Typography.Text>
						<Typography.Text type="secondary">Create a new bucket, or check that your profile has the right permissions to list buckets.</Typography.Text>
					</Space>
				}>
					<Space>
						<Button type="primary" onClick={() => setCreateOpen(true)}>
							Create bucket
						</Button>
						<Button onClick={() => navigate('/profiles')} aria-label="View and edit profiles">
							Check profiles
						</Button>
					</Space>
				</Empty>
			) : (
				<div className={styles.tableWrap}>
					{useCompactList ? (
						<div className={styles.mobileList} data-testid="buckets-list-compact">
							{buckets.map((row) => (
								<article key={row.name} className={styles.mobileCard}>
									<Typography.Text strong className={styles.mobileCardTitle}>
										{row.name}
									</Typography.Text>
									<div className={styles.mobileMetaGrid}>
										<div>
											<div className={styles.metaLabel}>Created</div>
											<div className={styles.metaValue}>
												{row.createdAt ? formatDateTime(row.createdAt) : '-'}
											</div>
										</div>
										<div>
											<div className={styles.metaLabel}>Policy</div>
											<div className={styles.metaValue}>{policySupported ? 'Available' : 'Unsupported'}</div>
										</div>
									</div>
									<div className={styles.mobileActionRow}>{renderBucketActions(row.name)}</div>
								</article>
							))}
						</div>
					) : (
						<div className={styles.desktopTable} data-testid="buckets-table-desktop">
							<table className={styles.table}>
								<caption className="sr-only">List of buckets</caption>
								<thead>
									<tr className={styles.headRow}>
										<th scope="col" className={styles.th}>
											Name
										</th>
										<th scope="col" className={`${styles.th} ${styles.thCreated}`}>
											CreatedAt
										</th>
										<th scope="col" className={`${styles.th} ${styles.thActions}`}>
											Actions
										</th>
									</tr>
								</thead>
								<tbody>
									{buckets.map((row) => (
										<tr key={row.name} className={styles.tableRow}>
											<td className={styles.td}>
												<Typography.Text strong className={styles.bucketName}>
													{row.name}
												</Typography.Text>
											</td>
											<td className={styles.td}>
												{row.createdAt ? (
													<Typography.Text code title={row.createdAt}>
														{formatDateTime(row.createdAt)}
													</Typography.Text>
												) : (
													<Typography.Text type="secondary">-</Typography.Text>
												)}
											</td>
											<td className={styles.td}>{renderBucketActions(row.name)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			<Suspense fallback={null}>
				{createOpen ? (
					<BucketModal
						open
						provider={selectedProfile?.provider}
						onCancel={() => setCreateOpen(false)}
						onSubmit={(req) => createMutation.mutate(req)}
						loading={createMutation.isPending}
					/>
				) : null}

				{policyBucket ? (
					<BucketPolicyModal
						key={policyBucket}
						api={api}
						apiToken={props.apiToken}
						profileId={props.profileId}
						provider={selectedProfile?.provider}
						bucket={policyBucket}
						onClose={() => setPolicyBucket(null)}
					/>
				) : null}
			</Suspense>
		</Space>
	)
}
