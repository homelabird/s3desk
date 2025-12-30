import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Divider, Empty, Form, Input, Modal, Select, Space, Switch, Table, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError } from '../api/client'
import type { MetaResponse, Profile, ProfileCreateRequest, ProfileTLSConfig, ProfileTLSStatus, ProfileUpdateRequest } from '../api/types'

type Props = {
	apiToken: string
	profileId: string | null
	setProfileId: (v: string | null) => void
}

export function ProfilesPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const navigate = useNavigate()

	const [createOpen, setCreateOpen] = useState(false)
	const [editProfile, setEditProfile] = useState<Profile | null>(null)
	const [testingProfileId, setTestingProfileId] = useState<string | null>(null)
	const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null)

	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: () => api.listProfiles(),
	})
	const profiles = profilesQuery.data ?? []
	const showProfilesEmpty = !profilesQuery.isFetching && profiles.length === 0

	const metaQuery = useQuery({
		queryKey: ['meta', props.apiToken],
		queryFn: () => api.getMeta(),
	})

	const tlsCapability = metaQuery.data?.capabilities?.profileTls
	const tlsCapabilityEnabled = tlsCapability?.enabled ?? true

	const profileTLSQuery = useQuery({
		queryKey: ['profileTls', editProfile?.id, props.apiToken],
		enabled: !!editProfile && tlsCapabilityEnabled,
		queryFn: () => api.getProfileTLS(editProfile!.id),
	})

	const applyTLSUpdate = async (profileId: string, values: ProfileFormValues, mode: 'create' | 'edit') => {
		if (mode === 'create') {
			if (!values.tlsEnabled) return
			const tlsConfig = buildTLSConfigFromValues(values)
			if (!tlsConfig) throw new Error('mTLS requires client certificate and key')
			await api.updateProfileTLS(profileId, tlsConfig)
			await queryClient.invalidateQueries({ queryKey: ['profileTls', profileId] })
			return
		}

		const action = values.tlsAction ?? 'keep'
		if (action === 'keep') return
		if (action === 'disable') {
			await api.deleteProfileTLS(profileId)
			await queryClient.invalidateQueries({ queryKey: ['profileTls', profileId] })
			return
		}
		if (action === 'enable') {
			const tlsConfig = buildTLSConfigFromValues(values)
			if (!tlsConfig) throw new Error('mTLS requires client certificate and key')
			await api.updateProfileTLS(profileId, tlsConfig)
			await queryClient.invalidateQueries({ queryKey: ['profileTls', profileId] })
		}
	}

	const createMutation = useMutation({
		mutationFn: (values: ProfileFormValues) => api.createProfile(toCreateRequest(values)),
		onSuccess: async (created, values) => {
			message.success('Profile created')
			props.setProfileId(created.id)
			await queryClient.invalidateQueries({ queryKey: ['profiles'] })
			try {
				await applyTLSUpdate(created.id, values, 'create')
			} catch (err) {
				message.error(`mTLS update failed: ${formatErr(err)}`)
			}
			setCreateOpen(false)
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const updateMutation = useMutation({
		mutationFn: (args: { id: string; values: ProfileFormValues }) => api.updateProfile(args.id, toUpdateRequest(args.values)),
		onSuccess: async (_, args) => {
			message.success('Profile updated')
			await queryClient.invalidateQueries({ queryKey: ['profiles'] })
			try {
				await applyTLSUpdate(args.id, args.values, 'edit')
			} catch (err) {
				message.error(`mTLS update failed: ${formatErr(err)}`)
			}
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
			const details = resp.details ?? {}
			const storageType = typeof details.storageType === 'string' ? details.storageType : ''
			const storageSource = typeof details.storageTypeSource === 'string' ? details.storageTypeSource : ''
			const buckets = typeof details.buckets === 'number' ? details.buckets : null
			const errorDetail = typeof details.error === 'string' ? details.error : ''
			const suffixParts: string[] = []
			if (storageType) suffixParts.push(`type: ${storageType}`)
			if (storageSource) suffixParts.push(`source: ${storageSource}`)
			if (typeof buckets === 'number') suffixParts.push(`buckets: ${buckets}`)
			if (errorDetail && !resp.ok) suffixParts.push(`error: ${errorDetail}`)
			const suffix = suffixParts.length ? ` (${suffixParts.join(', ')})` : ''
			if (resp.ok) message.success(`Profile test OK${suffix}`)
			else message.warning(`${resp.message ?? 'Profile test failed'}${suffix}`)
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
					action={
						<Button size="small" onClick={() => navigate({ search: '?settings=1' })}>
							Open Settings
						</Button>
					}
				/>
			)}

			{profilesQuery.isError ? (
				<Alert type="error" showIcon message="Failed to load profiles" description={formatErr(profilesQuery.error)} />
			) : null}

			<Table
				rowKey="id"
				loading={profilesQuery.isFetching}
				dataSource={profiles}
				pagination={false}
				scroll={{ x: true }}
				locale={{
					emptyText: showProfilesEmpty ? (
						<Empty description="No profiles yet">
							<Button type="primary" onClick={() => setCreateOpen(true)}>
								Create profile
							</Button>
						</Empty>
					) : null,
				}}
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
								{row.preserveLeadingSlash ? 'leading-slash' : 'trim-leading-slash'} /{' '}
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
				onSubmit={(values) => createMutation.mutate(values)}
				loading={createMutation.isPending}
				tlsCapability={tlsCapability ?? null}
			/>

			<ProfileModal
				open={!!editProfile}
				title="Edit Profile"
				okText="Save"
				onCancel={() => setEditProfile(null)}
				onSubmit={(values) => {
					if (!editProfile) return
					updateMutation.mutate({ id: editProfile.id, values })
				}}
				loading={updateMutation.isPending}
				initialValues={{
					name: editProfile?.name,
					endpoint: editProfile?.endpoint,
					region: editProfile?.region,
					forcePathStyle: editProfile?.forcePathStyle,
					preserveLeadingSlash: editProfile?.preserveLeadingSlash,
					tlsInsecureSkipVerify: editProfile?.tlsInsecureSkipVerify,
				}}
				editMode
				tlsCapability={tlsCapability ?? null}
				tlsStatus={profileTLSQuery.data ?? null}
				tlsStatusLoading={profileTLSQuery.isFetching}
				tlsStatusError={profileTLSQuery.isError ? formatErr(profileTLSQuery.error) : null}
			/>
		</Space>
	)
}

function formatErr(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}

function buildTLSConfigFromValues(values: ProfileFormValues): ProfileTLSConfig | null {
	const clientCertPem = values.tlsClientCertPem?.trim() ?? ''
	const clientKeyPem = values.tlsClientKeyPem?.trim() ?? ''
	if (!clientCertPem || !clientKeyPem) return null
	const caCertPem = values.tlsCaCertPem?.trim() ?? ''
	const serverName = values.tlsServerName?.trim() ?? ''

	const cfg: ProfileTLSConfig = {
		mode: 'mtls',
		clientCertPem,
		clientKeyPem,
	}
	if (caCertPem) cfg.caCertPem = caCertPem
	if (serverName) cfg.serverName = serverName
	return cfg
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
	preserveLeadingSlash: boolean
	tlsInsecureSkipVerify: boolean
	tlsEnabled?: boolean
	tlsAction?: TLSAction
	tlsClientCertPem?: string
	tlsClientKeyPem?: string
	tlsCaCertPem?: string
	tlsServerName?: string
}

type TLSAction = 'keep' | 'enable' | 'disable'
type TLSCapability = MetaResponse['capabilities']['profileTls']

function toUpdateRequest(values: ProfileFormValues): ProfileUpdateRequest {
	const out: ProfileUpdateRequest = {
		name: values.name,
		endpoint: values.endpoint,
		region: values.region,
		forcePathStyle: values.forcePathStyle,
		preserveLeadingSlash: values.preserveLeadingSlash,
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
		preserveLeadingSlash: values.preserveLeadingSlash,
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
	tlsCapability?: TLSCapability | null
	tlsStatus?: ProfileTLSStatus | null
	tlsStatusLoading?: boolean
	tlsStatusError?: string | null
}) {
	const [form] = Form.useForm<ProfileFormValues>()
	const clearSessionToken = Form.useWatch('clearSessionToken', form)
	const tlsEnabled = Form.useWatch('tlsEnabled', form)
	const tlsAction = Form.useWatch('tlsAction', form)
	const tlsUnavailable = props.tlsCapability?.enabled === false
	const tlsDisabledReason = props.tlsCapability?.reason ?? 'mTLS is disabled on the server.'
	const showTLSFields = !tlsUnavailable && (props.editMode ? tlsAction === 'enable' : !!tlsEnabled)
	const tlsStatusLabel = tlsUnavailable ? 'unavailable' : props.tlsStatusLoading ? 'loading…' : props.tlsStatus?.mode === 'mtls' ? 'enabled' : 'disabled'
	const showTLSStatusError = !tlsUnavailable && props.tlsStatusError

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
					preserveLeadingSlash: false,
					tlsInsecureSkipVerify: false,
					tlsEnabled: false,
					tlsAction: 'keep',
					tlsClientCertPem: '',
					tlsClientKeyPem: '',
					tlsCaCertPem: '',
					tlsServerName: '',
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
					<Input autoComplete="username" />
				</Form.Item>
				<Form.Item
					name="secretAccessKey"
					label={props.editMode ? 'Secret (optional)' : 'Secret'}
					rules={props.editMode ? [] : [{ required: true }]}
					style={{ flex: '1 1 260px', minWidth: 0 }}
				>
					<Input.Password autoComplete="new-password" />
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

				<Space size="large" wrap>
					<Form.Item name="forcePathStyle" label="Force Path Style" valuePropName="checked">
						<Switch />
					</Form.Item>
					<Form.Item name="preserveLeadingSlash" label="Preserve Leading Slash" valuePropName="checked">
						<Switch />
					</Form.Item>
					<Form.Item name="tlsInsecureSkipVerify" label="TLS Insecure Skip Verify" valuePropName="checked">
						<Switch />
					</Form.Item>
				</Space>

				<Divider />

				<Space direction="vertical" size="small" style={{ width: '100%' }}>
					<Typography.Text strong>Advanced TLS (mTLS)</Typography.Text>
					{tlsUnavailable ? <Alert type="warning" showIcon message="mTLS is disabled" description={tlsDisabledReason} /> : null}
					{props.editMode ? (
						<>
							<Typography.Text type="secondary">
								Current: {tlsStatusLabel}
							</Typography.Text>
							{showTLSStatusError ? (
								<Alert type="warning" showIcon message="Failed to load TLS status" description={showTLSStatusError} />
							) : null}
							<Form.Item name="tlsAction" label="mTLS action">
								<Select
									disabled={tlsUnavailable}
									options={[
										{ label: 'Keep current', value: 'keep' },
										{ label: 'Enable or update', value: 'enable' },
										{ label: 'Disable', value: 'disable' },
									]}
								/>
							</Form.Item>
							{tlsAction === 'disable' ? (
								<Typography.Text type="secondary">mTLS will be removed for this profile.</Typography.Text>
							) : null}
						</>
					) : (
						<Form.Item name="tlsEnabled" label="Enable mTLS" valuePropName="checked">
							<Switch disabled={tlsUnavailable} />
						</Form.Item>
					)}

					{showTLSFields ? (
						<>
							<Form.Item
								name="tlsClientCertPem"
								label="Client Certificate (PEM)"
								rules={[{ required: true, message: 'Client certificate is required' }]}
							>
								<Input.TextArea
									disabled={tlsUnavailable}
									autoSize={{ minRows: 4, maxRows: 8 }}
									placeholder="-----BEGIN CERTIFICATE-----"
								/>
							</Form.Item>
							<Form.Item
								name="tlsClientKeyPem"
								label="Client Key (PEM)"
								rules={[{ required: true, message: 'Client key is required' }]}
							>
								<Input.TextArea
									disabled={tlsUnavailable}
									autoSize={{ minRows: 4, maxRows: 8 }}
									placeholder="-----BEGIN PRIVATE KEY-----"
								/>
							</Form.Item>
							<Form.Item name="tlsCaCertPem" label="CA Certificate (optional)">
								<Input.TextArea
									disabled={tlsUnavailable}
									autoSize={{ minRows: 3, maxRows: 6 }}
									placeholder="-----BEGIN CERTIFICATE-----"
								/>
							</Form.Item>
							<Form.Item name="tlsServerName" label="Server Name (SNI, optional)">
								<Input disabled={tlsUnavailable} placeholder="s3.example.com" />
							</Form.Item>
						</>
					) : null}
				</Space>
			</Form>
		</Modal>
	)
}
