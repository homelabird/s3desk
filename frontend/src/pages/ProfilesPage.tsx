import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Divider, Empty, Form, Input, Modal, Select, Space, Spin, Switch, Table, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parse as parseYaml } from 'yaml'

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

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
	const [importOpen, setImportOpen] = useState(false)
	const [importText, setImportText] = useState('')
	const [importError, setImportError] = useState<string | null>(null)

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
				const details: Record<string, unknown> = resp.details ?? {}
				const storageType = typeof details.storageType === 'string' ? details.storageType : ''
				const storageSource = typeof details.storageTypeSource === 'string' ? details.storageTypeSource : ''
				const buckets = typeof details.buckets === 'number' ? details.buckets : null
				const errorDetail = typeof details.error === 'string' ? details.error : ''
				const normRaw = details.normalizedError
				const norm = isRecord(normRaw) ? normRaw : null
				const normCode = norm && typeof norm.code === 'string' ? norm.code : ''
				const normRetryable = norm && typeof norm.retryable === 'boolean' ? norm.retryable : null
			const suffixParts: string[] = []
			if (storageType) suffixParts.push(`type: ${storageType}`)
			if (storageSource) suffixParts.push(`source: ${storageSource}`)
			if (typeof buckets === 'number') suffixParts.push(`buckets: ${buckets}`)
			if (errorDetail && !resp.ok) suffixParts.push(`error: ${errorDetail}`)
			if (normCode && !resp.ok) suffixParts.push(`code: ${normCode}`)
			if (normRetryable === true && !resp.ok) suffixParts.push('retryable')
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

	const closeImportModal = () => {
		setImportOpen(false)
		setImportText('')
		setImportError(null)
	}

	const importMutation = useMutation({
		mutationFn: async (yamlText: string) => {
			const { request, tlsConfig } = parseProfileYaml(yamlText)
			const created = await api.createProfile(request)
			if (tlsConfig) {
				await api.updateProfileTLS(created.id, tlsConfig)
			}
			return created
		},
		onSuccess: async (created) => {
			message.success(`Imported profile "${created.name}"`)
			closeImportModal()
			await queryClient.invalidateQueries({ queryKey: ['profiles'] })
		},
		onError: (err) => {
			const msg = formatErr(err)
			setImportError(msg)
			message.error(msg)
		},
	})

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
	const editInitialValues: Partial<ProfileFormValues> | undefined = editProfile
		? {
				provider: editProfile.provider,
				name: editProfile.name,
				endpoint: 'endpoint' in editProfile ? editProfile.endpoint ?? '' : '',
				region: 'region' in editProfile ? editProfile.region ?? '' : '',
				forcePathStyle: 'forcePathStyle' in editProfile ? editProfile.forcePathStyle ?? false : false,
				preserveLeadingSlash: editProfile.preserveLeadingSlash,
				tlsInsecureSkipVerify: editProfile.tlsInsecureSkipVerify,
				azureAccountName: editProfile.provider === 'azure_blob' ? editProfile.accountName : '',
				azureAccountKey: '',
				azureEndpoint: editProfile.provider === 'azure_blob' ? editProfile.endpoint ?? '' : '',
				azureUseEmulator: editProfile.provider === 'azure_blob' ? !!editProfile.useEmulator : false,
				gcpAnonymous: editProfile.provider === 'gcp_gcs' ? !!editProfile.anonymous : false,
				gcpEndpoint: editProfile.provider === 'gcp_gcs' ? editProfile.endpoint ?? '' : '',
				gcpProjectNumber: editProfile.provider === 'gcp_gcs' ? editProfile.projectNumber ?? '' : '',
				gcpServiceAccountJson: '',
				ociNamespace: editProfile.provider === 'oci_object_storage' ? editProfile.namespace : '',
				ociCompartment: editProfile.provider === 'oci_object_storage' ? editProfile.compartment : '',
				ociEndpoint: editProfile.provider === 'oci_object_storage' ? editProfile.endpoint ?? '' : '',
				ociAuthProvider: editProfile.provider === 'oci_object_storage' ? editProfile.authProvider ?? '' : '',
				ociConfigFile: editProfile.provider === 'oci_object_storage' ? editProfile.configFile ?? '' : '',
				ociConfigProfile: editProfile.provider === 'oci_object_storage' ? editProfile.configProfile ?? '' : '',
			}
		: undefined

	return (
		<Space direction="vertical" size="large" style={{ width: '100%' }}>
				<div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
					<Typography.Title level={3} style={{ margin: 0 }}>
						Profiles
					</Typography.Title>
					<Space wrap>
						<Button onClick={() => setImportOpen(true)}>Import YAML</Button>
						<Button type="primary" onClick={() => setCreateOpen(true)}>
							New Profile
						</Button>
					</Space>
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
						{
							title: 'Provider',
							render: (_, row: Profile) => {
								const provider = row.provider
								const labels: Record<string, string> = {
									aws_s3: 'AWS S3',
									s3_compatible: 'S3 Compatible',
									oci_s3_compat: 'OCI S3 Compat',
								azure_blob: 'Azure Blob',
								gcp_gcs: 'GCP GCS',
								oci_object_storage: 'OCI Object Storage',
							}
							const label = provider ? labels[provider] || provider : 'unknown'
							return <Typography.Text code>{label}</Typography.Text>
						},
					},

						{
							title: 'Connection',
							render: (_, row: Profile) => {
								const provider = row.provider

								if (provider === 'azure_blob') {
									const accountName = row.accountName || ''
									const endpoint = row.endpoint
									const useEmulator = !!row.useEmulator
									const parts: string[] = [useEmulator ? 'emulator' : 'storage account']
									if (endpoint) parts.push(endpoint)
									const secondary = parts.join(' · ')
									return (
									<Space direction="vertical" size={0} style={{ width: '100%' }}>
										<Typography.Text>{accountName}</Typography.Text>
										<Typography.Text type="secondary">{secondary}</Typography.Text>
									</Space>
								)
							}

								if (provider === 'gcp_gcs') {
									const projectId = row.projectId
									const clientEmail = row.clientEmail
									const endpoint = row.endpoint
									const primary = projectId || clientEmail || ''
									const secondary = endpoint || (projectId && clientEmail ? clientEmail : '')
									return (
									<Space direction="vertical" size={0} style={{ width: '100%' }}>
										<Typography.Text>{primary}</Typography.Text>
										{secondary ? <Typography.Text type="secondary">{secondary}</Typography.Text> : null}
									</Space>
								)
							}

								if (provider === 'oci_object_storage') {
									const namespace = row.namespace
									const compartment = row.compartment
									const region = row.region
									const endpoint = row.endpoint

									const top = namespace || endpoint || ''
									const bottomParts: string[] = []
									if (region) bottomParts.push(region)
								if (compartment) bottomParts.push(compartment)
								const bottom = bottomParts.join(' · ')

								return (
									<Space direction="vertical" size={0} style={{ width: '100%' }}>
										<Typography.Text>{top}</Typography.Text>
										{bottom ? <Typography.Text type="secondary">{bottom}</Typography.Text> : null}
									</Space>
									)
								}

								const endpoint = 'endpoint' in row ? row.endpoint ?? '' : ''
								const region = 'region' in row ? row.region ?? '' : ''
								const endpointLabel = endpoint || (provider === 'aws_s3' ? 'AWS default endpoint' : '')
								return (
									<Space direction="vertical" size={0} style={{ width: '100%' }}>
									<Typography.Text>{endpointLabel}</Typography.Text>
									{region ? <Typography.Text type="secondary">{region}</Typography.Text> : null}
								</Space>
							)
						},
					},

						{
							title: 'Flags',
							render: (_, row: Profile) => {
								const provider = row.provider
								const isS3 = provider === 'aws_s3' || provider === 's3_compatible' || provider === 'oci_s3_compat'
								const parts: string[] = []
								if (isS3 && 'forcePathStyle' in row) parts.push(row.forcePathStyle ? 'path-style' : 'virtual-host')
								parts.push(row.preserveLeadingSlash ? 'leading-slash' : 'trim-leading-slash')
								parts.push(row.tlsInsecureSkipVerify ? 'tls-skip' : 'tls-verify')
								return <Typography.Text type="secondary">{parts.join(' / ')}</Typography.Text>
							},
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
					initialValues={editInitialValues}
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

				<Modal
					open={importOpen}
					title="Import Profile YAML"
					onCancel={closeImportModal}
					okText="Import"
					onOk={() => importMutation.mutate(importText)}
					okButtonProps={{ disabled: importMutation.isPending || importText.trim() === '' }}
					confirmLoading={importMutation.isPending}
					destroyOnClose
				>
					<Space direction="vertical" size="middle" style={{ width: '100%' }}>
						<Typography.Text type="secondary">
							Import a profile exported from S3Desk. This will create a new profile (the YAML id is ignored).
						</Typography.Text>
						<input
							type="file"
							accept=".yaml,.yml"
							onChange={(e) => {
								const file = e.target.files?.[0]
								if (!file) return
								const reader = new FileReader()
								reader.onload = () => {
									const text = typeof reader.result === 'string' ? reader.result : ''
									setImportText(text)
									setImportError(null)
								}
								reader.readAsText(file)
							}}
						/>
						<Input.TextArea
							value={importText}
							onChange={(e) => {
								setImportText(e.target.value)
								setImportError(null)
							}}
							autoSize={{ minRows: 8, maxRows: 16 }}
							placeholder="Paste YAML here"
						/>
						{importError ? <Alert type="error" showIcon message={importError} /> : null}
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
	provider: ProfileProvider
	name: string

	// S3-like (AWS/S3-compatible/OCI S3 compat)
	endpoint: string
	region: string
	accessKeyId: string
	secretAccessKey: string
	sessionToken?: string
	clearSessionToken: boolean
	forcePathStyle: boolean

	// Azure Blob
	azureAccountName: string
	azureAccountKey: string
	azureEndpoint: string
	azureUseEmulator: boolean

	// GCP GCS
	gcpAnonymous: boolean
	gcpServiceAccountJson: string
	gcpEndpoint: string
	gcpProjectNumber: string

	// OCI Object Storage (native)
	ociNamespace: string
	ociCompartment: string
	ociEndpoint: string
	ociAuthProvider: string
	ociConfigFile: string
	ociConfigProfile: string

	// Common flags
	preserveLeadingSlash: boolean
	tlsInsecureSkipVerify: boolean

	// TLS config UI
	tlsEnabled?: boolean
	tlsAction?: TLSAction
	tlsClientCertPem?: string
	tlsClientKeyPem?: string
	tlsCaCertPem?: string
}

type ProfileProvider =
	| 'aws_s3'
	| 's3_compatible'
	| 'oci_s3_compat'
	| 'azure_blob'
	| 'gcp_gcs'
	| 'oci_object_storage'

type TLSAction = 'keep' | 'enable' | 'disable'
type TLSCapability = MetaResponse['capabilities']['profileTls']

type ProfileYamlProfile = {
	id?: string
	name?: string
	provider?: ProfileProvider
	endpoint?: string
	region?: string
	accessKeyId?: string
	secretAccessKey?: string
	sessionToken?: string | null
	forcePathStyle?: boolean
	accountName?: string
	accountKey?: string
	useEmulator?: boolean
	serviceAccountJson?: string
	anonymous?: boolean
	projectNumber?: string
	namespace?: string
	compartment?: string
	authProvider?: string
	configFile?: string
	configProfile?: string
	preserveLeadingSlash?: boolean
	tlsInsecureSkipVerify?: boolean
}

type ProfileYamlTLS = {
	mode?: string
	clientCertPem?: string
	clientKeyPem?: string
	caCertPem?: string
}

const PROFILE_PROVIDERS: ProfileProvider[] = [
	'aws_s3',
	's3_compatible',
	'oci_s3_compat',
	'azure_blob',
	'gcp_gcs',
	'oci_object_storage',
]

const isProfileProvider = (value: unknown): value is ProfileProvider =>
	typeof value === 'string' && PROFILE_PROVIDERS.includes(value as ProfileProvider)

const toOptionalString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined)

