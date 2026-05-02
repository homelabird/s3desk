import { useMutation } from '@tanstack/react-query'
import { useRef, useState, type MutableRefObject } from 'react'

import type { APIClientShape } from '../../api/client'
import type { ProfileFormValues } from './profileTypes'
import {
	clearPendingModalState,
	clearPendingProfileState,
	matchesCurrentMutationRequest,
	matchesServerScope,
	type PendingModalState,
	type PendingProfileState,
} from './profileMutationScope'
import { toCreateRequest, toUpdateRequest } from './profileMutationUtils'
import { profilesFeedback } from './profilesFeedback'

export function useProfilesPageMutations(args: {
	api: APIClientShape
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
			const matchesCurrentSession = matchesCurrentMutationRequest({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
				expectedRequestToken: createRequestTokenRef.current,
				expectedModalSession: createModalSession,
			})
			const inCurrentServerScope = matchesServerScope({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
			})
			if (matchesCurrentSession) {
				profilesFeedback.profileCreated()
				setProfileId(created.id)
				closeCreateModal()
			}
			if (inCurrentServerScope && context) {
				await invalidateProfilesQuery(context.apiToken)
				try {
					await applyTLSUpdate(created.id, values, 'create', context.apiToken)
				} catch (err) {
					if (matchesCurrentSession) {
						profilesFeedback.mtlsUpdateFailed(err)
					}
				}
			}
		},
		onSettled: (_data, _err, _values, context) =>
			setCreatePendingState((prev) => clearPendingModalState(prev, context?.scopeKey, context?.modalSession)),
		onError: (err, _values, context) => {
			if (!matchesCurrentMutationRequest({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
				expectedRequestToken: createRequestTokenRef.current,
				expectedModalSession: createModalSession,
			})) {
				return
			}
			profilesFeedback.error(err)
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
			const matchesCurrentSession = matchesCurrentMutationRequest({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
				expectedRequestToken: updateRequestTokenRef.current,
				expectedModalSession: editModalSession,
			})
			const inCurrentServerScope = matchesServerScope({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
			})
			if (matchesCurrentSession) {
				profilesFeedback.profileUpdated()
				closeEditModal()
			}
			if (inCurrentServerScope && context) {
				await invalidateProfilesQuery(context.apiToken)
				try {
					await applyTLSUpdate(mutationArgs.id, mutationArgs.values, 'edit', context.apiToken)
				} catch (err) {
					if (matchesCurrentSession) {
						profilesFeedback.mtlsUpdateFailed(err)
					}
				}
			}
		},
		onSettled: (_data, _err, _args, context) =>
			setUpdatePendingState((prev) => clearPendingModalState(prev, context?.scopeKey, context?.modalSession)),
		onError: (err, _args, context) => {
			if (!matchesCurrentMutationRequest({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
				expectedRequestToken: updateRequestTokenRef.current,
				expectedModalSession: editModalSession,
			})) {
				return
			}
			profilesFeedback.error(err)
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
			if (matchesServerScope({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
			}) && context) {
				await invalidateProfilesQuery(context.apiToken)
			}
			if (!matchesCurrentMutationRequest({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
				expectedRequestToken: deleteRequestTokenRef.current,
			})) {
				return
			}
			profilesFeedback.profileDeleted()
			if (profileId === id) {
				setProfileId(null)
			}
		},
		onSettled: (_, __, id, context) =>
			setDeletingProfileState((prev) => clearPendingProfileState(prev, id, context?.scopeKey)),
		onError: (err, _id, context) => {
			if (!matchesCurrentMutationRequest({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
				expectedRequestToken: deleteRequestTokenRef.current,
			})) {
				return
			}
			profilesFeedback.error(err)
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
			if (!matchesCurrentMutationRequest({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
				expectedRequestToken: testRequestTokenRef.current,
			})) {
				return
			}
			profilesFeedback.profileTestResult(resp)
		},
		onSettled: (_, __, id, context) =>
			setTestingProfileState((prev) => clearPendingProfileState(prev, id, context?.scopeKey)),
		onError: (err, _id, context) => {
			if (!matchesCurrentMutationRequest({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
				expectedRequestToken: testRequestTokenRef.current,
			})) {
				return
			}
			profilesFeedback.profileTestUnavailable(err)
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
			if (!matchesCurrentMutationRequest({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
				expectedRequestToken: benchmarkRequestTokenRef.current,
			})) {
				return
			}
			profilesFeedback.benchmarkResult(resp)
		},
		onSettled: (_, __, id, context) =>
			setBenchmarkingProfileState((prev) => clearPendingProfileState(prev, id, context?.scopeKey)),
		onError: (err, _id, context) => {
			if (!matchesCurrentMutationRequest({
				context,
				isActiveRef,
				currentScopeKey,
				currentScopeVersion: serverScopeVersionRef.current,
				expectedRequestToken: benchmarkRequestTokenRef.current,
			})) {
				return
			}
			profilesFeedback.benchmarkUnavailable(err)
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
