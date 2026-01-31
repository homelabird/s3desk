import { useState } from 'react'
import { message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { APIClient } from '../../api/client'
import type { Job, JobCreateRequest } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type UseObjectsDeleteArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	createJobWithRetry: CreateJobWithRetry
	setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useObjectsDelete({
	api,
	profileId,
	bucket,
	createJobWithRetry,
	setSelectedKeys,
}: UseObjectsDeleteArgs) {
	const queryClient = useQueryClient()
	const [deletingKey, setDeletingKey] = useState<string | null>(null)
	const deleteMutation = useMutation({
		mutationFn: async (keys: string[]) => {
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
				const resp = await api.deleteObjects({ profileId: profileId!, bucket, keys: batch })
				deleted += resp.deleted
			}
			return { kind: 'direct' as const, deleted }
		},
		onMutate: (keys) => setDeletingKey(keys.length === 1 ? keys[0] : null),
		onSuccess: async (result, keys) => {
			if (result.kind === 'direct') {
				message.success(`Deleted ${result.deleted}`)
			} else {
				message.success(`Delete task started: ${result.job.id}`)
				await queryClient.invalidateQueries({ queryKey: ['jobs'] })
			}
			setSelectedKeys((prev) => {
				if (prev.size === 0) return prev
				const next = new Set(prev)
				for (const k of keys) next.delete(k)
				return next
			})
			await queryClient.invalidateQueries({ queryKey: ['objects'] })
		},
		onSettled: (_, __, keys) => setDeletingKey((prev) => (keys.length === 1 && prev === keys[0] ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const deletePrefixJobMutation = useMutation({
		mutationFn: (args: { prefix: string; dryRun: boolean }) =>
			createJobWithRetry({
				type: 'transfer_delete_prefix',
				payload: {
					bucket,
					prefix: args.prefix,
					deleteAll: false,
					allowUnsafePrefix: false,
					include: [],
					exclude: [],
					dryRun: args.dryRun,
				},
			}),
		onSuccess: (job: Job) => message.success(`Delete task started: ${job.id}`),
		onError: (err) => message.error(formatErr(err)),
	})

	return {
		deletingKey,
		deleteMutation,
		deletePrefixJobMutation,
	}
}
