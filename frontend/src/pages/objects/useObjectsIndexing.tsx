import { useEffect, useRef } from 'react'
import { Button, Space, Typography, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { APIError, type APIClient } from '../../api/client'
import type { Job, JobCreateRequest } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { normalizePrefix } from './objectsListUtils'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type UseObjectsIndexingArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	prefix: string
	globalSearchOpen: boolean
	globalSearchQueryText: string
	globalSearchPrefixNormalized: string
	autoIndexEnabled: boolean
	autoIndexTtlMs: number
	autoIndexCooldownMs: number
	setIndexPrefix: (value: string) => void
	createJobWithRetry: CreateJobWithRetry
}

export function useObjectsIndexing({
	api,
	profileId,
	bucket,
	prefix,
	globalSearchOpen,
	globalSearchQueryText,
	globalSearchPrefixNormalized,
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
		onSuccess: async (job, variables) => {
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
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	useEffect(() => {
		if (!globalSearchOpen || !autoIndexEnabled) return
		if (!profileId || !bucket) return
		if (!globalSearchQueryText) return
		const targetPrefix = globalSearchPrefixNormalized || normalizePrefix(prefix)
		if (!targetPrefix.trim()) return
		if (indexObjectsJobMutation.isPending || autoIndexPendingRef.current) return

		const key = `${profileId}:${bucket}:${targetPrefix}`
		if (autoIndexLastKeyRef.current === key && Date.now() - autoIndexLastTriggeredRef.current < autoIndexCooldownMs) {
			return
		}

		autoIndexPendingRef.current = true
		;(async () => {
			let indexedAtMs = 0
			try {
				const summary = await api.getObjectIndexSummary({
					profileId,
					bucket,
					prefix: targetPrefix,
					sampleLimit: 1,
				})
				if (summary.indexedAt) {
					indexedAtMs = Date.parse(summary.indexedAt)
				}
			} catch (err) {
				if (!(err instanceof APIError) || err.code !== 'not_indexed') {
					return
				}
			}

			const stale = !indexedAtMs || Date.now() - indexedAtMs > autoIndexTtlMs
			if (!stale) return

			autoIndexLastKeyRef.current = key
			autoIndexLastTriggeredRef.current = Date.now()
			setIndexPrefix(targetPrefix)
			indexObjectsJobMutation.mutate({ prefix: targetPrefix, fullReindex: true, silent: true })
		})().finally(() => {
			autoIndexPendingRef.current = false
		})
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
		prefix,
		profileId,
		setIndexPrefix,
	])

	return {
		indexObjectsJobMutation,
	}
}
