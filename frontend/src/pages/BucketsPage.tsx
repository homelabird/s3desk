import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Empty, Form, Input, Modal, Space, Table, Typography, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError } from '../api/client'
import type { BucketCreateRequest } from '../api/types'
import { SetupCallout } from '../components/SetupCallout'
import { confirmDangerAction } from '../lib/confirmDangerAction'

type Props = {
	apiToken: string
	profileId: string | null
}

export function BucketsPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const navigate = useNavigate()

	const [createOpen, setCreateOpen] = useState(false)
	const [deletingBucket, setDeletingBucket] = useState<string | null>(null)

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
					{ title: 'CreatedAt', dataIndex: 'createdAt', render: (v?: string) => v ?? '-' },
					{
						title: 'Actions',
						render: (_, row: { name: string }) => (
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
						),
					},
				]}
			/>

			<BucketModal
				open={createOpen}
				onCancel={() => setCreateOpen(false)}
				onSubmit={(req) => createMutation.mutate(req)}
				loading={createMutation.isPending}
			/>
		</Space>
	)
}

function formatErr(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}

function BucketModal(props: {
	open: boolean
	onCancel: () => void
	onSubmit: (req: BucketCreateRequest) => void
	loading: boolean
}) {
	const [form] = Form.useForm<{ name: string; region?: string }>()

	return (
		<Modal
			open={props.open}
			title="Create Bucket"
			okText="Create"
			okButtonProps={{ loading: props.loading }}
			onOk={() => form.submit()}
			onCancel={props.onCancel}
			destroyOnClose
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{ name: '', region: '' }}
				onFinish={(values) => {
					props.onSubmit({ name: values.name, region: values.region || undefined })
				}}
			>
				<Form.Item name="name" label="Bucket name" rules={[{ required: true }]}>
					<Input />
				</Form.Item>
				<Form.Item name="region" label="Region (optional)">
					<Input placeholder="us-east-1" />
				</Form.Item>
			</Form>
		</Modal>
	)
}
