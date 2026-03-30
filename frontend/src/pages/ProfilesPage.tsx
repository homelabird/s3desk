import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Empty, Space, Spin, Typography, message } from 'antd'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

type PendingProfileState = {
	profileId: string
	scopeKey: string
}

type PendingModalState = {
	session: number
	scopeKey: string
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
	const currentScopeKey = props.apiToken || 'none'
	const [createOpenScopeKey, setCreateOpenScopeKey] = useState<string | null>(() => (createRequested ? currentScopeKey : null))
	const createOpen = createRequested && createOpenScopeKey === currentScopeKey
	const [editProfile, setEditProfile] = useState<Profile | null>(null)
	const [editScopeKey, setEditScopeKey] = useState<string | null>(null)
	const [testingProfileState, setTestingProfileState] = useState<PendingProfileState | null>(null)
	const [benchmarkingProfileState, setBenchmarkingProfileState] = useState<PendingProfileState | null>(null)
	const [deletingProfileState, setDeletingProfileState] = useState<PendingProfileState | null>(null)
	const [onboardingDismissed, setOnboardingDismissed] = useState(false)
	const [yamlOpen, setYamlOpen] = useState(false)
	const [yamlScopeKey, setYamlScopeKey] = useState<string | null>(null)
	const [yamlProfile, setYamlProfile] = useState<Profile | null>(null)
	const [yamlContent, setYamlContent] = useState('')
	const [yamlDraft, setYamlDraft] = useState('')
	const [yamlError, setYamlError] = useState<string | null>(null)
	const [exportingProfileId, setExportingProfileId] = useState<string | null>(null)
	const [importOpen, setImportOpen] = useState(false)
	const [importScopeKey, setImportScopeKey] = useState<string | null>(null)
	const [importText, setImportText] = useState('')
	const [importError, setImportError] = useState<string | null>(null)
	const [importLoading, setImportLoading] = useState(false)
	const [createModalSession, setCreateModalSession] = useState(() => (createOpen ? 1 : 0))
	const [editModalSession, setEditModalSession] = useState(0)
	const [createPendingState, setCreatePendingState] = useState<PendingModalState | null>(null)
	const [updatePendingState, setUpdatePendingState] = useState<PendingModalState | null>(null)
	const yamlRequestIdRef = useRef(0)
	const yamlProfileIdRef = useRef<string | null>(null)
	const importSessionTokenRef = useRef(0)
	const [importSessionToken, setImportSessionToken] = useState(0)
	const serverScopeVersionRef = useRef(0)
	const isActiveRef = useRef(true)
	const createRequestTokenRef = useRef(0)
	const updateRequestTokenRef = useRef(0)
	const deleteRequestTokenRef = useRef(0)
	const testRequestTokenRef = useRef(0)
	const benchmarkRequestTokenRef = useRef(0)

	useLayoutEffect(() => {
		serverScopeVersionRef.current += 1
	}, [props.apiToken])

	useEffect(() => {
		return () => {
			isActiveRef.current = false
		}
	}, [])

	const createLoading = createPendingState?.scopeKey === currentScopeKey && createPendingState.session === createModalSession
	const editLoading = updatePendingState?.scopeKey === currentScopeKey && updatePendingState.session === editModalSession
	const testingProfileId = testingProfileState?.scopeKey === currentScopeKey ? testingProfileState.profileId : null
	const benchmarkingProfileId = benchmarkingProfileState?.scopeKey === currentScopeKey ? benchmarkingProfileState.profileId : null
	const deletingProfileId = deletingProfileState?.scopeKey === currentScopeKey ? deletingProfileState.profileId : null
	const activeYamlOpen = yamlOpen && yamlScopeKey === currentScopeKey
	const activeYamlProfile = yamlScopeKey === currentScopeKey ? yamlProfile : null
	const activeYamlContent = yamlScopeKey === currentScopeKey ? yamlContent : ''
	const activeYamlDraft = yamlScopeKey === currentScopeKey ? yamlDraft : ''
	const activeYamlError = yamlScopeKey === currentScopeKey ? yamlError : null
	const activeExportingProfileId = yamlScopeKey === currentScopeKey ? exportingProfileId : null
	const activeImportOpen = importOpen && importScopeKey === currentScopeKey
	const activeImportText = importScopeKey === currentScopeKey ? importText : ''
	const activeImportError = importScopeKey === currentScopeKey ? importError : null
	const activeImportLoading = importScopeKey === currentScopeKey ? importLoading : false
	const activeEditProfile = editScopeKey === currentScopeKey ? editProfile : null

	const openEditModal = (profile: Profile | null) => {
		setEditModalSession((prev) => prev + 1)
		setEditScopeKey(currentScopeKey)
		setEditProfile(profile)
	}

	const closeEditModal = () => {
		setEditModalSession((prev) => prev + 1)
		setEditScopeKey(null)
		setEditProfile(null)
	}

	const invalidateProfilesQuery = async (scopeApiToken: string) => {
		await queryClient.invalidateQueries({ queryKey: ['profiles', scopeApiToken], exact: true })
	}

	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: () => api.profiles.listProfiles(),
	})
	const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data])
	const showProfilesEmpty = !profilesQuery.isFetching && profiles.length === 0
	const openCreateModal = () => {
		setCreateModalSession((prev) => prev + 1)
		setCreateOpenScopeKey(currentScopeKey)
		if (searchParams.has('create')) return
		const next = new URLSearchParams(searchParams)
		next.set('create', '1')
		setSearchParams(next, { replace: true })
	}
	const closeCreateModal = () => {
		setCreateOpenScopeKey(null)
		if (!searchParams.has('create')) return
		setCreateModalSession((prev) => prev + 1)
		const next = new URLSearchParams(searchParams)
		next.delete('create')
		setSearchParams(next, { replace: true })
	}

	const metaQuery = useQuery({
		queryKey: ['meta', props.apiToken],
		queryFn: () => api.server.getMeta(),
	})

	const tlsCapability = metaQuery.data?.capabilities?.profileTls
	const tlsCapabilityEnabled = tlsCapability?.enabled ?? true
	const profileTLSQuery = useQuery({
		queryKey: ['profileTls', activeEditProfile?.id, props.apiToken],
		enabled: !!activeEditProfile && tlsCapabilityEnabled,
		queryFn: () => api.profiles.getProfileTLS(activeEditProfile!.id),
	})

	const applyTLSUpdate = async (
		profileId: string,
		values: ProfileFormValues,
		mode: 'create' | 'edit',
		scopeApiToken: string,
	) => {
		if (mode === 'create') {
			if (!values.tlsEnabled) return
			const tlsConfig = buildTLSConfigFromValues(values)
			if (!tlsConfig) throw new Error('mTLS requires client certificate and key')
			await api.profiles.updateProfileTLS(profileId, tlsConfig)
			await queryClient.invalidateQueries({ queryKey: ['profileTls', profileId, scopeApiToken], exact: true })
			return
		}

		const action = values.tlsAction ?? 'keep'
		if (action === 'keep') return
		if (action === 'disable') {
			await api.profiles.deleteProfileTLS(profileId)
			await queryClient.invalidateQueries({ queryKey: ['profileTls', profileId, scopeApiToken], exact: true })
			return
		}
		if (action === 'enable') {
			const tlsConfig = buildTLSConfigFromValues(values)
			if (!tlsConfig) throw new Error('mTLS requires client certificate and key')
			await api.profiles.updateProfileTLS(profileId, tlsConfig)
			await queryClient.invalidateQueries({ queryKey: ['profileTls', profileId, scopeApiToken], exact: true })
		}
	}

	const createMutation = useMutation({
		mutationFn: (values: ProfileFormValues) => api.profiles.createProfile(toCreateRequest(values)),
		onMutate: () => {
			createRequestTokenRef.current += 1
			const context = {
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
				apiToken: props.apiToken,
				requestToken: createRequestTokenRef.current,
				modalSession: createModalSession,
			}
			setCreatePendingState({ session: createModalSession, scopeKey: currentScopeKey })
			return context
		},
		onSuccess: async (created, values, context) => {
			const matchesServerScope =
				!!context &&
				isActiveRef.current &&
				context.scopeVersion === serverScopeVersionRef.current &&
				context.scopeKey === currentScopeKey
			const matchesCurrentSession =
				matchesServerScope &&
				context.modalSession === createModalSession &&
				context.requestToken === createRequestTokenRef.current
			if (matchesCurrentSession) {
				message.success('Profile created')
				props.setProfileId(created.id)
				closeCreateModal()
			}
			if (matchesServerScope) {
				await invalidateProfilesQuery(context.apiToken)
				try {
					await applyTLSUpdate(created.id, values, 'create', context.apiToken)
				} catch (err) {
					if (matchesCurrentSession) {
						message.error(`mTLS update failed: ${formatErr(err)}`)
					}
				}
			}
		},
		onSettled: (_data, _err, _values, context) =>
			setCreatePendingState((prev) =>
				prev?.scopeKey === context?.scopeKey && prev?.session === context?.modalSession ? null : prev,
			),
		onError: (err, _values, context) => {
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== serverScopeVersionRef.current ||
				context.scopeKey !== currentScopeKey ||
				context.modalSession !== createModalSession ||
				context.requestToken !== createRequestTokenRef.current
			) {
				return
			}
			message.error(formatErr(err))
		},
	})

	const updateMutation = useMutation({
		mutationFn: (args: { id: string; values: ProfileFormValues }) => api.profiles.updateProfile(args.id, toUpdateRequest(args.values)),
		onMutate: () => {
			updateRequestTokenRef.current += 1
			const context = {
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
				apiToken: props.apiToken,
				requestToken: updateRequestTokenRef.current,
				modalSession: editModalSession,
			}
			setUpdatePendingState({ session: editModalSession, scopeKey: currentScopeKey })
			return context
		},
		onSuccess: async (_, args, context) => {
			const matchesServerScope =
				!!context &&
				isActiveRef.current &&
				context.scopeVersion === serverScopeVersionRef.current &&
				context.scopeKey === currentScopeKey
			const matchesCurrentSession =
				matchesServerScope &&
				context.modalSession === editModalSession &&
				context.requestToken === updateRequestTokenRef.current
			if (matchesCurrentSession) {
				message.success('Profile updated')
				closeEditModal()
			}
			if (matchesServerScope) {
				await invalidateProfilesQuery(context.apiToken)
				try {
					await applyTLSUpdate(args.id, args.values, 'edit', context.apiToken)
				} catch (err) {
					if (matchesCurrentSession) {
						message.error(`mTLS update failed: ${formatErr(err)}`)
					}
				}
			}
		},
		onSettled: (_data, _err, _args, context) =>
			setUpdatePendingState((prev) =>
				prev?.scopeKey === context?.scopeKey && prev?.session === context?.modalSession ? null : prev,
			),
		onError: (err, _args, context) => {
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== serverScopeVersionRef.current ||
				context.scopeKey !== currentScopeKey ||
				context.modalSession !== editModalSession ||
				context.requestToken !== updateRequestTokenRef.current
			) {
				return
			}
			message.error(formatErr(err))
		},
	})

	const deleteMutation = useMutation({
		mutationFn: (id: string) => api.profiles.deleteProfile(id),
		onMutate: (id) => {
			deleteRequestTokenRef.current += 1
			const context = {
				profileId: id,
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
				apiToken: props.apiToken,
				requestToken: deleteRequestTokenRef.current,
			}
			setDeletingProfileState({ profileId: id, scopeKey: currentScopeKey })
			return context
		},
		onSuccess: async (_, id, context) => {
			if (
				context &&
				isActiveRef.current &&
				context.scopeVersion === serverScopeVersionRef.current &&
				context.scopeKey === currentScopeKey
			) {
				await invalidateProfilesQuery(context.apiToken)
			}
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== serverScopeVersionRef.current ||
				context.scopeKey !== currentScopeKey ||
				context.requestToken !== deleteRequestTokenRef.current
			) {
				return
			}
			message.success('Profile deleted')
			if (props.profileId === id) {
				props.setProfileId(null)
			}
		},
		onSettled: (_, __, id, context) =>
			setDeletingProfileState((prev) =>
				prev?.profileId === id && prev?.scopeKey === context?.scopeKey ? null : prev,
			),
		onError: (err, _id, context) => {
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== serverScopeVersionRef.current ||
				context.scopeKey !== currentScopeKey ||
				context.requestToken !== deleteRequestTokenRef.current
			) {
				return
			}
			message.error(formatErr(err))
		},
	})

	const testMutation = useMutation({
		mutationFn: (id: string) => api.profiles.testProfile(id),
		onMutate: (id) => {
			testRequestTokenRef.current += 1
			const context = {
				profileId: id,
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
				requestToken: testRequestTokenRef.current,
			}
			setTestingProfileState({ profileId: id, scopeKey: currentScopeKey })
			return context
		},
		onSuccess: (resp, _id, context) => {
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== serverScopeVersionRef.current ||
				context.scopeKey !== currentScopeKey ||
				context.requestToken !== testRequestTokenRef.current
			) {
				return
			}
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
		onSettled: (_, __, id, context) =>
			setTestingProfileState((prev) =>
				prev?.profileId === id && prev?.scopeKey === context?.scopeKey ? null : prev,
			),
		onError: (err, _id, context) => {
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== serverScopeVersionRef.current ||
				context.scopeKey !== currentScopeKey ||
				context.requestToken !== testRequestTokenRef.current
			) {
				return
			}
			const { content, duration } = formatUnavailableOperationMessage('Profile test unavailable', err)
			message.error(content, duration)
		},
	})

	const benchmarkMutation = useMutation({
		mutationFn: (id: string) => api.profiles.benchmarkProfile(id),
		onMutate: (id) => {
			benchmarkRequestTokenRef.current += 1
			const context = {
				profileId: id,
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
				requestToken: benchmarkRequestTokenRef.current,
			}
			setBenchmarkingProfileState({ profileId: id, scopeKey: currentScopeKey })
			return context
		},
		onSuccess: (resp, _id, context) => {
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== serverScopeVersionRef.current ||
				context.scopeKey !== currentScopeKey ||
				context.requestToken !== benchmarkRequestTokenRef.current
			) {
				return
			}
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
		onSettled: (_, __, id, context) =>
			setBenchmarkingProfileState((prev) =>
				prev?.profileId === id && prev?.scopeKey === context?.scopeKey ? null : prev,
			),
		onError: (err, _id, context) => {
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== serverScopeVersionRef.current ||
				context.scopeKey !== currentScopeKey ||
				context.requestToken !== benchmarkRequestTokenRef.current
			) {
				return
			}
			const { content, duration } = formatUnavailableOperationMessage('Benchmark unavailable', err)
			message.error(content, duration)
		},
	})

	const exportYamlMutation = useMutation({
		mutationFn: ({ profileId }: { profileId: string; requestId: number }) => api.profiles.exportProfileYaml(profileId),
		onMutate: ({ profileId, requestId }) => {
			yamlRequestIdRef.current = requestId
			yamlProfileIdRef.current = profileId
			setExportingProfileId(profileId)
			setYamlContent('')
			setYamlDraft('')
			setYamlError(null)
			return {
				profileId,
				requestId,
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
			}
		},
		onSuccess: (content, _vars, context) => {
			if (!context) return
			if (!isActiveRef.current) return
			if (context.scopeVersion !== serverScopeVersionRef.current) return
			if (context.scopeKey !== currentScopeKey) return
			if (context.requestId !== yamlRequestIdRef.current) return
			if (context.profileId !== yamlProfileIdRef.current) return
			setYamlContent(content)
			setYamlDraft(content)
		},
		onError: (err, _vars, context) => {
			if (!context) return
			if (!isActiveRef.current) return
			if (context.scopeVersion !== serverScopeVersionRef.current) return
			if (context.scopeKey !== currentScopeKey) return
			if (context.requestId !== yamlRequestIdRef.current) return
			if (context.profileId !== yamlProfileIdRef.current) return
			const msg = formatErr(err)
			setYamlError(msg)
			message.error(msg)
		},
		onSettled: (_, __, _vars, context) => {
			if (!context) return
			if (!isActiveRef.current) return
			if (context.scopeVersion !== serverScopeVersionRef.current) return
			if (context.scopeKey !== currentScopeKey) return
			if (context.requestId !== yamlRequestIdRef.current) return
			setExportingProfileId((prev) => (prev === context.profileId ? null : prev))
		},
	})

	const openYamlModal = (profile: Profile) => {
		const requestId = yamlRequestIdRef.current + 1
		yamlRequestIdRef.current = requestId
		yamlProfileIdRef.current = profile.id
		setYamlScopeKey(currentScopeKey)
		setYamlProfile(profile)
		setYamlOpen(true)
		exportYamlMutation.mutate({ profileId: profile.id, requestId })
	}

	const closeYamlModal = () => {
		yamlRequestIdRef.current += 1
		yamlProfileIdRef.current = null
		setYamlOpen(false)
		setYamlScopeKey(null)
		setYamlProfile(null)
		setYamlContent('')
		setYamlDraft('')
		setYamlError(null)
	}

	const saveYamlMutation = useMutation({
		mutationFn: async ({
			profileId,
			yamlText,
			requestId,
		}: {
			profileId: string
			yamlText: string
			requestId: number
		}) => {
			const { updateRequest, tlsConfig, hasTLSBlock } = await parseProfileYaml(yamlText)
			const updated = await api.profiles.updateProfile(profileId, updateRequest)
			if (hasTLSBlock) {
				if (tlsConfig) {
					await api.profiles.updateProfileTLS(profileId, tlsConfig)
				} else {
					await api.profiles.deleteProfileTLS(profileId)
				}
			}
			const canonicalYaml = await api.profiles.exportProfileYaml(profileId)
			return { updated, canonicalYaml, requestId }
		},
		onMutate: ({ profileId, requestId }) => ({
			profileId,
			requestId,
			scopeApiToken: props.apiToken,
			scopeKey: currentScopeKey,
			scopeVersion: serverScopeVersionRef.current,
		}),
		onSuccess: async ({ updated, canonicalYaml, requestId }, vars, context) => {
			if (!context) return
			if (!isActiveRef.current) return
			if (context.scopeVersion !== serverScopeVersionRef.current) return
			if (context.scopeKey !== currentScopeKey) return
			if (requestId !== yamlRequestIdRef.current) return
			if (vars.profileId !== yamlProfileIdRef.current) return
			message.success('Profile YAML saved')
			yamlProfileIdRef.current = updated.id
			setYamlProfile(updated)
			setYamlContent(canonicalYaml)
			setYamlDraft(canonicalYaml)
			setYamlError(null)
			await queryClient.invalidateQueries({ queryKey: ['profiles', context.scopeApiToken], exact: true })
			await queryClient.invalidateQueries({
				queryKey: ['profileTls', updated.id, context.scopeApiToken],
				exact: true,
			})
		},
		onError: (err, vars, context) => {
			if (!context) return
			if (!isActiveRef.current) return
			if (context.scopeVersion !== serverScopeVersionRef.current) return
			if (context.scopeKey !== currentScopeKey) return
			if (vars.requestId !== yamlRequestIdRef.current) return
			if (vars.profileId !== yamlProfileIdRef.current) return
			const msg = formatErr(err)
			setYamlError(msg)
			message.error(msg)
		},
	})

	const beginImportSession = () => {
		const next = importSessionTokenRef.current + 1
		importSessionTokenRef.current = next
		setImportSessionToken(next)
		return next
	}

	const openImportModal = () => {
		beginImportSession()
		setImportScopeKey(currentScopeKey)
		setImportLoading(false)
		setImportOpen(true)
		setImportText('')
		setImportError(null)
	}

	const closeImportModal = () => {
		beginImportSession()
		setImportLoading(false)
		setImportOpen(false)
		setImportScopeKey(null)
		setImportText('')
		setImportError(null)
	}

	const importMutation = useMutation({
		mutationFn: async ({ yamlText }: { yamlText: string; sessionToken: number }) => {
			const { request, tlsConfig } = await parseProfileYaml(yamlText)
			const created = await api.profiles.createProfile(request)
			if (tlsConfig) {
				await api.profiles.updateProfileTLS(created.id, tlsConfig)
			}
			return created
		},
		onMutate: ({ sessionToken }) => {
			const context = {
				sessionToken,
				scopeApiToken: props.apiToken,
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
			}
			if (sessionToken !== importSessionTokenRef.current) return context
			setImportLoading(true)
			return context
		},
		onSuccess: async (created, _vars, context) => {
			if (!context) return
			if (!isActiveRef.current) return
			if (context.scopeVersion !== serverScopeVersionRef.current) return
			if (context.scopeKey !== currentScopeKey) return
			if (context.sessionToken !== importSessionTokenRef.current) return
			message.success(`Imported profile "${created.name}"`)
			closeImportModal()
			await queryClient.invalidateQueries({ queryKey: ['profiles', context.scopeApiToken], exact: true })
		},
		onError: (err, _vars, context) => {
			if (!context) return
			if (!isActiveRef.current) return
			if (context.scopeVersion !== serverScopeVersionRef.current) return
			if (context.scopeKey !== currentScopeKey) return
			if (context.sessionToken !== importSessionTokenRef.current) return
			const msg = formatErr(err)
			setImportError(msg)
			message.error(msg)
		},
		onSettled: (_, __, _vars, context) => {
			if (!context) return
			if (!isActiveRef.current) return
			if (context.scopeVersion !== serverScopeVersionRef.current) return
			if (context.scopeKey !== currentScopeKey) return
			if (context.sessionToken !== importSessionTokenRef.current) return
			setImportLoading(false)
		},
	})

	const handleImportFileTextLoad = (sessionToken: number, text: string) => {
		if (importScopeKey !== currentScopeKey) return
		if (sessionToken !== importSessionTokenRef.current) return
		setImportText(text)
		setImportError(null)
	}

	const handleYamlCopy = async () => {
		if (yamlScopeKey !== currentScopeKey || !yamlDraft) return
		const res = await copyToClipboard(yamlDraft)
		if (res.ok) {
			message.success('Copied YAML')
			return
		}
		message.error(clipboardFailureHint())
	}

	const handleYamlDownload = () => {
		if (yamlScopeKey !== currentScopeKey || !yamlDraft) return
		downloadTextFile(buildProfileExportFilename(yamlProfile), yamlDraft)
		message.success('Downloaded YAML')
	}

	const apiTokenEnabled = metaQuery.data?.apiTokenEnabled ?? false
	const transferEngine = metaQuery.data?.transferEngine
	const onboardingVisible = !onboardingDismissed && (profiles.length === 0 || !props.profileId)
	const yamlFilename = buildProfileExportFilename(activeYamlProfile)
	const hasOpenModal = createOpen || !!activeEditProfile || activeYamlOpen || activeImportOpen
	const editInitialValues: Partial<ProfileFormValues> | undefined = useMemo(
		() => toProfileEditInitialValues(activeEditProfile),
		[activeEditProfile],
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
						<Button onClick={openImportModal}>Import YAML</Button>
						<Button type="primary" onClick={openCreateModal}>
							New Profile
						</Button>
					</Space>
				}
			/>
			{onboardingVisible ? (
				<section className={styles.onboardingCard} aria-label="Getting started">
					<div className={styles.onboardingHeader}>
						<Typography.Title level={5} className={styles.onboardingTitle}>
							Getting started
						</Typography.Title>
						<Typography.Text type="secondary">Quick setup checklist.</Typography.Text>
					</div>
					<div className={styles.onboardingChecklist}>
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
					</div>
					<div className={styles.onboardingActions}>
						<Button size="small" type="primary" onClick={openCreateModal}>
							Create profile
						</Button>
						<LinkButton to="/buckets" size="small" disabled={!props.profileId}>
							Buckets
						</LinkButton>
						<LinkButton to="/objects" size="small" disabled={!props.profileId}>
							Objects
						</LinkButton>
						<button type="button" className={styles.onboardingDismissButton} onClick={() => setOnboardingDismissed(true)}>
							Dismiss
						</button>
					</div>
				</section>
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
							<Button size="small" onClick={() => openEditModal(profilesNeedingAttention[0] ?? null)}>
								Open next profile to fix
							</Button>
							<Space orientation="vertical" size={4} className={styles.fullWidth}>
								{profilesNeedingAttention.map((profile) => (
									<Space key={profile.id} align="start" className={styles.fullWidth}>
										<Typography.Text className={styles.fullWidth}>
											<strong>{profile.name}</strong>: {profile.validation?.issues?.[0]?.message ?? 'Update required'}
										</Typography.Text>
										<Button size="small" type="link" onClick={() => openEditModal(profile)} aria-label={`Edit profile ${profile.name}`}>
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
					<Button type="primary" onClick={openCreateModal}>
						Create profile
					</Button>
				</Empty>
			) : (
				<ProfilesTable
					scopeKey={currentScopeKey}
					rows={tableRows}
					onUseProfile={props.setProfileId}
					onEdit={openEditModal}
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
					exportingProfileId={activeExportingProfileId}
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
						createLoading={createLoading}
						editProfile={activeEditProfile}
						closeEditModal={closeEditModal}
						onEditSubmit={(id, values) => {
							updateMutation.mutate({ id, values })
						}}
						editLoading={editLoading}
						editInitialValues={editInitialValues}
						tlsCapability={tlsCapability ?? null}
						tlsStatus={profileTLSQuery.data ?? null}
						tlsStatusLoading={profileTLSQuery.isFetching}
						tlsStatusError={profileTLSQuery.isError ? formatErr(profileTLSQuery.error) : null}
						yamlOpen={activeYamlOpen}
						closeYamlModal={closeYamlModal}
						yamlProfile={activeYamlProfile}
						yamlError={activeYamlError}
						yamlContent={activeYamlContent}
						yamlDraft={activeYamlDraft}
						yamlFilename={yamlFilename}
						exportYamlLoading={activeYamlOpen && exportYamlMutation.isPending}
						saveYamlLoading={activeYamlOpen && saveYamlMutation.isPending}
						onYamlCopy={() => void handleYamlCopy()}
						onYamlDownload={handleYamlDownload}
						onYamlDraftChange={setYamlDraft}
						onYamlSave={() => {
							if (!activeYamlProfile) return
							const requestId = yamlRequestIdRef.current + 1
							yamlRequestIdRef.current = requestId
							yamlProfileIdRef.current = activeYamlProfile.id
							saveYamlMutation.mutate({ profileId: activeYamlProfile.id, yamlText: activeYamlDraft, requestId })
						}}
						importOpen={activeImportOpen}
						closeImportModal={closeImportModal}
						importSessionToken={importSessionToken}
						importText={activeImportText}
						importError={activeImportError}
						importLoading={activeImportLoading}
						onImportSubmit={() =>
							importMutation.mutate({
								yamlText: activeImportText,
								sessionToken: importSessionTokenRef.current,
							})
						}
						onImportFileTextLoad={handleImportFileTextLoad}
						onImportTextChange={setImportText}
						onImportErrorClear={() => setImportError(null)}
					/>
				</Suspense>
			) : null}
		</Space>
	)
}
