import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Empty, Modal, Space, Table, Typography, message } from 'antd'
import { DeleteOutlined, FileTextOutlined } from '@ant-design/icons'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError } from '../api/client'
import type { BucketCreateRequest, Profile } from '../api/types'
import { SetupCallout } from '../components/SetupCallout'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { getProviderCapabilities } from '../lib/providerCapabilities'

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

	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: () => api.listProfiles(),
		enabled: !!props.apiToken,
	})
	const selectedProfile: Profile | null = useMemo(() => {
		if (!props.profileId) return null
		return profilesQuery.data?.find((p) => p.id === props.profileId) ?? null
	}, [profilesQuery.data, props.profileId])
	const capabilities = getProviderCapabilities(selectedProfile?.provider)

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
						<Space direction="vertical" style={{ width: '100%' }}>
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
		<Space direction="vertical" size="large" style={{ width: '100%' }}>
			<div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<Typography.Title level={3} style={{ margin: 0 }}>
					Buckets
				</Typography.Title>
				<Button type="primary" onClick={() => setCreateOpen(true)}>
					New Bucket
				</Button>
			</div>

			{bucketsQuery.isError ? (
				<Alert type="error" showIcon message="Failed to load buckets" description={formatErr(bucketsQuery.error)} />
			) : null}

			<Table
				rowKey="name"
				loading={bucketsQuery.isFetching}
				dataSource={buckets}
				pagination={false}
				scroll={{ x: true }}
				locale={{
					emptyText: showBucketsEmpty ? (
						<Empty description="No buckets yet">
							<Button type="primary" onClick={() => setCreateOpen(true)}>
								Create bucket
							</Button>
						</Empty>
					) : null,
				}}
				columns={[
					{ title: 'Name', dataIndex: 'name' },
					{
						title: 'CreatedAt',
						dataIndex: 'createdAt',
						render: (v?: string) =>
							v ? (
								<Typography.Text code title={v}>
									{formatDateTime(v)}
								</Typography.Text>
							) : (
								'-'
							),
					},
					{
						title: 'Actions',
						render: (_, row: { name: string }) => (
							<Space wrap>
								{capabilities.bucketPolicy || capabilities.gcsIamPolicy || capabilities.azureContainerAccessPolicy ? (
									<Button
										size="small"
										icon={<FileTextOutlined />}
										onClick={() => {
											setPolicyBucket(row.name)
										}}
									>
										Policy
									</Button>
								) : null}

								<Button
									size="small"
									danger
									icon={<DeleteOutlined />}
									loading={deleteMutation.isPending && deletingBucket === row.name}
									onClick={() => {
										confirmDangerAction({
											title: `Delete bucket "${row.name}"?`,
											description: 'Only empty buckets can be deleted. If this fails, you can create a delete job to empty it.',
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
						),
					},
				]}
			/>

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
