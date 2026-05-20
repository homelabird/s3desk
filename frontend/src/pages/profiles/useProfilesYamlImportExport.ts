import { useMutation, type QueryClient } from '@tanstack/react-query'
import { useRef, useState, type MutableRefObject } from 'react'

import type { APIClientShape } from '../../api/client'
import { queryKeys } from '../../api/queryKeys'
import type { Profile } from '../../api/types'
import { copyToClipboard } from '../../lib/clipboard'
import { matchesScopedProfileRequest, matchesScopedRequestId, matchesScopedSession } from './profileMutationScope'
import { downloadTextFile } from './profileMutationUtils'
import { buildProfileExportFilename, parseProfileYaml, parseProfileYamlForUpdate } from './profileYaml'
import { profilesFeedback } from './profilesFeedback'

type UseProfilesYamlImportExportArgs = {
	api: APIClientShape
	apiToken: string
	currentScopeKey: string
	queryClient: Pick<QueryClient, 'invalidateQueries'>
	isActiveRef: MutableRefObject<boolean>
	serverScopeVersionRef: MutableRefObject<number>
}

export function useProfilesYamlImportExport({
	api,
	apiToken,
	currentScopeKey,
	queryClient,
	isActiveRef,
	serverScopeVersionRef,
}: UseProfilesYamlImportExportArgs) {
	const [yamlOpen, setYamlOpen] = useState(false)
	const [yamlScopeKey, setYamlScopeKey] = useState<string | null>(null)
	const [yamlProfile, setYamlProfile] = useState<Profile | null>(null)
	const [yamlContent, setYamlContent] = useState('')
	const [yamlDraft, setYamlDraft] = useState('')
	const [yamlError, setYamlError] = useState<string | null>(null)
	const [yamlIncludesSecrets, setYamlIncludesSecrets] = useState(false)
	const [exportingProfileId, setExportingProfileId] = useState<string | null>(null)
	const [importOpen, setImportOpen] = useState(false)
	const [importScopeKey, setImportScopeKey] = useState<string | null>(null)
	const [importText, setImportText] = useState('')
	const [importError, setImportError] = useState<string | null>(null)
	const [importLoading, setImportLoading] = useState(false)
	const yamlRequestIdRef = useRef(0)
	const yamlProfileIdRef = useRef<string | null>(null)
	const importSessionTokenRef = useRef(0)
	const [importSessionToken, setImportSessionToken] = useState(0)

	const activeYamlOpen = yamlOpen && yamlScopeKey === currentScopeKey
	const activeYamlProfile = yamlScopeKey === currentScopeKey ? yamlProfile : null
	const activeYamlContent = yamlScopeKey === currentScopeKey ? yamlContent : ''
	const activeYamlDraft = yamlScopeKey === currentScopeKey ? yamlDraft : ''
	const activeYamlError = yamlScopeKey === currentScopeKey ? yamlError : null
	const activeYamlIncludesSecrets = yamlScopeKey === currentScopeKey ? yamlIncludesSecrets : false
	const activeExportingProfileId = yamlScopeKey === currentScopeKey ? exportingProfileId : null
	const activeImportOpen = importOpen && importScopeKey === currentScopeKey
	const activeImportText = importScopeKey === currentScopeKey ? importText : ''
	const activeImportError = importScopeKey === currentScopeKey ? importError : null
	const activeImportLoading = importScopeKey === currentScopeKey ? importLoading : false

	const exportYamlMutation = useMutation({
		mutationFn: ({ profileId, includeSecrets }: { profileId: string; requestId: number; includeSecrets?: boolean }) =>
			includeSecrets ? api.profiles.exportProfileYaml(profileId, { includeSecrets: true }) : api.profiles.exportProfileYaml(profileId),
		onMutate: ({ profileId, requestId, includeSecrets }) => {
			yamlRequestIdRef.current = requestId
			yamlProfileIdRef.current = profileId
			setExportingProfileId(profileId)
			setYamlContent('')
			setYamlDraft('')
			setYamlError(null)
			setYamlIncludesSecrets(!!includeSecrets)
			return {
				profileId,
				requestId,
				includeSecrets: !!includeSecrets,
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
			}
		},
		onSuccess: (content, _vars, context) => {
			if (
				!matchesScopedProfileRequest({
					context,
					isActiveRef,
					currentScopeKey,
					currentScopeVersion: serverScopeVersionRef.current,
					expectedRequestId: yamlRequestIdRef.current,
					expectedProfileId: yamlProfileIdRef.current,
				})
				) return
				setYamlContent(content)
				setYamlDraft(content)
				setYamlIncludesSecrets(!!context?.includeSecrets)
			},
		onError: (err, _vars, context) => {
			if (
				!matchesScopedProfileRequest({
					context,
					isActiveRef,
					currentScopeKey,
					currentScopeVersion: serverScopeVersionRef.current,
					expectedRequestId: yamlRequestIdRef.current,
					expectedProfileId: yamlProfileIdRef.current,
				})
			) return
			const msg = profilesFeedback.errorMessage(err)
			setYamlError(msg)
		},
		onSettled: (_, __, _vars, context) => {
			if (
				!matchesScopedRequestId({
					context,
					isActiveRef,
					currentScopeKey,
					currentScopeVersion: serverScopeVersionRef.current,
					expectedRequestId: yamlRequestIdRef.current,
				})
			) return
			if (!context) return
			setExportingProfileId((prev) => (prev === context.profileId ? null : prev))
		},
	})

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
			const { updateRequest, tlsConfig, hasTLSBlock } = await parseProfileYamlForUpdate(yamlText)
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
			scopeApiToken: apiToken,
			scopeKey: currentScopeKey,
			scopeVersion: serverScopeVersionRef.current,
		}),
		onSuccess: async ({ updated, canonicalYaml, requestId }, _vars, context) => {
			if (
				!matchesScopedProfileRequest({
					context,
					isActiveRef,
					currentScopeKey,
					currentScopeVersion: serverScopeVersionRef.current,
					expectedRequestId: requestId,
					expectedProfileId: yamlProfileIdRef.current,
				})
			) return
			profilesFeedback.profileYamlSaved()
			yamlProfileIdRef.current = updated.id
				setYamlProfile(updated)
				setYamlContent(canonicalYaml)
				setYamlDraft(canonicalYaml)
				setYamlError(null)
				setYamlIncludesSecrets(false)
				await queryClient.invalidateQueries({ queryKey: queryKeys.profiles.list(context.scopeApiToken), exact: true })
			await queryClient.invalidateQueries({
				queryKey: queryKeys.profiles.tls(updated.id, context.scopeApiToken),
				exact: true,
			})
		},
		onError: (err, vars, context) => {
			if (
				!matchesScopedProfileRequest({
					context,
					isActiveRef,
					currentScopeKey,
					currentScopeVersion: serverScopeVersionRef.current,
					expectedRequestId: vars.requestId,
					expectedProfileId: yamlProfileIdRef.current,
				})
			) return
			const msg = profilesFeedback.errorMessage(err)
			setYamlError(msg)
		},
	})

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
				scopeApiToken: apiToken,
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
			}
			if (sessionToken !== importSessionTokenRef.current) return context
			setImportLoading(true)
			return context
		},
		onSuccess: async (created, _vars, context) => {
			if (
				!matchesScopedSession({
					context,
					isActiveRef,
					currentScopeKey,
					currentScopeVersion: serverScopeVersionRef.current,
					expectedSessionToken: importSessionTokenRef.current,
				})
			) return
			profilesFeedback.importedProfile(created.name)
			closeImportModal()
			await queryClient.invalidateQueries({ queryKey: queryKeys.profiles.list(context.scopeApiToken), exact: true })
		},
		onError: (err, _vars, context) => {
			if (
				!matchesScopedSession({
					context,
					isActiveRef,
					currentScopeKey,
					currentScopeVersion: serverScopeVersionRef.current,
					expectedSessionToken: importSessionTokenRef.current,
				})
			) return
			const msg = profilesFeedback.errorMessage(err)
			setImportError(msg)
		},
		onSettled: (_, __, _vars, context) => {
			if (
				!matchesScopedSession({
					context,
					isActiveRef,
					currentScopeKey,
					currentScopeVersion: serverScopeVersionRef.current,
					expectedSessionToken: importSessionTokenRef.current,
				})
			) return
			setImportLoading(false)
		},
	})

	const beginImportSession = () => {
		const next = importSessionTokenRef.current + 1
		importSessionTokenRef.current = next
		setImportSessionToken(next)
		return next
	}

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
		setYamlIncludesSecrets(false)
	}

	const saveYaml = () => {
		if (!activeYamlProfile) return
		const requestId = yamlRequestIdRef.current + 1
		yamlRequestIdRef.current = requestId
		yamlProfileIdRef.current = activeYamlProfile.id
		saveYamlMutation.mutate({ profileId: activeYamlProfile.id, yamlText: activeYamlDraft, requestId })
	}

	const loadYamlWithSecrets = () => {
		if (!activeYamlProfile) return
		const requestId = yamlRequestIdRef.current + 1
		yamlRequestIdRef.current = requestId
		yamlProfileIdRef.current = activeYamlProfile.id
		exportYamlMutation.mutate({ profileId: activeYamlProfile.id, requestId, includeSecrets: true })
	}

	const handleYamlCopy = async () => {
		if (yamlScopeKey !== currentScopeKey || !activeYamlDraft) return
		const res = await copyToClipboard(activeYamlDraft)
		if (res.ok) {
			profilesFeedback.copiedYaml()
			return
		}
		profilesFeedback.clipboardFailed()
	}

	const handleYamlDownload = () => {
		if (yamlScopeKey !== currentScopeKey || !activeYamlDraft) return
		downloadTextFile(buildProfileExportFilename(activeYamlProfile), activeYamlDraft)
		profilesFeedback.downloadedYaml()
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

	const submitImport = () => {
		importMutation.mutate({
			yamlText: activeImportText,
			sessionToken: importSessionTokenRef.current,
		})
	}

	const handleImportFileTextLoad = (sessionToken: number, text: string) => {
		if (importScopeKey !== currentScopeKey) return
		if (sessionToken !== importSessionTokenRef.current) return
		setImportText(text)
		setImportError(null)
	}

	const clearImportError = () => setImportError(null)

	const yamlFilename = buildProfileExportFilename(activeYamlProfile)

	return {
		activeYamlOpen,
		activeYamlProfile,
		activeYamlContent,
		activeYamlDraft,
		activeYamlError,
		activeYamlIncludesSecrets,
		activeExportingProfileId,
		activeImportOpen,
		activeImportText,
		activeImportError,
		activeImportLoading,
		yamlFilename,
		exportYamlPending: exportYamlMutation.isPending,
		saveYamlPending: saveYamlMutation.isPending,
		importSessionToken,
		openYamlModal,
		closeYamlModal,
		setYamlDraft,
		handleYamlCopy,
		handleYamlDownload,
		saveYaml,
		loadYamlWithSecrets,
		openImportModal,
		closeImportModal,
		submitImport,
		setImportText,
		handleImportFileTextLoad,
		clearImportError,
	}
}
