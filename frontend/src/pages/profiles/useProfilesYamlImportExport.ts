import { useMutation, type QueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { useRef, useState, type MutableRefObject } from 'react'

import type { APIClient } from '../../api/client'
import { queryKeys } from '../../api/queryKeys'
import type { Profile } from '../../api/types'
import { clipboardFailureHint, copyToClipboard } from '../../lib/clipboard'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { matchesScopedProfileRequest, matchesScopedRequestId, matchesScopedSession } from './profileMutationScope'
import { downloadTextFile } from './profileMutationUtils'
import { buildProfileExportFilename, parseProfileYaml } from './profileYaml'

type UseProfilesYamlImportExportArgs = {
	api: APIClient
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
	const activeExportingProfileId = yamlScopeKey === currentScopeKey ? exportingProfileId : null
	const activeImportOpen = importOpen && importScopeKey === currentScopeKey
	const activeImportText = importScopeKey === currentScopeKey ? importText : ''
	const activeImportError = importScopeKey === currentScopeKey ? importError : null
	const activeImportLoading = importScopeKey === currentScopeKey ? importLoading : false

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
			const msg = formatErr(err)
			setYamlError(msg)
			message.error(msg)
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
			message.success('Profile YAML saved')
			yamlProfileIdRef.current = updated.id
			setYamlProfile(updated)
			setYamlContent(canonicalYaml)
			setYamlDraft(canonicalYaml)
			setYamlError(null)
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
			const msg = formatErr(err)
			setYamlError(msg)
			message.error(msg)
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
			message.success(`Imported profile "${created.name}"`)
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
			const msg = formatErr(err)
			setImportError(msg)
			message.error(msg)
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
	}

	const saveYaml = () => {
		if (!activeYamlProfile) return
		const requestId = yamlRequestIdRef.current + 1
		yamlRequestIdRef.current = requestId
		yamlProfileIdRef.current = activeYamlProfile.id
		saveYamlMutation.mutate({ profileId: activeYamlProfile.id, yamlText: activeYamlDraft, requestId })
	}

	const handleYamlCopy = async () => {
		if (yamlScopeKey !== currentScopeKey || !activeYamlDraft) return
		const res = await copyToClipboard(activeYamlDraft)
		if (res.ok) {
			message.success('Copied YAML')
			return
		}
		message.error(clipboardFailureHint())
	}

	const handleYamlDownload = () => {
		if (yamlScopeKey !== currentScopeKey || !activeYamlDraft) return
		downloadTextFile(buildProfileExportFilename(activeYamlProfile), activeYamlDraft)
		message.success('Downloaded YAML')
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
		openImportModal,
		closeImportModal,
		submitImport,
		setImportText,
		handleImportFileTextLoad,
		clearImportError,
	}
}
