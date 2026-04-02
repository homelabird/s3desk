import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { APIClient } from '../../api/client'
import type { Job, JobCreateRequest } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { invalidateObjectQueriesForPrefix } from './objectsQueryCache'
import { publishObjectsRefresh, type ObjectsRefreshEventDetail } from './objectsRefreshEvents'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>
type DeleteMutationArgs = { keys: string[]; contextVersion: number }
type DeletePrefixMutationArgs = { prefix: string; dryRun: boolean; contextVersion: number }

type UseObjectsDeleteArgs = {
	api: APIClient
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
	const [deletingState, setDeletingState] = useState<{
		key: string | null
		contextVersion: number
		contextKey: string
	}>({
		key: null,
		contextVersion: 0,
		contextKey: currentContextKey,
	})
	const deleteContextVersionRef = useRef(0)

	useEffect(() => {
		deleteContextVersionRef.current += 1
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
						message.error(job.error)
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
		onMutate: ({ keys, contextVersion }) => {
			setDeletingState({
				key: keys.length === 1 ? keys[0] : null,
				contextVersion,
				contextKey: currentContextKey,
			})
			return {
				scopeProfileId: profileId,
				scopeApiToken: apiToken,
				contextVersion,
			}
		},
		onSuccess: async (result, { keys, contextVersion }, context) => {
			if (result.kind === 'direct') {
				if (contextVersion !== deleteContextVersionRef.current) return
				message.success(`Deleted ${result.deleted}`)
			} else {
				await queryClient.invalidateQueries({
					queryKey: ['jobs', context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken],
					exact: false,
				})
				if (contextVersion !== deleteContextVersionRef.current) return
				message.success(`Delete task started: ${result.job.id}`)
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
		onSettled: (_, __, { keys, contextVersion }) => {
			if (contextVersion !== deleteContextVersionRef.current) return
			setDeletingState((prev) => {
				if (prev.contextVersion !== contextVersion) return prev
				if (keys.length === 1 && prev.key !== keys[0]) return prev
				return { key: null, contextVersion, contextKey: prev.contextKey }
			})
		},
		onError: (err, { contextVersion }) => {
			if (contextVersion !== deleteContextVersionRef.current) return
			message.error(formatErr(err))
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
		onMutate: (variables) => ({
			contextVersion: variables.contextVersion,
			scopeProfileId: profileId,
			scopeApiToken: apiToken,
		}),
		onSuccess: async (job: Job, variables, context) => {
			await queryClient.invalidateQueries({
				queryKey: ['jobs', context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken],
				exact: false,
			})
			if (variables.contextVersion !== deleteContextVersionRef.current) return
			message.success(`Delete task started: ${job.id}`)
			void watchDeleteJobCompletion(job.id, variables.prefix, 'delete_prefix', variables.contextVersion)
		},
		onError: (err, variables, context) => {
			if ((context?.contextVersion ?? variables.contextVersion) !== deleteContextVersionRef.current) return
			message.error(formatErr(err))
		},
	})

	const deleteMutation = {
		isPending: rawDeleteMutation.isPending,
		mutateAsync: (keys: string[]) =>
			rawDeleteMutation.mutateAsync({
				keys,
				contextVersion: deleteContextVersionRef.current,
			}),
	}

	const deletePrefixJobMutation = {
		isPending: rawDeletePrefixJobMutation.isPending,
		mutateAsync: (args: { prefix: string; dryRun: boolean }) =>
			rawDeletePrefixJobMutation.mutateAsync({
				...args,
				contextVersion: deleteContextVersionRef.current,
			}),
	}

	return {
		deletingKey:
			deletingState.contextKey === currentContextKey ? deletingState.key : null,
		deleteMutation,
		deletePrefixJobMutation,
	}
}
