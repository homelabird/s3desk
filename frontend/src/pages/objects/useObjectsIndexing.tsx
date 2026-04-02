import { useEffect, useRef } from 'react'
import { Button, Space, Typography, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import type { APIClient } from '../../api/client'
import type { Job, JobCreateRequest } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { ObjectsCostMode } from '../../lib/objectsCostMode'
import { shouldAutoIndexForCostMode } from '../../lib/objectsCostMode'
import { normalizePrefix } from './objectsListUtils'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type UseObjectsIndexingArgs = {
	api: APIClient
	profileId: string | null
	apiToken: string
	bucket: string
	prefix: string
	globalSearchOpen: boolean
	globalSearchQueryText: string
	globalSearchPrefixNormalized: string
	objectsCostMode: ObjectsCostMode
	autoIndexEnabled: boolean
	autoIndexTtlMs: number
	autoIndexCooldownMs: number
	setIndexPrefix: (value: string) => void
	createJobWithRetry: CreateJobWithRetry
}

export function useObjectsIndexing({
	api,
	profileId,
	apiToken,
	bucket,
	prefix,
	globalSearchOpen,
	globalSearchQueryText,
	globalSearchPrefixNormalized,
	objectsCostMode,
	autoIndexEnabled,
	autoIndexTtlMs,
	autoIndexCooldownMs,
	setIndexPrefix,
	createJobWithRetry,
}: UseObjectsIndexingArgs) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const autoIndexPendingRef = useRef(false)
	const autoIndexLastKeyRef = useRef<string | null>(null)
	const autoIndexLastTriggeredRef = useRef<number>(0)
	const indexContextVersionRef = useRef(0)

	useEffect(() => {
		indexContextVersionRef.current += 1
	}, [apiToken, bucket, prefix, profileId])

	const indexObjectsJobMutation = useMutation({
		mutationFn: async (args: { prefix: string; fullReindex: boolean; silent?: boolean }) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			const p = normalizePrefix(args.prefix)
			if (p.includes('*')) throw new Error('wildcards are not allowed')

			return createJobWithRetry({
				type: 's3_index_objects',
				payload: {
					bucket,
					prefix: p,
					fullReindex: args.fullReindex,
				},
			})
		},
		onMutate: () => ({
			contextVersion: indexContextVersionRef.current,
			scopeProfileId: profileId,
			scopeApiToken: apiToken,
		}),
		onSuccess: async (job, variables, context) => {
			const isCurrent = context?.contextVersion === indexContextVersionRef.current
			await queryClient.invalidateQueries({
				queryKey: ['jobs', context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken],
				exact: false,
			})
			if (!isCurrent) return
			if (!variables?.silent) {
				message.open({
					type: 'success',
					content: (
						<Space>
							<Typography.Text>Index task started: {job.id}</Typography.Text>
							<Button size="small" type="link" onClick={() => navigate('/jobs')}>
								Open Jobs
							</Button>
						</Space>
					),
					duration: 6,
				})
			}
		},
		onError: (err, _variables, context) => {
			if (context?.contextVersion !== indexContextVersionRef.current) return
			message.error(formatErr(err))
		},
	})

	useEffect(() => {
		if (!globalSearchOpen || !autoIndexEnabled) return
		if (!profileId || !bucket) return
		if (!globalSearchQueryText) return
		const targetPrefix = globalSearchPrefixNormalized || normalizePrefix(prefix)
		if (!shouldAutoIndexForCostMode(objectsCostMode, targetPrefix)) return
		if (!targetPrefix.trim()) return
		if (indexObjectsJobMutation.isPending || autoIndexPendingRef.current) return

		const key = `${profileId}:${bucket}:${targetPrefix}`
		if (autoIndexLastKeyRef.current === key && Date.now() - autoIndexLastTriggeredRef.current < autoIndexCooldownMs) {
			return
		}

		let cancelled = false
		autoIndexPendingRef.current = true
		void (async () => {
			try {
				let indexedAtMs = 0
				const summary = await api.objects.getObjectIndexSummary({
					profileId,
					bucket,
					prefix: targetPrefix,
					sampleLimit: 1,
				})
				if (cancelled) return
				if (summary.indexedAt) {
					indexedAtMs = Date.parse(summary.indexedAt)
				}

				const stale = !indexedAtMs || Date.now() - indexedAtMs > autoIndexTtlMs
				if (!stale) return

				autoIndexLastKeyRef.current = key
				autoIndexLastTriggeredRef.current = Date.now()
				setIndexPrefix(targetPrefix)
				indexObjectsJobMutation.mutate({ prefix: targetPrefix, fullReindex: true, silent: true })
			} catch {
				// Ignore background summary probe failures and wait for the next trigger.
			} finally {
				autoIndexPendingRef.current = false
			}
		})()

		return () => {
			cancelled = true
			autoIndexPendingRef.current = false
		}
	}, [
		api,
		autoIndexCooldownMs,
		autoIndexEnabled,
		autoIndexTtlMs,
		bucket,
		globalSearchOpen,
		globalSearchPrefixNormalized,
		globalSearchQueryText,
		indexObjectsJobMutation,
		objectsCostMode,
		prefix,
		profileId,
		setIndexPrefix,
	])

	return {
		indexObjectsJobMutation,
	}
}
