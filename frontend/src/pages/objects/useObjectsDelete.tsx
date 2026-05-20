import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { APIClientShape } from '../../api/client'
import { queryKeys } from '../../api/queryKeys'
import type { Job, JobCreateRequest } from '../../api/types'
import { objectsFeedback } from './objectsFeedback'
import { invalidateObjectQueriesForPrefix } from './objectsQueryCache'
import { publishObjectsRefresh, type ObjectsRefreshEventDetail } from './objectsRefreshEvents'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>
type DeleteMutationArgs = { keys: string[]; contextVersion: number; contextKey: string }
type DeletePrefixMutationArgs = { prefix: string; dryRun: boolean; contextVersion: number; contextKey: string }

type UseObjectsDeleteArgs = {
	api: APIClientShape
	profileId: string | null
	apiToken: string
	bucket: string
	prefix: string
	createJobWithRetry: CreateJobWithRetry
	setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useObjectsDelete({
	api,
	profileId,
	apiToken,
	bucket,
	prefix,
	createJobWithRetry,
	setSelectedKeys,
}: UseObjectsDeleteArgs) {
	const queryClient = useQueryClient()
	const currentContextKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const [deleteContextVersion, setDeleteContextVersion] = useState(0)
	const [deletingState, setDeletingState] = useState<{
		key: string | null
		contextVersion: number
		contextKey: string
	}>({
		key: null,
		contextVersion: 0,
		contextKey: currentContextKey,
	})
	const [deletePendingState, setDeletePendingState] = useState<{
		contextVersion: number
		contextKey: string
	} | null>(null)
	const [deletePrefixPendingState, setDeletePrefixPendingState] = useState<{
		contextVersion: number
		contextKey: string
	} | null>(null)
	const deleteContextVersionRef = useRef(0)
	const deleteMutationPending =
		rawContextMatches(deletePendingState, currentContextKey, deleteContextVersion)
	const deletePrefixJobMutationPending =
		rawContextMatches(deletePrefixPendingState, currentContextKey, deleteContextVersion)

	useEffect(() => {
		const nextContextVersion = deleteContextVersionRef.current + 1
		deleteContextVersionRef.current = nextContextVersion
		setDeleteContextVersion(nextContextVersion)
	}, [apiToken, bucket, prefix, profileId])

	const watchDeleteJobCompletion = async (
		jobId: string,
		refreshPrefix: string,
		source: ObjectsRefreshEventDetail['source'],
		contextVersion: number,
	) => {
		if (!profileId) return

		for (let attempt = 0; attempt < 60; attempt += 1) {
			if (contextVersion !== deleteContextVersionRef.current) return
			try {
				const job = await api.jobs.getJob(profileId, jobId)
				if (contextVersion !== deleteContextVersionRef.current) return
				if (job.status === 'succeeded') {
					await invalidateObjectQueriesForPrefix(queryClient, {
						profileId,
						bucket,
						changedPrefix: refreshPrefix,
						apiToken,
					})
					publishObjectsRefresh({
						apiToken,
						profileId,
						bucket,
						prefix: refreshPrefix,
						source,
					})
					return
				}
				if (job.status === 'failed' || job.status === 'canceled') {
					if (job.error) {
						objectsFeedback.errorText(job.error)
					}
					return
				}
			} catch {
				// ignore transient poll errors and retry until timeout
			}
			await new Promise((resolve) => window.setTimeout(resolve, 1000))
		}
	}

	const rawDeleteMutation = useMutation({
		mutationFn: async ({ keys }: DeleteMutationArgs) => {
			if (keys.length < 1) throw new Error('select objects first')
			if (keys.length > 50_000) throw new Error('too many keys; use a prefix delete job instead')
			if (keys.length > 1000) {
				const job = await createJobWithRetry({
					type: 's3_delete_objects',
					payload: { bucket, keys },
				})
				return { kind: 'job' as const, job }
			}
			let deleted = 0
			for (let i = 0; i < keys.length; i += 1000) {
				const batch = keys.slice(i, i + 1000)
				const resp = await api.objects.deleteObjects({ profileId: profileId!, bucket, keys: batch })
				deleted += resp.deleted
			}
			return { kind: 'direct' as const, deleted }
		},
		onMutate: ({ keys, contextVersion, contextKey }) => {
			setDeletingState({
				key: keys.length === 1 ? keys[0] : null,
				contextVersion,
				contextKey,
			})
			setDeletePendingState({ contextVersion, contextKey })
			return {
				scopeProfileId: profileId,
				scopeApiToken: apiToken,
				contextVersion,
				contextKey,
			}
		},
		onSuccess: async (result, { keys, contextVersion }, context) => {
			if (result.kind === 'direct') {
				if (contextVersion !== deleteContextVersionRef.current) return
				objectsFeedback.deletedCount(result.deleted)
			} else {
				await queryClient.invalidateQueries({
					queryKey: queryKeys.jobs.scope(context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken),
					exact: false,
				})
				if (contextVersion !== deleteContextVersionRef.current) return
				objectsFeedback.deleteTaskStarted(result.job.id)
				void watchDeleteJobCompletion(result.job.id, prefix, 'delete_objects', contextVersion)
			}
			if (contextVersion !== deleteContextVersionRef.current) return
			setSelectedKeys((prev) => {
				if (prev.size === 0) return prev
				const next = new Set(prev)
				for (const k of keys) next.delete(k)
				return next
			})
			if (profileId) {
				await invalidateObjectQueriesForPrefix(queryClient, {
					profileId,
					bucket,
					changedPrefix: prefix,
					apiToken,
				})
				publishObjectsRefresh({
					apiToken,
					profileId,
					bucket,
					prefix,
					source: 'delete_objects',
				})
			}
		},
		onSettled: (_, __, { keys, contextVersion, contextKey }) => {
			setDeletePendingState((prev) =>
				prev?.contextVersion === contextVersion && prev.contextKey === contextKey ? null : prev,
			)
			if (contextVersion !== deleteContextVersionRef.current) return
			setDeletingState((prev) => {
				if (prev.contextVersion !== contextVersion) return prev
				if (keys.length === 1 && prev.key !== keys[0]) return prev
				return { key: null, contextVersion, contextKey: prev.contextKey }
			})
		},
		onError: (err, { contextVersion }) => {
			if (contextVersion !== deleteContextVersionRef.current) return
			objectsFeedback.error(err)
		},
	})

	const rawDeletePrefixJobMutation = useMutation({
		mutationFn: ({ prefix, dryRun }: DeletePrefixMutationArgs) =>
			createJobWithRetry({
				type: 'transfer_delete_prefix',
				payload: {
					bucket,
					prefix,
					deleteAll: false,
					allowUnsafePrefix: false,
					include: [],
					exclude: [],
					dryRun,
				},
		}),
		onMutate: (variables) => {
			setDeletePrefixPendingState({
				contextVersion: variables.contextVersion,
				contextKey: variables.contextKey,
			})
			return {
				contextVersion: variables.contextVersion,
				contextKey: variables.contextKey,
				scopeProfileId: profileId,
				scopeApiToken: apiToken,
			}
		},
		onSuccess: async (job: Job, variables, context) => {
			await queryClient.invalidateQueries({
				queryKey: queryKeys.jobs.scope(context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken),
				exact: false,
			})
			if (variables.contextVersion !== deleteContextVersionRef.current) return
			objectsFeedback.deleteTaskStarted(job.id)
			void watchDeleteJobCompletion(job.id, variables.prefix, 'delete_prefix', variables.contextVersion)
		},
		onError: (err, variables, context) => {
			if ((context?.contextVersion ?? variables.contextVersion) !== deleteContextVersionRef.current) return
			objectsFeedback.error(err)
		},
		onSettled: (_data, _error, variables, context) => {
			const contextVersion = context?.contextVersion ?? variables.contextVersion
			const contextKey = context?.contextKey ?? variables.contextKey
			setDeletePrefixPendingState((prev) =>
				prev?.contextVersion === contextVersion && prev.contextKey === contextKey ? null : prev,
			)
		},
	})

	const deleteMutation = {
		isPending: rawDeleteMutation.isPending && deleteMutationPending,
		mutateAsync: (keys: string[]) =>
			rawDeleteMutation.mutateAsync({
				keys,
				contextVersion: deleteContextVersionRef.current,
				contextKey: currentContextKey,
			}),
	}

	const deletePrefixJobMutation = {
		isPending: rawDeletePrefixJobMutation.isPending && deletePrefixJobMutationPending,
		mutateAsync: (args: { prefix: string; dryRun: boolean }) =>
			rawDeletePrefixJobMutation.mutateAsync({
				...args,
				contextVersion: deleteContextVersionRef.current,
				contextKey: currentContextKey,
			}),
	}

	return {
		deletingKey:
			deletingState.contextKey === currentContextKey ? deletingState.key : null,
		deleteMutation,
		deletePrefixJobMutation,
	}
}

function rawContextMatches(
	state: { contextVersion: number; contextKey: string } | null,
	currentContextKey: string,
	currentContextVersion: number,
) {
	return state?.contextKey === currentContextKey && state.contextVersion === currentContextVersion
}
