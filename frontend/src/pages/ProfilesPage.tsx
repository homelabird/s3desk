import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Divider, Empty, Form, Input, Modal, Select, Space, Spin, Switch, Table, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { APIClient } from '../api/client'
import type { MetaResponse, Profile, ProfileCreateRequest, ProfileTLSConfig, ProfileTLSStatus, ProfileUpdateRequest } from '../api/types'
import { clipboardFailureHint, copyToClipboard } from '../lib/clipboard'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'

type Props = {
	apiToken: string
	profileId: string | null
	setProfileId: (v: string | null) => void
}

export function ProfilesPage(props: Props) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const [createOpen, setCreateOpen] = useState(false)
	const [editProfile, setEditProfile] = useState<Profile | null>(null)
	const [testingProfileId, setTestingProfileId] = useState<string | null>(null)
	const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null)
	const [onboardingDismissed, setOnboardingDismissed] = useState(false)
	const [yamlOpen, setYamlOpen] = useState(false)
	const [yamlProfile, setYamlProfile] = useState<Profile | null>(null)
	const [yamlContent, setYamlContent] = useState('')
	const [yamlError, setYamlError] = useState<string | null>(null)
	const [exportingProfileId, setExportingProfileId] = useState<string | null>(null)

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

	const exportYamlMutation = useMutation({
		mutationFn: (id: string) => api.exportProfileYaml(id),
		onMutate: (id) => {
			setExportingProfileId(id)
			setYamlContent('')
			setYamlError(null)
		},
		onSuccess: (content) => {
			setYamlContent(content)
		},
		onError: (err) => {
			const msg = formatErr(err)
			setYamlError(msg)
			message.error(msg)
		},
		onSettled: (_, __, id) => setExportingProfileId((prev) => (prev === id ? null : prev)),
	})

	const openYamlModal = (profile: Profile) => {
		setYamlProfile(profile)
		setYamlOpen(true)
		exportYamlMutation.mutate(profile.id)
	}

	const closeYamlModal = () => {
		setYamlOpen(false)
		setYamlProfile(null)
		setYamlContent('')
		setYamlError(null)
	}

	const handleYamlCopy = async () => {
		if (!yamlContent) return
		const res = await copyToClipboard(yamlContent)
		if (res.ok) {
			message.success('Copied YAML')
			return
		}
		message.error(clipboardFailureHint())
	}

	const handleYamlDownload = () => {
		if (!yamlContent) return
		downloadTextFile(buildProfileExportFilename(yamlProfile), yamlContent)
		message.success('Downloaded YAML')
	}

	const apiTokenEnabled = metaQuery.data?.apiTokenEnabled ?? false
	const transferEngine = metaQuery.data?.transferEngine
	const onboardingVisible = !onboardingDismissed && (profiles.length === 0 || !props.profileId)
	const yamlFilename = buildProfileExportFilename(yamlProfile)

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
			{onboardingVisible ? (
				<Alert
					type="info"
					showIcon
					message="Getting started"
					description={
						<Space direction="vertical" size={12} style={{ width: '100%' }}>
							<Typography.Text type="secondary">Quick setup checklist.</Typography.Text>
							<Space direction="vertical" size={6}>
								<Checkbox checked={metaQuery.isSuccess} disabled>
									Backend connected
								</Checkbox>
								<Checkbox checked={transferEngine?.available ?? false} disabled>
									Transfer engine detected (rclone)
								</Checkbox>
								<Checkbox checked={transferEngine?.compatible ?? false} disabled>
									Transfer engine compatible
									{transferEngine?.minVersion ? ` (>= ${transferEngine.minVersion})` : ''}
								</Checkbox>
								<Checkbox
									checked={apiTokenEnabled ? !!props.apiToken.trim() : true}
									disabled
								>
									API token configured{apiTokenEnabled ? '' : ' (not required)'}
								</Checkbox>
								<Checkbox checked={profiles.length > 0} disabled>
									At least one profile created
								</Checkbox>
								<Checkbox checked={!!props.profileId} disabled>
									Active profile selected
								</Checkbox>
							</Space>
							<Space wrap>
								<Button size="small" type="primary" onClick={() => setCreateOpen(true)}>
									Create profile
								</Button>
								<Button size="small" onClick={() => navigate('/buckets')} disabled={!props.profileId}>
									Buckets
								</Button>
								<Button size="small" onClick={() => navigate('/objects')} disabled={!props.profileId}>
									Objects
								</Button>
								<Button size="small" type="link" onClick={() => setOnboardingDismissed(true)}>
									Dismiss
								</Button>
							</Space>
						</Space>
					}
				/>
			) : null}

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
									onClick={() => openYamlModal(row)}
									loading={exportYamlMutation.isPending && exportingProfileId === row.id}
								>
									YAML
								</Button>
								<Button
									size="small"
									danger
									onClick={() => {
										confirmDangerAction({
											title: `Delete profile "${row.name}"?`,
											description: 'This removes the profile and any TLS settings associated with it.',
											confirmText: row.name,
											confirmHint: `Type "${row.name}" to confirm`,
											onConfirm: async () => {
												await deleteMutation.mutateAsync(row.id)
											},
										})
									}}
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

			<Modal
				open={yamlOpen}
				title="Profile YAML"
				onCancel={closeYamlModal}
				footer={[
					<Button key="copy" disabled={!yamlContent} onClick={handleYamlCopy}>
						Copy
					</Button>,
					<Button key="download" type="primary" disabled={!yamlContent} onClick={handleYamlDownload}>
						Download
					</Button>,
					<Button key="close" onClick={closeYamlModal}>
						Close
					</Button>,
				]}
				destroyOnClose
			>
				<Space direction="vertical" size="middle" style={{ width: '100%' }}>
					<Alert
						type="warning"
						showIcon
						message="Contains credentials"
						description="This export includes access keys and secrets. Store it securely."
					/>
					{yamlProfile ? (
						<Typography.Text>
							Profile: <Typography.Text code>{yamlProfile.name}</Typography.Text>
						</Typography.Text>
					) : null}
					{yamlError ? <Alert type="error" showIcon message="Failed to load YAML" description={yamlError} /> : null}
					{exportYamlMutation.isPending && !yamlContent ? (
						<Spin />
					) : (
						<Input.TextArea value={yamlContent} readOnly autoSize={{ minRows: 6, maxRows: 16 }} />
					)}
					{yamlContent ? (
						<Typography.Text type="secondary">Filename: {yamlFilename}</Typography.Text>
					) : null}
				</Space>
			</Modal>
		</Space>
	)
}

