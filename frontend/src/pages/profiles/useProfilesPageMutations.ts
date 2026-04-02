import { useMutation } from '@tanstack/react-query'
import { message } from 'antd'
import { useRef, useState, type MutableRefObject } from 'react'

import type { APIClient } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { formatProviderOperationFailureMessage, formatUnavailableOperationMessage } from '../../lib/providerOperationFeedback'
import type { ProfileFormValues } from './profileTypes'
import { toCreateRequest, toUpdateRequest } from './profileMutationUtils'
import { formatBps } from './profileViewModel'

type PendingProfileState = {
	profileId: string
	scopeKey: string
}

type PendingModalState = {
	session: number
	scopeKey: string
}

export function useProfilesPageMutations(args: {
	api: APIClient
	apiToken: string
	currentScopeKey: string
	profileId: string | null
	setProfileId: (value: string | null) => void
	createModalSession: number
	editModalSession: number
	closeCreateModal: () => void
	closeEditModal: () => void
	invalidateProfilesQuery: (scopeApiToken: string) => Promise<void>
	applyTLSUpdate: (profileId: string, values: ProfileFormValues, mode: 'create' | 'edit', scopeApiToken: string) => Promise<void>
	isActiveRef: MutableRefObject<boolean>
	serverScopeVersionRef: MutableRefObject<number>
}) {
	const {
		api,
		apiToken,
		currentScopeKey,
		profileId,
		setProfileId,
		createModalSession,
		editModalSession,
		closeCreateModal,
		closeEditModal,
		invalidateProfilesQuery,
		applyTLSUpdate,
		isActiveRef,
		serverScopeVersionRef,
	} = args

	const [testingProfileState, setTestingProfileState] = useState<PendingProfileState | null>(null)
	const [benchmarkingProfileState, setBenchmarkingProfileState] = useState<PendingProfileState | null>(null)
	const [deletingProfileState, setDeletingProfileState] = useState<PendingProfileState | null>(null)
	const [createPendingState, setCreatePendingState] = useState<PendingModalState | null>(null)
	const [updatePendingState, setUpdatePendingState] = useState<PendingModalState | null>(null)

	const createRequestTokenRef = useRef(0)
	const updateRequestTokenRef = useRef(0)
	const deleteRequestTokenRef = useRef(0)
	const testRequestTokenRef = useRef(0)
	const benchmarkRequestTokenRef = useRef(0)

	const createMutation = useMutation({
		mutationFn: (values: ProfileFormValues) => api.profiles.createProfile(toCreateRequest(values)),
		onMutate: () => {
			createRequestTokenRef.current += 1
			const context = {
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
				apiToken,
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
				setProfileId(created.id)
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
		mutationFn: (mutationArgs: { id: string; values: ProfileFormValues }) => api.profiles.updateProfile(mutationArgs.id, toUpdateRequest(mutationArgs.values)),
		onMutate: () => {
			updateRequestTokenRef.current += 1
			const context = {
				scopeKey: currentScopeKey,
				scopeVersion: serverScopeVersionRef.current,
				apiToken,
				requestToken: updateRequestTokenRef.current,
				modalSession: editModalSession,
			}
			setUpdatePendingState({ session: editModalSession, scopeKey: currentScopeKey })
			return context
		},
		onSuccess: async (_, mutationArgs, context) => {
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
					await applyTLSUpdate(mutationArgs.id, mutationArgs.values, 'edit', context.apiToken)
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
				apiToken,
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
			if (profileId === id) {
				setProfileId(null)
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

	return {
		createMutation,
		updateMutation,
		deleteMutation,
		testMutation,
		benchmarkMutation,
		createLoading: createPendingState?.scopeKey === currentScopeKey && createPendingState.session === createModalSession,
		editLoading: updatePendingState?.scopeKey === currentScopeKey && updatePendingState.session === editModalSession,
		testingProfileId: testingProfileState?.scopeKey === currentScopeKey ? testingProfileState.profileId : null,
		benchmarkingProfileId: benchmarkingProfileState?.scopeKey === currentScopeKey ? benchmarkingProfileState.profileId : null,
		deletingProfileId: deletingProfileState?.scopeKey === currentScopeKey ? deletingProfileState.profileId : null,
	}
}
