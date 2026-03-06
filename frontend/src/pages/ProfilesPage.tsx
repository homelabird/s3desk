import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Empty, Space, Spin, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { APIClient } from '../api/client'
import type { Profile, ProfileCreateRequest, ProfileTLSConfig, ProfileUpdateRequest } from '../api/types'
import { clipboardFailureHint, copyToClipboard } from '../lib/clipboard'
import { getConnectionTroubleshootingHint } from '../lib/connectionHints'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import type { ProfileFormValues } from './profiles/profileTypes'
import { ProfilesModals } from './profiles/ProfilesModals'
import { ProfilesTable } from './profiles/ProfilesTable'
import { buildProfileExportFilename, parseProfileYaml } from './profiles/profileYaml'
import { buildProfilesTableRows, formatBps, toProfileEditInitialValues } from './profiles/profileViewModel'
import styles from './ProfilesPage.module.css'

type Props = {
	apiToken: string
	profileId: string | null
	setProfileId: (v: string | null) => void
}

function useProfilesPageOrchestration(apiToken: string) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken }), [apiToken])
	const [searchParams, setSearchParams] = useSearchParams()
	return { queryClient, api, searchParams, setSearchParams }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

export function ProfilesPage(props: Props) {
	const { queryClient, api, searchParams, setSearchParams } = useProfilesPageOrchestration(props.apiToken)
	const createRequested = searchParams.has('create')
	const [createOpen, setCreateOpen] = useState(() => createRequested)
	const [editProfile, setEditProfile] = useState<Profile | null>(null)
	const [testingProfileId, setTestingProfileId] = useState<string | null>(null)
	const [benchmarkingProfileId, setBenchmarkingProfileId] = useState<string | null>(null)
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
	const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data])
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
			else {
				const troubleshootHint = normCode ? getConnectionTroubleshootingHint(normCode) : undefined
				const base = `${resp.message ?? 'Profile test failed'}${suffix}`
				message.warning(troubleshootHint ? `${base} · ${troubleshootHint}` : base, troubleshootHint ? 8 : 5)
			}
		},
		onSettled: (_, __, id) => setTestingProfileId((prev) => (prev === id ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const benchmarkMutation = useMutation({
		mutationFn: (id: string) => api.benchmarkProfile(id),
		onMutate: (id) => setBenchmarkingProfileId(id),
		onSuccess: (resp) => {
			if (resp.ok) {
				const parts: string[] = []
				if (resp.uploadBps != null) parts.push(`↑ ${formatBps(resp.uploadBps)}`)
				if (resp.downloadBps != null) parts.push(`↓ ${formatBps(resp.downloadBps)}`)
				if (resp.uploadMs != null) parts.push(`upload ${resp.uploadMs}ms`)
				if (resp.downloadMs != null) parts.push(`download ${resp.downloadMs}ms`)
				message.success(`Benchmark OK: ${parts.join(' · ')}`, 8)
			} else {
				message.warning(resp.message ?? 'Benchmark failed', 5)
			}
		},
		onSettled: (_, __, id) => setBenchmarkingProfileId((prev) => (prev === id ? null : prev)),
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
	const editInitialValues: Partial<ProfileFormValues> | undefined = useMemo(
		() => toProfileEditInitialValues(editProfile),
		[editProfile],
	)
	const tableRows = useMemo(() => buildProfilesTableRows(profiles, props.profileId), [profiles, props.profileId])

	return (
		<Space orientation="vertical" size="large" className={styles.fullWidth}>
			<PageHeader
				eyebrow="Workspace"
				title="Profiles"
				subtitle="Create connection profiles, verify endpoints, and choose the active workspace used across buckets, objects, uploads, and jobs."
				actions={
					<Space wrap>
						<Button onClick={() => setImportOpen(true)}>Import YAML</Button>
						<Button type="primary" onClick={() => setCreateOpen(true)}>
							New Profile
						</Button>
					</Space>
				}
			/>
			{onboardingVisible ? (
				<Alert
					type="info"
					showIcon
					title="Getting started"
					description={
						<Space orientation="vertical" size={12} className={styles.fullWidth}>
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
								<Checkbox checked={apiTokenEnabled ? !!props.apiToken.trim() : true} disabled>
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
				<div className={styles.loadingRow}>
					<Spin />
				</div>
			) : showProfilesEmpty ? (
				<Empty description="No profiles yet">
					<Button type="primary" onClick={() => setCreateOpen(true)}>
						Create profile
					</Button>
				</Empty>
			) : (
				<ProfilesTable
					rows={tableRows}
					onUseProfile={props.setProfileId}
					onEdit={setEditProfile}
					onTest={(id) => testMutation.mutate(id)}
					onBenchmark={(id) => benchmarkMutation.mutate(id)}
					onOpenYaml={openYamlModal}
					onDelete={(profile) => {
						confirmDangerAction({
							title: `Delete profile "${profile.name}"?`,
							description: 'This removes the profile and any TLS settings associated with it.',
							confirmText: profile.name,
							confirmHint: `Type "${profile.name}" to confirm`,
							onConfirm: async () => {
								await deleteMutation.mutateAsync(profile.id)
							},
						})
					}}
					isTestPending={testMutation.isPending}
					testingProfileId={testingProfileId}
					isBenchmarkPending={benchmarkMutation.isPending}
					benchmarkingProfileId={benchmarkingProfileId}
					isExportYamlPending={exportYamlMutation.isPending}
					exportingProfileId={exportingProfileId}
					isDeletePending={deleteMutation.isPending}
					deletingProfileId={deletingProfileId}
				/>
			)}

			<ProfilesModals
				createOpen={createOpen}
				closeCreateModal={closeCreateModal}
				onCreateSubmit={(values) => createMutation.mutate(values)}
				createLoading={createMutation.isPending}
				editProfile={editProfile}
				closeEditModal={() => setEditProfile(null)}
				onEditSubmit={(id, values) => {
					updateMutation.mutate({ id, values })
				}}
				editLoading={updateMutation.isPending}
				editInitialValues={editInitialValues}
				tlsCapability={tlsCapability ?? null}
				tlsStatus={profileTLSQuery.data ?? null}
				tlsStatusLoading={profileTLSQuery.isFetching}
				tlsStatusError={profileTLSQuery.isError ? formatErr(profileTLSQuery.error) : null}
				yamlOpen={yamlOpen}
				closeYamlModal={closeYamlModal}
				yamlProfile={yamlProfile}
				yamlError={yamlError}
				yamlContent={yamlContent}
				yamlFilename={yamlFilename}
				exportYamlLoading={exportYamlMutation.isPending}
				onYamlCopy={() => void handleYamlCopy()}
				onYamlDownload={handleYamlDownload}
				importOpen={importOpen}
				closeImportModal={closeImportModal}
				importText={importText}
				importError={importError}
				importLoading={importMutation.isPending}
				onImportSubmit={() => importMutation.mutate(importText)}
				onImportTextChange={setImportText}
				onImportErrorClear={() => setImportError(null)}
			/>
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
