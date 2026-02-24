import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Empty, Modal, Space, Spin, Tooltip, Typography, message } from 'antd'
import { DeleteOutlined, FileTextOutlined } from '@ant-design/icons'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError } from '../api/client'
import type { BucketCreateRequest, Profile } from '../api/types'
import { SetupCallout } from '../components/SetupCallout'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { getProviderCapabilities, getProviderCapabilityReason } from '../lib/providerCapabilities'

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

export function BucketsPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const navigate = useNavigate()

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
	const capabilities = getProviderCapabilities(selectedProfile?.provider, metaQuery.data?.capabilities?.providers)
	const policySupported = capabilities.bucketPolicy || capabilities.gcsIamPolicy || capabilities.azureContainerAccessPolicy
	const policyUnsupportedReason =
		getProviderCapabilityReason(capabilities, 'bucketPolicy') ??
		getProviderCapabilityReason(capabilities, 'gcsIamPolicy') ??
		getProviderCapabilityReason(capabilities, 'azureContainerAccessPolicy') ??
		'Policy management is not supported by this provider.'

	const bucketsQuery = useQuery({
		queryKey: ['buckets', props.profileId, props.apiToken],
		queryFn: () => api.listBuckets(props.profileId!),
		enabled: !!props.profileId,
	})
	const buckets = bucketsQuery.data ?? []
	const showBucketsEmpty = !bucketsQuery.isFetching && buckets.length === 0

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
				Modal.confirm({
					title: `Bucket "${bucketName}" isn’t empty`,
					content: (
						<Space orientation="vertical" style={{ width: '100%' }}>
								<Typography.Text>Only empty buckets can be deleted.</Typography.Text>
								<Typography.Text type="secondary">Browse the objects first or create a delete job to empty it.</Typography.Text>
								<Button
									type="link"
									onClick={() => {
										Modal.destroyAll()
										window.localStorage.setItem('bucket', JSON.stringify(bucketName))
										window.localStorage.setItem('prefix', JSON.stringify(''))
										navigate('/objects')
									}}
								>
									Open Objects
								</Button>
							</Space>
						),
					okText: 'Delete all objects (job)',
					okType: 'danger',
					cancelText: 'Close',
					onOk: async () => {
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

	return (
		<Space orientation="vertical" size="large" style={{ width: '100%' }}>
			<div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<Typography.Title level={2} style={{ margin: 0 }}>
					Buckets
				</Typography.Title>
				<Button type="primary" onClick={() => setCreateOpen(true)}>
					New Bucket
				</Button>
			</div>

			{bucketsQuery.isError ? (
				<Alert type="error" showIcon title="Failed to load buckets" description={formatErr(bucketsQuery.error)} />
			) : null}

			{bucketsQuery.isFetching && buckets.length === 0 ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
					<Spin />
				</div>
			) : showBucketsEmpty ? (
				<Empty description={
					<Space direction="vertical" size={4}>
						<Typography.Text>No buckets found in this storage.</Typography.Text>
						<Typography.Text type="secondary">Create a new bucket, or check that your profile has the right permissions to list buckets.</Typography.Text>
					</Space>
				}>
					<Space>
						<Button type="primary" onClick={() => setCreateOpen(true)}>
							Create bucket
						</Button>
						<Button onClick={() => navigate('/profiles?ui=full')} aria-label="View and edit profiles">
							Check profiles
						</Button>
					</Space>
				</Empty>
			) : (
				<div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflowX: 'auto' }}>
					<table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
						<caption className="sr-only">List of buckets</caption>
						<thead>
							<tr style={{ background: '#fafafa' }}>
								<th scope="col" style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>Name</th>
								<th scope="col" style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #f0f0f0', width: 220 }}>
									CreatedAt
								</th>
								<th scope="col" style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #f0f0f0', width: 220 }}>
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{buckets.map((row) => (
								<tr key={row.name}>
									<td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
										<Typography.Text strong>{row.name}</Typography.Text>
									</td>
									<td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
										{row.createdAt ? (
											<Typography.Text code title={row.createdAt}>
												{formatDateTime(row.createdAt)}
											</Typography.Text>
										) : (
											<Typography.Text type="secondary">-</Typography.Text>
										)}
									</td>
									<td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
										<Space wrap>
											<Tooltip title={policySupported ? 'Manage bucket policy' : policyUnsupportedReason}>
												<span>
													<Button
														size="small"
														icon={<FileTextOutlined />}
														disabled={!policySupported}
														onClick={() => {
															setPolicyBucket(row.name)
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
												loading={deleteMutation.isPending && deletingBucket === row.name}
												onClick={() => {
													confirmDangerAction({
														title: `Delete bucket "${row.name}"?`,
														description:
															'Only empty buckets can be deleted. If this fails, you can create a delete job to empty it.',
														confirmText: row.name,
														confirmHint: `Type "${row.name}" to confirm`,
														onConfirm: async () => {
															await deleteMutation.mutateAsync(row.name)
														},
													})
												}}
											>
												Delete
											</Button>
										</Space>
									</td>
								</tr>
							))}
						</tbody>
					</table>
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