function extractProfileYaml(raw: unknown): { profile: ProfileYamlProfile; tls?: ProfileYamlTLS } {
	if (!isRecord(raw)) {
		throw new Error('YAML must be an object')
	}
	if ('profile' in raw) {
		const profile = raw.profile
		if (!isRecord(profile)) {
			throw new Error('profile must be an object')
		}
		const tls = 'tls' in raw && isRecord(raw.tls) ? (raw.tls as ProfileYamlTLS) : undefined
		return { profile: profile as ProfileYamlProfile, tls }
	}
	return { profile: raw as ProfileYamlProfile }
}

function inferProvider(profile: ProfileYamlProfile): ProfileProvider {
	if (profile.accountName || profile.accountKey || profile.useEmulator) return 'azure_blob'
	if (profile.serviceAccountJson || profile.anonymous !== undefined || profile.projectNumber) return 'gcp_gcs'
	if (profile.namespace || profile.compartment || profile.authProvider || profile.configFile || profile.configProfile) {
		return 'oci_object_storage'
	}
	if (profile.endpoint) return 's3_compatible'
	return 'aws_s3'
}

function parseProfileYaml(yamlText: string): { request: ProfileCreateRequest; tlsConfig?: ProfileTLSConfig } {
	const parsed = parseYaml(yamlText) as unknown
	const { profile, tls } = extractProfileYaml(parsed)
	const name = toOptionalString(profile.name)
	if (!name) {
		throw new Error('profile.name is required')
	}

	const provider = isProfileProvider(profile.provider) ? profile.provider : inferProvider(profile)
	const preserveLeadingSlash = profile.preserveLeadingSlash ?? false
	const tlsInsecureSkipVerify = profile.tlsInsecureSkipVerify ?? false

	let request: ProfileCreateRequest
	switch (provider) {
		case 'azure_blob': {
			const accountName = toOptionalString(profile.accountName)
			const accountKey = toOptionalString(profile.accountKey)
			if (!accountName || !accountKey) {
				throw new Error('azure_blob requires accountName and accountKey')
			}
			request = {
				provider,
				name,
				accountName,
				accountKey,
				endpoint: toOptionalString(profile.endpoint),
				useEmulator: profile.useEmulator ?? false,
				preserveLeadingSlash,
				tlsInsecureSkipVerify,
			}
			break
		}
		case 'gcp_gcs': {
			const anonymous = profile.anonymous ?? false
			const serviceAccountJson = toOptionalString(profile.serviceAccountJson)
			if (!anonymous && !serviceAccountJson) {
				throw new Error('gcp_gcs requires serviceAccountJson unless anonymous=true')
			}
			request = {
				provider,
				name,
				anonymous,
				serviceAccountJson: anonymous ? '' : serviceAccountJson,
				endpoint: toOptionalString(profile.endpoint),
				projectNumber: toOptionalString(profile.projectNumber),
				preserveLeadingSlash,
				tlsInsecureSkipVerify,
			}
			break
		}
		case 'oci_object_storage': {
			const region = toOptionalString(profile.region)
			const namespace = toOptionalString(profile.namespace)
			const compartment = toOptionalString(profile.compartment)
			if (!region || !namespace || !compartment) {
				throw new Error('oci_object_storage requires region, namespace, and compartment')
			}
			request = {
				provider,
				name,
				region,
				namespace,
				compartment,
				endpoint: toOptionalString(profile.endpoint),
				authProvider: toOptionalString(profile.authProvider),
				configFile: toOptionalString(profile.configFile),
				configProfile: toOptionalString(profile.configProfile),
				preserveLeadingSlash,
				tlsInsecureSkipVerify,
			}
			break
		}
		default: {
			const region = toOptionalString(profile.region)
			const accessKeyId = toOptionalString(profile.accessKeyId)
			const secretAccessKey = toOptionalString(profile.secretAccessKey)
			if (!region || !accessKeyId || !secretAccessKey) {
				throw new Error(`${provider} requires region, accessKeyId, and secretAccessKey`)
			}
			const endpoint = toOptionalString(profile.endpoint)
			if ((provider === 's3_compatible' || provider === 'oci_s3_compat') && !endpoint) {
				throw new Error(`${provider} requires endpoint`)
			}
			const base = {
				name,
				region,
				accessKeyId,
				secretAccessKey,
				sessionToken: profile.sessionToken ?? null,
				forcePathStyle: profile.forcePathStyle ?? false,
				preserveLeadingSlash,
				tlsInsecureSkipVerify,
			}
			if (provider === 'aws_s3') {
				request = {
					provider: 'aws_s3',
					...base,
					endpoint,
				}
			} else if (provider === 's3_compatible') {
				request = {
					provider: 's3_compatible',
					...base,
					endpoint: endpoint as string,
				}
			} else {
				request = {
					provider: 'oci_s3_compat',
					...base,
					endpoint: endpoint as string,
				}
			}
		}
	}

	const tlsMode = typeof tls?.mode === 'string' ? tls.mode : ''
	const tlsConfig = tlsMode === 'mtls'
		? {
				mode: 'mtls' as const,
				clientCertPem: toOptionalString(tls?.clientCertPem),
				clientKeyPem: toOptionalString(tls?.clientKeyPem),
				caCertPem: toOptionalString(tls?.caCertPem),
			}
		: undefined

	if (tlsConfig) {
		if (!tlsConfig.clientCertPem || !tlsConfig.clientKeyPem) {
			throw new Error('tls.mode=mtls requires clientCertPem and clientKeyPem')
		}
	}

	return { request, tlsConfig }
}

