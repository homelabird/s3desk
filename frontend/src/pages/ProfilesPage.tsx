import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Dropdown, Empty, Input, Modal, Space, Spin, Typography, message } from 'antd'
import { lazy, Suspense, useMemo, useState } from 'react'
import { MoreOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'

import { APIClient } from '../api/client'
import type { Profile, ProfileCreateRequest, ProfileTLSConfig, ProfileUpdateRequest } from '../api/types'
import { clipboardFailureHint, copyToClipboard } from '../lib/clipboard'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { LinkButton } from '../components/LinkButton'
import type { ProfileFormValues, ProfileProvider } from './profiles/profileTypes'

type Props = {
	apiToken: string
	profileId: string | null
	setProfileId: (v: string | null) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const ProfileModal = lazy(async () => {
	const m = await import('./profiles/ProfileModal')
	return { default: m.ProfileModal }
})

const PROFILE_PROVIDER_LABELS: Record<string, string> = {
	aws_s3: 'AWS S3',
	s3_compatible: 'S3 Compatible',
	oci_s3_compat: 'OCI S3 Compat',
	azure_blob: 'Azure Blob',
	gcp_gcs: 'GCP GCS',
	oci_object_storage: 'OCI Object Storage',
}

export function ProfilesPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const [searchParams, setSearchParams] = useSearchParams()
	const createRequested = searchParams.has('create')
	const [createOpen, setCreateOpen] = useState(() => createRequested)
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
	const closeCreateModal = () => {
		setCreateOpen(false)
		if (!searchParams.has('create')) return
		const next = new URLSearchParams(searchParams)
		next.delete('create')
		setSearchParams(next, { replace: true })
	}

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
			const { request, tlsConfig } = await parseProfileYaml(yamlText)
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
		<Space orientation="vertical" size="large" style={{ width: '100%' }}>
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
					title="Getting started"
					description={
						<Space orientation="vertical" size={12} style={{ width: '100%' }}>
							<Typography.Text type="secondary">Quick setup checklist.</Typography.Text>
							<Space orientation="vertical" size={6}>
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
											<LinkButton to="/buckets" size="small" disabled={!props.profileId}>
												Buckets
											</LinkButton>
											<LinkButton to="/objects" size="small" disabled={!props.profileId}>
												Objects
											</LinkButton>
										<Button size="small" type="link" onClick={() => setOnboardingDismissed(true)}>
											Dismiss
										</Button>
								</Space>
						</Space>
					}
				/>
			) : null}

			{profilesQuery.isError ? (
				<Alert type="error" showIcon title="Failed to load profiles" description={formatErr(profilesQuery.error)} />
			) : null}

			{profilesQuery.isFetching && profiles.length === 0 ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
					<Spin />
				</div>
			) : showProfilesEmpty ? (
				<Empty description="No profiles yet">
					<Button type="primary" onClick={() => setCreateOpen(true)}>
						Create profile
					</Button>
				</Empty>
			) : (
				<div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflowX: 'auto' }}>
					<table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
						<thead>
							<tr style={{ background: '#fafafa' }}>
								<th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #f0f0f0', width: 240 }}>Name</th>
								<th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #f0f0f0', width: 180 }}>Provider</th>
								<th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>Connection</th>
								<th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #f0f0f0', width: 220 }}>Flags</th>
								<th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #f0f0f0', width: 240 }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{profiles.map((row) => {
								const provider = row.provider
								const providerLabel = provider ? PROFILE_PROVIDER_LABELS[provider] || provider : 'unknown'

								const connectionNode = (() => {
									if (provider === 'azure_blob') {
										const accountName = row.accountName || ''
										const endpoint = row.endpoint
										const useEmulator = !!row.useEmulator
										const parts: string[] = [useEmulator ? 'emulator' : 'storage account']
										if (endpoint) parts.push(endpoint)
										const secondary = parts.join(' · ')
										return (
											<Space orientation="vertical" size={0} style={{ width: '100%' }}>
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
											<Space orientation="vertical" size={0} style={{ width: '100%' }}>
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
											<Space orientation="vertical" size={0} style={{ width: '100%' }}>
												<Typography.Text>{top}</Typography.Text>
												{bottom ? <Typography.Text type="secondary">{bottom}</Typography.Text> : null}
											</Space>
										)
									}

									const endpoint = 'endpoint' in row ? row.endpoint ?? '' : ''
									const region = 'region' in row ? row.region ?? '' : ''
									const endpointLabel = endpoint || (provider === 'aws_s3' ? 'AWS default endpoint' : '')
									return (
										<Space orientation="vertical" size={0} style={{ width: '100%' }}>
											<Typography.Text>{endpointLabel}</Typography.Text>
											{region ? <Typography.Text type="secondary">{region}</Typography.Text> : null}
										</Space>
									)
								})()

								const flagsNode = (() => {
									const isS3 = provider === 'aws_s3' || provider === 's3_compatible' || provider === 'oci_s3_compat'
									const parts: string[] = []
									if (isS3 && 'forcePathStyle' in row) parts.push(row.forcePathStyle ? 'path-style' : 'virtual-host')
									parts.push(row.preserveLeadingSlash ? 'leading-slash' : 'trim-leading-slash')
									parts.push(row.tlsInsecureSkipVerify ? 'tls-skip' : 'tls-verify')
									return <Typography.Text type="secondary">{parts.join(' / ')}</Typography.Text>
								})()

								return (
									<tr key={row.id}>
										<td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
											<Space>
												<Typography.Text strong>{row.name}</Typography.Text>
												{props.profileId === row.id ? <Typography.Text type="success">Active</Typography.Text> : null}
											</Space>
										</td>
										<td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
											<Typography.Text code>{providerLabel}</Typography.Text>
										</td>
										<td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>{connectionNode}</td>
										<td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>{flagsNode}</td>
										<td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
											<Space wrap>
												<Button size="small" onClick={() => props.setProfileId(row.id)}>
													Use
												</Button>
												<Dropdown
													trigger={['click']}
													menu={{
														items: [
															{ key: 'edit', label: 'Edit' },
															{
																key: 'test',
																label: testMutation.isPending && testingProfileId === row.id ? 'Testing…' : 'Test',
																disabled: testMutation.isPending && testingProfileId === row.id,
															},
															{
																key: 'yaml',
																label: exportYamlMutation.isPending && exportingProfileId === row.id ? 'Exporting YAML…' : 'YAML',
																disabled: exportYamlMutation.isPending && exportingProfileId === row.id,
															},
															{ type: 'divider' },
															{
																key: 'delete',
																label: deleteMutation.isPending && deletingProfileId === row.id ? 'Deleting…' : 'Delete',
																danger: true,
																disabled: deleteMutation.isPending && deletingProfileId === row.id,
															},
														],
														onClick: ({ key }) => {
															if (key === 'edit') {
																setEditProfile(row)
																return
															}
															if (key === 'test') {
																testMutation.mutate(row.id)
																return
															}
															if (key === 'yaml') {
																openYamlModal(row)
																return
															}
															if (key === 'delete') {
																confirmDangerAction({
																	title: `Delete profile "${row.name}"?`,
																	description: 'This removes the profile and any TLS settings associated with it.',
																	confirmText: row.name,
																	confirmHint: `Type "${row.name}" to confirm`,
																	onConfirm: async () => {
																		await deleteMutation.mutateAsync(row.id)
																	},
																})
															}
														},
													}}
												>
													<Button size="small" icon={<MoreOutlined />} aria-label={`More actions for ${row.name}`}>
														More
													</Button>
												</Dropdown>
											</Space>
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			)}

			<Suspense fallback={null}>
					{createOpen ? (
						<ProfileModal
							open
							title="Create Profile"
							okText="Create"
							onCancel={closeCreateModal}
							onSubmit={(values) => createMutation.mutate(values)}
							loading={createMutation.isPending}
							tlsCapability={tlsCapability ?? null}
						/>
					) : null}

				{editProfile ? (
					<ProfileModal
						open
						title="Edit Profile"
						okText="Save"
						onCancel={() => setEditProfile(null)}
						onSubmit={(values) => {
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
				) : null}
			</Suspense>

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
				destroyOnHidden
			>
				<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
					<Alert
						type="warning"
						showIcon
						title="Contains credentials"
						description="This export includes access keys and secrets. Store it securely."
					/>
					{yamlProfile ? (
						<Typography.Text>
							Profile: <Typography.Text code>{yamlProfile.name}</Typography.Text>
						</Typography.Text>
					) : null}
					{yamlError ? <Alert type="error" showIcon title="Failed to load YAML" description={yamlError} /> : null}
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
					destroyOnHidden
				>
					<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
						<Typography.Text type="secondary">
							Import a profile exported from S3Desk. This will create a new profile (the YAML id is ignored).
						</Typography.Text>
						<input
							type="file"
							accept=".yaml,.yml"
							aria-label="Import profile YAML file"
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
							placeholder="Paste YAML here…"
						/>
						{importError ? <Alert type="error" showIcon title={importError} /> : null}
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

async function parseProfileYaml(yamlText: string): Promise<{ request: ProfileCreateRequest; tlsConfig?: ProfileTLSConfig }> {
	// YAML parsing is an optional Profiles-only feature. Keep it out of the initial bundle.
	const { parse: parseYaml } = await import('yaml')
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
