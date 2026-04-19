import { useMutation, type QueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { APIClient } from '../../api/client'
import { queryKeys } from '../../api/queryKeys'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { withJobQueueRetry } from '../../lib/jobQueue'

type UseJobsActionMutationsArgs = {
	api: APIClient
	apiToken: string
	profileId: string | null
	queryClient: QueryClient
	onJobDeleted?: (jobId: string) => void
}

export function useJobsActionMutations({
	api,
	apiToken,
	profileId,
	queryClient,
	onJobDeleted,
}: UseJobsActionMutationsArgs) {
	const currentScopeKey = `${apiToken}:${profileId ?? 'none'}`
	const [cancelingJobState, setCancelingJobState] = useState<{ jobId: string; scopeKey: string } | null>(null)
	const [retryingJobState, setRetryingJobState] = useState<{ jobId: string; scopeKey: string } | null>(null)
	const [deletingJobState, setDeletingJobState] = useState<{ jobId: string; scopeKey: string } | null>(null)
	const actionScopeVersionRef = useRef(0)
	const isActiveRef = useRef(true)
	const cancelRequestTokenRef = useRef(0)
	const retryRequestTokenRef = useRef(0)
	const deleteRequestTokenRef = useRef(0)

	useLayoutEffect(() => {
		actionScopeVersionRef.current += 1
	}, [apiToken, profileId])

	useEffect(() => {
		return () => {
			isActiveRef.current = false
		}
	}, [])

	const requireProfileId = () => {
		if (!profileId) throw new Error('profile is required')
		return profileId
	}

	const cancelingJobId = cancelingJobState?.scopeKey === currentScopeKey ? cancelingJobState.jobId : null
	const retryingJobId = retryingJobState?.scopeKey === currentScopeKey ? retryingJobState.jobId : null
	const deletingJobId = deletingJobState?.scopeKey === currentScopeKey ? deletingJobState.jobId : null

	const invalidateJobQueries = async (scopeProfileId: string, scopeApiToken: string, jobId: string) => {
		await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.scope(scopeProfileId, scopeApiToken), exact: false })
		await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(scopeProfileId, jobId, scopeApiToken), exact: true })
	}

	const cancelMutation = useMutation({
		mutationFn: (jobId: string) => api.jobs.cancelJob(requireProfileId(), jobId),
		onMutate: (jobId) => {
			cancelRequestTokenRef.current += 1
			const mutationState = {
				jobId,
				scopeKey: currentScopeKey,
				scopeVersion: actionScopeVersionRef.current,
				requestToken: cancelRequestTokenRef.current,
				profileId: requireProfileId(),
				apiToken,
			}
			setCancelingJobState({ jobId, scopeKey: currentScopeKey })
			return mutationState
		},
		onSuccess: async (_, jobId, context) => {
			if (context) {
				await invalidateJobQueries(context.profileId, context.apiToken, jobId)
			}
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== actionScopeVersionRef.current ||
				context.requestToken !== cancelRequestTokenRef.current
			) {
				return
			}
			message.success('Cancel requested')
		},
		onSettled: (_, __, jobId, context) =>
			setCancelingJobState((prev) =>
				prev?.jobId === jobId && prev?.scopeKey === context?.scopeKey ? null : prev,
			),
		onError: (err, _jobId, context) => {
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== actionScopeVersionRef.current ||
				context.requestToken !== cancelRequestTokenRef.current
			) {
				return
			}
			message.error(formatErr(err))
		},
	})

	const retryMutation = useMutation({
		mutationFn: (jobId: string) => withJobQueueRetry(() => api.jobs.retryJob(requireProfileId(), jobId)),
		onMutate: (jobId) => {
			retryRequestTokenRef.current += 1
			const mutationState = {
				jobId,
				scopeKey: currentScopeKey,
				scopeVersion: actionScopeVersionRef.current,
				requestToken: retryRequestTokenRef.current,
				profileId: requireProfileId(),
				apiToken,
			}
			setRetryingJobState({ jobId, scopeKey: currentScopeKey })
			return mutationState
		},
		onSuccess: async (job, jobId, context) => {
			if (context) {
				await invalidateJobQueries(context.profileId, context.apiToken, jobId)
				if (job.id !== jobId) {
					await invalidateJobQueries(context.profileId, context.apiToken, job.id)
				}
			}
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== actionScopeVersionRef.current ||
				context.requestToken !== retryRequestTokenRef.current
			) {
				return
			}
			message.success(`Retry queued: ${job.id}`)
		},
		onSettled: (_, __, jobId, context) =>
			setRetryingJobState((prev) =>
				prev?.jobId === jobId && prev?.scopeKey === context?.scopeKey ? null : prev,
			),
		onError: (err, _jobId, context) => {
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== actionScopeVersionRef.current ||
				context.requestToken !== retryRequestTokenRef.current
			) {
				return
			}
			message.error(formatErr(err))
		},
	})

	const deleteJobMutation = useMutation({
		mutationFn: (jobId: string) => api.jobs.deleteJob(requireProfileId(), jobId),
		onMutate: (jobId) => {
			deleteRequestTokenRef.current += 1
			const mutationState = {
				jobId,
				scopeKey: currentScopeKey,
				scopeVersion: actionScopeVersionRef.current,
				requestToken: deleteRequestTokenRef.current,
				profileId: requireProfileId(),
				apiToken,
			}
			setDeletingJobState({ jobId, scopeKey: currentScopeKey })
			return mutationState
		},
		onSuccess: async (_, jobId, context) => {
			if (context) {
				await invalidateJobQueries(context.profileId, context.apiToken, jobId)
			}
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== actionScopeVersionRef.current ||
				context.requestToken !== deleteRequestTokenRef.current
			) {
				return
			}
			message.success('Job deleted')
			onJobDeleted?.(jobId)
		},
		onSettled: (_, __, jobId, context) =>
			setDeletingJobState((prev) =>
				prev?.jobId === jobId && prev?.scopeKey === context?.scopeKey ? null : prev,
			),
		onError: (err, _jobId, context) => {
			if (
				!context ||
				!isActiveRef.current ||
				context.scopeVersion !== actionScopeVersionRef.current ||
				context.requestToken !== deleteRequestTokenRef.current
			) {
				return
			}
			message.error(formatErr(err))
		},
	})

	return {
		cancelingJobId,
		retryingJobId,
		deletingJobId,
		cancelMutation,
		retryMutation,
		deleteJobMutation,
	}
}
