import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Form, Input, Modal, Space, Switch, Table, Typography, message } from 'antd'
import { useMemo, useState } from 'react'

import { APIClient, APIError } from '../api/client'
import type { Profile, ProfileCreateRequest, ProfileUpdateRequest } from '../api/types'

type Props = {
	apiToken: string
	profileId: string | null
	setProfileId: (v: string | null) => void
}

export function ProfilesPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])

	const [createOpen, setCreateOpen] = useState(false)
	const [editProfile, setEditProfile] = useState<Profile | null>(null)
	const [testingProfileId, setTestingProfileId] = useState<string | null>(null)
	const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null)

	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: () => api.listProfiles(),
	})

	const createMutation = useMutation({
		mutationFn: (req: ProfileCreateRequest) => api.createProfile(req),
		onSuccess: async (created) => {
			message.success('Profile created')
			props.setProfileId(created.id)
			await queryClient.invalidateQueries({ queryKey: ['profiles'] })
			setCreateOpen(false)
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const updateMutation = useMutation({
		mutationFn: (args: { id: string; req: ProfileUpdateRequest }) => api.updateProfile(args.id, args.req),
		onSuccess: async () => {
			message.success('Profile updated')
			await queryClient.invalidateQueries({ queryKey: ['profiles'] })
			setEditProfile(null)
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.deleteProfile(id),
		onMutate: (id) => setDeletingProfileId(id),
		onSuccess: async (_, id) => {
			message.success('Profile deleted')
			if (props.profileId === id) {
				props.setProfileId(null)
			}
			await queryClient.invalidateQueries({ queryKey: ['profiles'] })
		},
		onSettled: (_, __, id) => setDeletingProfileId((prev) => (prev === id ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const testMutation = useMutation({
		mutationFn: (id: string) => api.testProfile(id),
		onMutate: (id) => setTestingProfileId(id),
		onSuccess: (resp) => {
			if (resp.ok) message.success('Profile test OK')
			else message.warning(resp.message ?? 'Profile test failed')
		},
		onSettled: (_, __, id) => setTestingProfileId((prev) => (prev === id ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	return (
		<Space direction="vertical" size="large" style={{ width: '100%' }}>
			<div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<Typography.Title level={3} style={{ margin: 0 }}>
					Profiles
				</Typography.Title>
				<Button type="primary" onClick={() => setCreateOpen(true)}>
					New Profile
				</Button>
			</div>

			{props.apiToken ? null : (
				<Alert
					type="info"
					showIcon
					message="API Token is empty"
					description="If your backend is started with API_TOKEN, set it in Settings."
				/>
			)}

			{profilesQuery.isError ? (
				<Alert type="error" showIcon message="Failed to load profiles" description={formatErr(profilesQuery.error)} />
			) : null}

			<Table
				rowKey="id"
				loading={profilesQuery.isFetching}
				dataSource={profilesQuery.data ?? []}
				pagination={false}
				scroll={{ x: true }}
				columns={[
					{
						title: 'Name',
						dataIndex: 'name',
						render: (v: string, row: Profile) => (
							<Space>
								<Typography.Text strong>{v}</Typography.Text>
								{props.profileId === row.id ? <Typography.Text type="success">Active</Typography.Text> : null}
							</Space>
						),
					},
					{ title: 'Endpoint', dataIndex: 'endpoint' },
					{ title: 'Region', dataIndex: 'region' },
					{
						title: 'Flags',
						render: (_, row: Profile) => (
							<Typography.Text type="secondary">
								{row.forcePathStyle ? 'path-style' : 'virtual-host'} /{' '}
								{row.tlsInsecureSkipVerify ? 'tls-skip' : 'tls-verify'}
							</Typography.Text>
						),
					},
					{
						title: 'Actions',
						render: (_, row: Profile) => (
							<Space>
								<Button size="small" onClick={() => props.setProfileId(row.id)}>
									Use
								</Button>
								<Button size="small" onClick={() => setEditProfile(row)}>
									Edit
								</Button>
								<Button
									size="small"
									onClick={() => testMutation.mutate(row.id)}
									loading={testMutation.isPending && testingProfileId === row.id}
								>
									Test
								</Button>
								<Button
									size="small"
									danger
									onClick={() => deleteMutation.mutate(row.id)}
									loading={deleteMutation.isPending && deletingProfileId === row.id}
								>
									Delete
								</Button>
							</Space>
						),
					},
				]}
			/>

			<ProfileModal
				open={createOpen}
				title="Create Profile"
				okText="Create"
				onCancel={() => setCreateOpen(false)}
				onSubmit={(values) => createMutation.mutate(toCreateRequest(values))}
				loading={createMutation.isPending}
			/>

			<ProfileModal
				open={!!editProfile}
				title="Edit Profile"
				okText="Save"
				onCancel={() => setEditProfile(null)}
				onSubmit={(values) => {
					if (!editProfile) return
					const patch = toUpdateRequest(values)
					updateMutation.mutate({ id: editProfile.id, req: patch })
				}}
				loading={updateMutation.isPending}
				initialValues={{
					name: editProfile?.name,
					endpoint: editProfile?.endpoint,
					region: editProfile?.region,
					forcePathStyle: editProfile?.forcePathStyle,
					tlsInsecureSkipVerify: editProfile?.tlsInsecureSkipVerify,
				}}
				editMode
			/>
		</Space>
	)
}

function formatErr(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}

type ProfileFormValues = {
	name: string
	endpoint: string
	region: string
	accessKeyId: string
	secretAccessKey: string
	sessionToken?: string
	clearSessionToken: boolean
	forcePathStyle: boolean
	tlsInsecureSkipVerify: boolean
}

function toUpdateRequest(values: ProfileFormValues): ProfileUpdateRequest {
	const out: ProfileUpdateRequest = {
		name: values.name,
		endpoint: values.endpoint,
		region: values.region,
		forcePathStyle: values.forcePathStyle,
		tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
	}
	if (values.accessKeyId) out.accessKeyId = values.accessKeyId
	if (values.secretAccessKey) out.secretAccessKey = values.secretAccessKey
	if (values.clearSessionToken) out.sessionToken = ''
	else if (values.sessionToken) out.sessionToken = values.sessionToken
	return out
}

function toCreateRequest(values: ProfileFormValues): ProfileCreateRequest {
	return {
		name: values.name,
		endpoint: values.endpoint,
		region: values.region,
		accessKeyId: values.accessKeyId,
		secretAccessKey: values.secretAccessKey,
		sessionToken: values.sessionToken ? values.sessionToken : null,
		forcePathStyle: values.forcePathStyle,
		tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
	}
}

function ProfileModal(props: {
	open: boolean
	title: string
	okText: string
	onCancel: () => void
	onSubmit: (values: ProfileFormValues) => void
	loading: boolean
	initialValues?: Partial<ProfileFormValues>
	editMode?: boolean
}) {
	const [form] = Form.useForm<ProfileFormValues>()
	const clearSessionToken = Form.useWatch('clearSessionToken', form)

	return (
		<Modal
			open={props.open}
			title={props.title}
			okText={props.okText}
			okButtonProps={{ loading: props.loading }}
			onOk={() => form.submit()}
			onCancel={props.onCancel}
			destroyOnClose
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{
					name: '',
					endpoint: 'http://127.0.0.1:9000',
					region: 'us-east-1',
					accessKeyId: '',
					secretAccessKey: '',
					sessionToken: '',
					clearSessionToken: false,
					forcePathStyle: false,
					tlsInsecureSkipVerify: false,
					...props.initialValues,
				}}
				onFinish={(values) => props.onSubmit(values)}
			>
				<Form.Item name="name" label="Name" rules={[{ required: true }]}>
					<Input />
				</Form.Item>
				<Form.Item name="endpoint" label="Endpoint URL" rules={[{ required: true }]}>
					<Input placeholder="https://s3.example.com" />
				</Form.Item>
				<Form.Item name="region" label="Region" rules={[{ required: true }]}>
					<Input placeholder="us-east-1" />
				</Form.Item>

				<Space style={{ width: '100%' }} size="middle" align="start" wrap>
				<Form.Item
					name="accessKeyId"
					label={props.editMode ? 'Access Key ID (optional)' : 'Access Key ID'}
					rules={props.editMode ? [] : [{ required: true }]}
					style={{ flex: '1 1 260px', minWidth: 0 }}
				>
					<Input autoComplete="off" />
				</Form.Item>
				<Form.Item
					name="secretAccessKey"
					label={props.editMode ? 'Secret (optional)' : 'Secret'}
					rules={props.editMode ? [] : [{ required: true }]}
					style={{ flex: '1 1 260px', minWidth: 0 }}
				>
					<Input.Password autoComplete="off" />
				</Form.Item>
			</Space>

				<Form.Item name="sessionToken" label="Session Token (optional)">
					<Input.Password autoComplete="off" disabled={!!props.editMode && clearSessionToken} />
				</Form.Item>
				{props.editMode ? (
					<Form.Item name="clearSessionToken" valuePropName="checked">
						<Checkbox>Clear existing session token</Checkbox>
					</Form.Item>
				) : null}

				<Space size="large">
					<Form.Item name="forcePathStyle" label="Force Path Style" valuePropName="checked">
						<Switch />
					</Form.Item>
					<Form.Item name="tlsInsecureSkipVerify" label="TLS Insecure Skip Verify" valuePropName="checked">
						<Switch />
					</Form.Item>
				</Space>
			</Form>
		</Modal>
	)
}