function buildTLSConfigFromValues(values: ProfileFormValues): ProfileTLSConfig | null {
	const clientCertPem = values.tlsClientCertPem?.trim() ?? ''
	const clientKeyPem = values.tlsClientKeyPem?.trim() ?? ''
	if (!clientCertPem || !clientKeyPem) return null
	const caCertPem = values.tlsCaCertPem?.trim() ?? ''

	const cfg: ProfileTLSConfig = {
		mode: 'mtls',
		clientCertPem,
		clientKeyPem,
	}
	if (caCertPem) cfg.caCertPem = caCertPem
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
						</>
					) : null}
				</Space>
			</Form>
		</Modal>
	)
}

function downloadTextFile(filename: string, content: string): void {
	const blob = new Blob([content], { type: 'text/plain' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.style.display = 'none'
	document.body.appendChild(a)
	a.click()
	a.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildProfileExportFilename(profile: Profile | null): string {
	const base = sanitizeExportFilename(profile?.name ?? profile?.id ?? '')
	return `${base || 'profile'}.yaml`
}

function sanitizeExportFilename(value: string): string {
	const cleaned = value.trim()
	if (!cleaned) return ''
	return cleaned
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, '_')
		.replace(/-+/g, '-')
		.replace(/_+/g, '_')
		.replace(/[-_]+$/g, '')
		.replace(/^[-_]+/g, '')
}
