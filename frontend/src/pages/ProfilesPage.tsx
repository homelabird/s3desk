import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Empty, Space, Spin, Typography, message } from 'antd'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { APIClient } from '../api/client'
import type { Profile } from '../api/types'
import { clipboardFailureHint, copyToClipboard } from '../lib/clipboard'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { formatProviderOperationFailureMessage, formatUnavailableOperationMessage } from '../lib/providerOperationFeedback'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import type { ProfileFormValues } from './profiles/profileTypes'
import { buildTLSConfigFromValues, downloadTextFile, toCreateRequest, toUpdateRequest } from './profiles/profileMutationUtils'
import { ProfilesModals } from './profiles/profilesLazy'
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
	const [yamlDraft, setYamlDraft] = useState('')
	const [yamlError, setYamlError] = useState<string | null>(null)
	const [exportingProfileId, setExportingProfileId] = useState<string | null>(null)
	const [importOpen, setImportOpen] = useState(false)
	const [importText, setImportText] = useState('')
	const [importError, setImportError] = useState<string | null>(null)

	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: () => api.listProfiles(),
	})
	useEffect(() => {
		if (createRequested) setCreateOpen(true)
	}, [createRequested])
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
			const storageType = resp.details?.storageType ?? ''
			const storageSource = resp.details?.storageTypeSource ?? ''
			const buckets = typeof resp.details?.buckets === 'number' ? resp.details.buckets : null
			const suffixParts: string[] = []
			if (storageType) suffixParts.push(`type: ${storageType}`)
			if (storageSource) suffixParts.push(`source: ${storageSource}`)
			if (typeof buckets === 'number') suffixParts.push(`buckets: ${buckets}`)
			const suffix = suffixParts.length ? ` (${suffixParts.join(', ')})` : ''
			if (resp.ok) message.success(`Profile test OK${suffix}`)
			else {
				const { content, duration } = formatProviderOperationFailureMessage({
					defaultMessage: 'Profile test failed',
					message: resp.message,
					errorDetail: resp.details?.error,
					normalizedError: resp.details?.normalizedError,
					extraDetails: suffixParts,
				})
				message.warning(content, duration)
			}
		},
		onSettled: (_, __, id) => setTestingProfileId((prev) => (prev === id ? null : prev)),
		onError: (err) => {
			const { content, duration } = formatUnavailableOperationMessage('Profile test unavailable', err)
			message.error(content, duration)
		},
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
				const { content, duration } = formatProviderOperationFailureMessage({
					defaultMessage: 'Benchmark failed',
					message: resp.message,
					errorDetail: resp.details?.error,
					normalizedError: resp.details?.normalizedError,
				})
				message.warning(content, duration)
			}
		},
		onSettled: (_, __, id) => setBenchmarkingProfileId((prev) => (prev === id ? null : prev)),
		onError: (err) => {
			const { content, duration } = formatUnavailableOperationMessage('Benchmark unavailable', err)
			message.error(content, duration)
		},
	})

	const exportYamlMutation = useMutation({
		mutationFn: (id: string) => api.exportProfileYaml(id),
		onMutate: (id) => {
			setExportingProfileId(id)
			setYamlContent('')
			setYamlDraft('')
			setYamlError(null)
		},
		onSuccess: (content) => {
			setYamlContent(content)
			setYamlDraft(content)
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
		setYamlDraft('')
		setYamlError(null)
	}

	const saveYamlMutation = useMutation({
		mutationFn: async ({ profileId, yamlText }: { profileId: string; yamlText: string }) => {
			const { updateRequest, tlsConfig, hasTLSBlock } = await parseProfileYaml(yamlText)
			const updated = await api.updateProfile(profileId, updateRequest)
			if (hasTLSBlock) {
				if (tlsConfig) {
					await api.updateProfileTLS(profileId, tlsConfig)
				} else {
					await api.deleteProfileTLS(profileId)
				}
			}
			const canonicalYaml = await api.exportProfileYaml(profileId)
			return { updated, canonicalYaml }
		},
		onSuccess: async ({ updated, canonicalYaml }) => {
			message.success('Profile YAML saved')
			setYamlProfile(updated)
			setYamlContent(canonicalYaml)
			setYamlDraft(canonicalYaml)
			setYamlError(null)
			await queryClient.invalidateQueries({ queryKey: ['profiles'] })
			await queryClient.invalidateQueries({ queryKey: ['profileTls', updated.id] })
		},
		onError: (err) => {
			const msg = formatErr(err)
			setYamlError(msg)
			message.error(msg)
		},
	})

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
		if (!yamlDraft) return
		const res = await copyToClipboard(yamlDraft)
		if (res.ok) {
			message.success('Copied YAML')
			return
		}
		message.error(clipboardFailureHint())
	}

	const handleYamlDownload = () => {
		if (!yamlDraft) return
		downloadTextFile(buildProfileExportFilename(yamlProfile), yamlDraft)
		message.success('Downloaded YAML')
	}

	const apiTokenEnabled = metaQuery.data?.apiTokenEnabled ?? false
	const transferEngine = metaQuery.data?.transferEngine
	const onboardingVisible = !onboardingDismissed && (profiles.length === 0 || !props.profileId)
	const yamlFilename = buildProfileExportFilename(yamlProfile)
	const hasOpenModal = createOpen || !!editProfile || yamlOpen || importOpen
	const editInitialValues: Partial<ProfileFormValues> | undefined = useMemo(
		() => toProfileEditInitialValues(editProfile),
		[editProfile],
	)
	const tableRows = useMemo(() => buildProfilesTableRows(profiles, props.profileId), [profiles, props.profileId])
	const profilesNeedingAttention = useMemo(
		() => profiles.filter((profile) => profile.validation?.valid === false && (profile.validation.issues?.length ?? 0) > 0),
		[profiles],
	)

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

			{profilesNeedingAttention.length > 0 ? (
				<Alert
					type="warning"
					showIcon
					title={`Profiles need updates (${profilesNeedingAttention.length})`}
					description={
						<Space orientation="vertical" size={8} className={styles.fullWidth}>
							<Typography.Text type="secondary">
								Some saved profiles no longer meet the current provider requirements. Edit each affected profile and save it again.
							</Typography.Text>
							<Button size="small" onClick={() => setEditProfile(profilesNeedingAttention[0] ?? null)}>
								Open next profile to fix
							</Button>
							<Space orientation="vertical" size={4} className={styles.fullWidth}>
								{profilesNeedingAttention.map((profile) => (
									<Space key={profile.id} align="start" className={styles.fullWidth}>
										<Typography.Text className={styles.fullWidth}>
											<strong>{profile.name}</strong>: {profile.validation?.issues?.[0]?.message ?? 'Update required'}
										</Typography.Text>
										<Button size="small" type="link" onClick={() => setEditProfile(profile)} aria-label={`Edit profile ${profile.name}`}>
											Edit profile
										</Button>
									</Space>
								))}
							</Space>
						</Space>
					}
				/>
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

			{hasOpenModal ? (
				<Suspense fallback={null}>
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
						yamlDraft={yamlDraft}
						yamlFilename={yamlFilename}
						exportYamlLoading={exportYamlMutation.isPending}
						saveYamlLoading={saveYamlMutation.isPending}
						onYamlCopy={() => void handleYamlCopy()}
						onYamlDownload={handleYamlDownload}
						onYamlDraftChange={setYamlDraft}
						onYamlSave={() => {
							if (!yamlProfile) return
							saveYamlMutation.mutate({ profileId: yamlProfile.id, yamlText: yamlDraft })
						}}
						importOpen={importOpen}
						closeImportModal={closeImportModal}
						importText={importText}
						importError={importError}
						importLoading={importMutation.isPending}
						onImportSubmit={() => importMutation.mutate(importText)}
						onImportTextChange={setImportText}
						onImportErrorClear={() => setImportError(null)}
					/>
				</Suspense>
			) : null}
		</Space>
	)
}