function toUpdateRequest(values: ProfileFormValues): ProfileUpdateRequest {
	const provider = values.provider

	if (provider === 'azure_blob') {
		const out: ProfileUpdateRequest = {
			provider,
			name: values.name,
			accountName: values.azureAccountName,
			endpoint: values.azureEndpoint,
			useEmulator: values.azureUseEmulator,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
			...(values.azureAccountKey ? { accountKey: values.azureAccountKey } : {}),
		}
		return out
	}

	if (provider === 'gcp_gcs') {
		const out: ProfileUpdateRequest = {
			provider,
			name: values.name,
			anonymous: values.gcpAnonymous,
			endpoint: values.gcpEndpoint,
			projectNumber: values.gcpProjectNumber,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
			...(values.gcpAnonymous
				? { serviceAccountJson: '' }
				: values.gcpServiceAccountJson
					? { serviceAccountJson: values.gcpServiceAccountJson }
					: {}),
		}
		return out
	}

	if (provider === 'oci_object_storage') {
		const out: ProfileUpdateRequest = {
			provider,
			name: values.name,
			endpoint: values.ociEndpoint,
			region: values.region,
			namespace: values.ociNamespace,
			compartment: values.ociCompartment,
			authProvider: values.ociAuthProvider,
			configFile: values.ociConfigFile,
			configProfile: values.ociConfigProfile,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
		}
		return out
	}

	// S3-like providers
	const base = {
		name: values.name,
		region: values.region,
		forcePathStyle: values.forcePathStyle,
		preserveLeadingSlash: values.preserveLeadingSlash,
		tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
		...(values.accessKeyId ? { accessKeyId: values.accessKeyId } : {}),
		...(values.secretAccessKey ? { secretAccessKey: values.secretAccessKey } : {}),
		...(values.clearSessionToken ? { sessionToken: '' } : values.sessionToken ? { sessionToken: values.sessionToken } : {}),
	}
	if (provider === 'aws_s3') {
		return {
			provider,
			...base,
			...(values.endpoint ? { endpoint: values.endpoint } : {}),
		}
	}
	if (provider === 's3_compatible') {
		return {
			provider,
			...base,
			...(values.endpoint ? { endpoint: values.endpoint } : {}),
		}
	}
	return {
		provider: 'oci_s3_compat',
		...base,
		...(values.endpoint ? { endpoint: values.endpoint } : {}),
	}
}

