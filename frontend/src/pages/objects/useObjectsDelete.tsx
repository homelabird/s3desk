import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { APIError, type APIClientShape } from '../../api/client'
import { queryKeys } from '../../api/queryKeys'
import type { Job, JobCreateRequest } from '../../api/types'
import { objectsFeedback } from './objectsFeedback'
import {
	claimObjectJobCompletion,
	invalidateObjectQueriesForPrefix,
	markObjectJobCompletionHandled,
	releaseObjectJobCompletion,
	type ObjectJobCompletion,
} from './objectsQueryCache'
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
	eventsConnected?: boolean
	setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useObjectsDelete({
	api,
	profileId,
	apiToken,
	bucket,
	prefix,
	createJobWithRetry,
	eventsConnected = false,
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
	const eventsConnectedRef = useRef(eventsConnected)
	eventsConnectedRef.current = eventsConnected
	const deleteJobWatchersRef = useRef(new Map<string, {
		apiToken: string
		controller: AbortController
		profileId: string
	}>())
	const deleteMutationPending =
		rawContextMatches(deletePendingState, currentContextKey, deleteContextVersion)
	const deletePrefixJobMutationPending =
		rawContextMatches(deletePrefixPendingState, currentContextKey, deleteContextVersion)

	useEffect(() => {
		const deleteJobWatchers = deleteJobWatchersRef.current
		const nextContextVersion = deleteContextVersionRef.current + 1
		deleteContextVersionRef.current = nextContextVersion
		setDeleteContextVersion(nextContextVersion)
		return () => {
			deleteContextVersionRef.current += 1
			for (const [jobId, watcher] of deleteJobWatchers) {
				watcher.controller.abort()
				releaseObjectJobCompletion({
					apiToken: watcher.apiToken,
					profileId: watcher.profileId,
					jobId,
				})
			}
			deleteJobWatchers.clear()
		}
	}, [apiToken, bucket, prefix, profileId])

	const watchDeleteJobCompletion = async (
		jobId: string,
		refreshPrefix: string,
		source: ObjectsRefreshEventDetail['source'],
		contextVersion: number,
	) => {
		const scopeProfileId = profileId
		if (
			!scopeProfileId ||
			contextVersion !== deleteContextVersionRef.current ||
			deleteJobWatchersRef.current.has(jobId)
		) return
		const controller = new AbortController()
		deleteJobWatchersRef.current.set(jobId, {
			apiToken,
			controller,
			profileId: scopeProfileId,
		})
		let settled = false
		const completionScope = { apiToken, profileId: scopeProfileId, jobId }
		const finishDeleteJob = async (completion: ObjectJobCompletion) => {
			if (
				settled ||
				controller.signal.aborted ||
				contextVersion !== deleteContextVersionRef.current
			) return
			settled = true
			controller.abort()
			deleteJobWatchersRef.current.delete(jobId)
			markObjectJobCompletionHandled(completionScope)
			try {
				await invalidateObjectQueriesForPrefix(queryClient, {
					profileId: scopeProfileId,
					bucket,
					changedPrefix: refreshPrefix,
					apiToken,
				})
			} catch {
				// A cache refresh failure must not restart a completed job watcher.
			}
			if (contextVersion !== deleteContextVersionRef.current) return
			publishObjectsRefresh({
				apiToken,
				profileId: scopeProfileId,
				bucket,
				prefix: refreshPrefix,
				source,
			})
			if ((completion.status === 'failed' || completion.status === 'canceled') && completion.error) {
				objectsFeedback.errorText(completion.error)
			}
		}
		claimObjectJobCompletion(
			completionScope,
			(completion) => void finishDeleteJob(completion),
		)

		let consecutivePollErrors = 0
		let hasPolled = false
		let lastPollAt = 0
		for (;;) {
			if (settled || controller.signal.aborted || contextVersion !== deleteContextVersionRef.current) return
			if (hasPolled && eventsConnectedRef.current && Date.now() - lastPollAt < 30_000) {
				await waitForDeleteJobPoll(controller.signal, 1000)
				continue
			}
			hasPolled = true
			lastPollAt = Date.now()
			let job: Job
			try {
				job = await api.jobs.getJob(scopeProfileId, jobId)
			} catch (err) {
				if (isNonRetryableDeleteJobPollError(err)) return
				consecutivePollErrors += 1
				const delayMs = eventsConnectedRef.current
					? 1000
					: Math.min(20_000, 1000 * 2 ** Math.min(consecutivePollErrors - 1, 5))
				await waitForDeleteJobPoll(controller.signal, delayMs)
				continue
			}
			consecutivePollErrors = 0
			if (settled || controller.signal.aborted || contextVersion !== deleteContextVersionRef.current) return
			if (isDeleteJobTerminal(job)) {
				await finishDeleteJob({ status: job.status, error: job.error })
				return
			}
			await waitForDeleteJobPoll(controller.signal, 1000)
		}
	}

	const rawDeleteMutation = useMutation({
		mutationFn: async ({ keys, contextVersion }: DeleteMutationArgs) => {
			if (keys.length < 1) throw new Error('select objects first')
			if (keys.length > 50_000) throw new Error('too many keys; use a prefix delete job instead')
			if (keys.length > 1000) {
				const job = await createJobWithRetry({
					type: 's3_delete_objects',
					payload: { bucket, keys },
				})
				void watchDeleteJobCompletion(job.id, prefix, 'delete_objects', contextVersion)
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
			}
			if (contextVersion !== deleteContextVersionRef.current) return
			setSelectedKeys((prev) => {
				if (prev.size === 0) return prev
				const next = new Set(prev)
				for (const k of keys) next.delete(k)
				return next
			})
			if (result.kind === 'direct' && profileId) {
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
		mutationFn: async ({ prefix, dryRun, contextVersion }: DeletePrefixMutationArgs) => {
			const job = await createJobWithRetry({
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
			})
			void watchDeleteJobCompletion(job.id, prefix, 'delete_prefix', contextVersion)
			return job
		},
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

function isDeleteJobTerminal(job: Job): job is Job & { status: ObjectJobCompletion['status'] } {
	return job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled'
}

function isNonRetryableDeleteJobPollError(error: unknown): boolean {
	if (!(error instanceof APIError)) return false
	if (error.normalizedError?.retryable === false) return true
	return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 425 && error.status !== 429
}

function waitForDeleteJobPoll(signal: AbortSignal, delayMs: number): Promise<void> {
	if (signal.aborted) return Promise.resolve()
	return new Promise((resolve) => {
		const timer = window.setTimeout(() => {
			signal.removeEventListener('abort', handleAbort)
			resolve()
		}, delayMs)
		function handleAbort() {
			window.clearTimeout(timer)
			resolve()
		}
		signal.addEventListener('abort', handleAbort, { once: true })
	})
}

function rawContextMatches(
	state: { contextVersion: number; contextKey: string } | null,
	currentContextKey: string,
	currentContextVersion: number,
) {
	return state?.contextKey === currentContextKey && state.contextVersion === currentContextVersion
}