function toCreateRequest(values: ProfileFormValues): ProfileCreateRequest {
	const provider = values.provider

	if (provider === 'azure_blob') {
		const out: ProfileCreateRequest = {
			provider,
			name: values.name,
			accountName: values.azureAccountName,
			accountKey: values.azureAccountKey,
			endpoint: values.azureEndpoint,
			useEmulator: values.azureUseEmulator,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
		}
		return out
	}

	if (provider === 'gcp_gcs') {
		const out: ProfileCreateRequest = {
			provider,
			name: values.name,
			anonymous: values.gcpAnonymous,
			endpoint: values.gcpEndpoint,
			projectNumber: values.gcpProjectNumber,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
			...(values.gcpServiceAccountJson ? { serviceAccountJson: values.gcpServiceAccountJson } : {}),
		}
		return out
	}

	if (provider === 'oci_object_storage') {
		const out: ProfileCreateRequest = {
			provider,
			name: values.name,
			endpoint: values.ociEndpoint,
			region: values.region,
			namespace: values.ociNamespace,
			compartment: values.ociCompartment,
			authProvider: values.ociAuthProvider,
			configFile: values.ociConfigFile,
			configProfile: values.ociConfigProfile,
			preserveLeadingSlash: values.preserveLeadingSlash,
			tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
		}
		return out
	}

	// S3-like providers
	const base = {
		name: values.name,
		region: values.region,
		accessKeyId: values.accessKeyId,
		secretAccessKey: values.secretAccessKey,
		sessionToken: values.sessionToken ? values.sessionToken : null,
		forcePathStyle: values.forcePathStyle,
		preserveLeadingSlash: values.preserveLeadingSlash,
		tlsInsecureSkipVerify: values.tlsInsecureSkipVerify,
	}
	if (provider === 'aws_s3') {
		return {
			provider,
			...base,
			...(values.endpoint ? { endpoint: values.endpoint } : {}),
		}
	}
	if (provider === 's3_compatible') {
		return {
			provider,
			...base,
			endpoint: values.endpoint,
		}
	}
	return {
		provider: 'oci_s3_compat',
		...base,
		endpoint: values.endpoint,
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
	const provider = Form.useWatch('provider', form)
	const clearSessionToken = Form.useWatch('clearSessionToken', form)
	const gcpAnonymous = Form.useWatch('gcpAnonymous', form)
	const tlsEnabled = Form.useWatch('tlsEnabled', form)
	const tlsAction = Form.useWatch('tlsAction', form)
	const isS3Provider = provider === 'aws_s3' || provider === 's3_compatible' || provider === 'oci_s3_compat'
	const isOciObjectStorage = provider === 'oci_object_storage'
	const isAws = provider === 'aws_s3'
	const isAzure = provider === 'azure_blob'
	const isGcp = provider === 'gcp_gcs'
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
					provider: 's3_compatible',
					name: '',
					endpoint: 'http://127.0.0.1:9000',
					region: 'us-east-1',
					accessKeyId: '',
					secretAccessKey: '',
					sessionToken: '',
					clearSessionToken: false,
					forcePathStyle: false,
					azureAccountName: '',
					azureAccountKey: '',
					azureEndpoint: '',
					azureUseEmulator: false,
					gcpAnonymous: false,
					gcpServiceAccountJson: '',
					gcpEndpoint: '',
					gcpProjectNumber: '',
					ociNamespace: '',
					ociCompartment: '',
					ociEndpoint: '',
					ociAuthProvider: '',
					ociConfigFile: '',
					ociConfigProfile: '',
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
				<Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
					<Select
						disabled={!!props.editMode}
						options={[
							{ label: 'S3 Compatible (MinIO/Ceph/Custom)', value: 's3_compatible' },
							{ label: 'AWS S3', value: 'aws_s3' },
							{ label: 'Oracle OCI (S3 Compat)', value: 'oci_s3_compat' },
							{ label: 'Oracle OCI Object Storage (Native)', value: 'oci_object_storage' },
							{ label: 'Azure Blob Storage', value: 'azure_blob' },
							{ label: 'Google Cloud Storage (GCS)', value: 'gcp_gcs' },
						]}
					/>
				</Form.Item>

				<Form.Item name="name" label="Name" rules={[{ required: true }]}>
					<Input />
				</Form.Item>

				{isS3Provider ? (
					<>
						<Form.Item
							name="endpoint"
							label={isAws ? 'Endpoint URL (optional)' : 'Endpoint URL'}
							rules={isAws ? [] : [{ required: true }]}
						>
							<Input placeholder={isAws ? 'Leave blank for AWS default' : 'https://s3.example.com'} />
						</Form.Item>
						<Form.Item name="region" label="Region" rules={[{ required: true }]}>
							<Input placeholder="us-east-1" />
						</Form.Item>
					</>
				) : null}

				{isOciObjectStorage ? (
					<>
						<Form.Item name="region" label="Region" rules={[{ required: true }]}>
							<Input placeholder="us-ashburn-1" />
						</Form.Item>
						<Form.Item name="ociNamespace" label="Namespace" rules={[{ required: true }]}>
							<Input placeholder="my-namespace" />
						</Form.Item>
						<Form.Item name="ociCompartment" label="Compartment OCID" rules={[{ required: true }]}>
							<Input placeholder="ocid1.compartment.oc1.." />
						</Form.Item>
						<Form.Item name="ociEndpoint" label="Endpoint URL (optional)">
							<Input placeholder="https://objectstorage.{region}.oraclecloud.com" />
						</Form.Item>
						<Form.Item name="ociAuthProvider" label="Auth Provider (optional)">
							<Input placeholder="instance_principal / api_key / resource_principal" />
						</Form.Item>
						<Form.Item name="ociConfigFile" label="OCI Config File (optional)">
							<Input placeholder="/home/user/.oci/config" />
						</Form.Item>
						<Form.Item name="ociConfigProfile" label="OCI Config Profile (optional)">
							<Input placeholder="DEFAULT" />
						</Form.Item>
						<Typography.Text type="secondary">
							This uses rclone's oracleobjectstorage backend (native).
						</Typography.Text>
					</>
				) : null}

				{isAzure ? (
					<>
						<Form.Item name="azureAccountName" label="Storage Account Name" rules={[{ required: true }]}> 
							<Input placeholder="mystorageaccount" />
						</Form.Item>
						<Form.Item
							name="azureAccountKey"
							label={props.editMode ? 'Account Key (optional)' : 'Account Key'}
							rules={props.editMode ? [] : [{ required: true }]}
						>
							<Input.Password autoComplete="new-password" />
						</Form.Item>

						<Space size="large" wrap>
							<Form.Item name="azureUseEmulator" label="Use Emulator" valuePropName="checked">
								<Switch />
							</Form.Item>
						</Space>
						<Form.Item name="azureEndpoint" label="Endpoint URL (optional)">
							<Input placeholder="http://127.0.0.1:10000/devstoreaccount1" />
						</Form.Item>
						<Typography.Text type="secondary">
							If "Use Emulator" is enabled and endpoint is blank, the server may use a default Azurite endpoint.
						</Typography.Text>
					</>
				) : null}
				{isGcp ? (
					<>
						<Space size="large" wrap>
							<Form.Item name="gcpAnonymous" label="Anonymous" valuePropName="checked">
								<Switch />
							</Form.Item>
						</Space>
						<Form.Item name="gcpEndpoint" label="Endpoint URL (optional)">
							<Input placeholder="https://storage.googleapis.com" />
						</Form.Item>
						<Form.Item name="gcpProjectNumber" label="Project Number (optional)">
							<Input placeholder="123456789012" />
						</Form.Item>

						{gcpAnonymous ? (
							<Typography.Text type="secondary">
								Anonymous mode does not use credentials. Only works if the endpoint allows unauthenticated access.
							</Typography.Text>
						) : (
							<Form.Item
								name="gcpServiceAccountJson"
								label={props.editMode ? 'Service Account JSON (optional)' : 'Service Account JSON'}
								rules={props.editMode ? [] : [{ required: true }]}
							>
								<Input.TextArea
									autoSize={{ minRows: 6, maxRows: 12 }}
									placeholder={`{
  "type": "service_account", ...
}`}
								/>
							</Form.Item>
						)}
					</>
				) : null}
				{isS3Provider ? (
					<>
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
					</>
				) : null}

				<Space size="large" wrap>
					{isS3Provider ? (
						<Form.Item name="forcePathStyle" label="Force Path Style" valuePropName="checked">
							<Switch />
						</Form.Item>
					) : null}
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
