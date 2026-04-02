import { Button, Space, Typography, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { Job, JobCreateRequest } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { fileNameFromKey, normalizePrefix } from './objectsListUtils'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

export type MoveSelectionValues = {
	dstBucket: string
	dstPrefix: string
	confirm: string
}

type UseObjectsSelectionMoveArgs = {
	profileId: string | null
	apiToken: string
	bucket: string
	prefix: string
	selectedKeys: Set<string>
	createJobWithRetry: CreateJobWithRetry
	setSelectedKeys: (next: Set<string>) => void
}

export function useObjectsSelectionMove({
	profileId,
	apiToken,
	bucket,
	prefix,
	selectedKeys,
	createJobWithRetry,
	setSelectedKeys,
}: UseObjectsSelectionMoveArgs) {
	const queryClient = useQueryClient()
	const currentScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const [moveSelectionOpen, setMoveSelectionOpen] = useState(false)
	const [moveSelectionValues, setMoveSelectionValues] = useState<MoveSelectionValues>({
		dstBucket: '',
		dstPrefix: '',
		confirm: '',
	})
	const moveSelectionSessionRef = useRef(0)
	const navigate = useNavigate()
	const [moveSelectionStateScopeKey, setMoveSelectionStateScopeKey] = useState(currentScopeKey)
	const moveSelectionScopeMatches = moveSelectionStateScopeKey === currentScopeKey

	const invalidateMoveSelectionSession = useCallback(() => {
		moveSelectionSessionRef.current += 1
	}, [])

	useEffect(() => {
		invalidateMoveSelectionSession()
	}, [apiToken, bucket, invalidateMoveSelectionSession, prefix, profileId])

	const openMoveSelection = useCallback(() => {
		if (!profileId || !bucket || selectedKeys.size === 0) return
		setMoveSelectionStateScopeKey(currentScopeKey)
		invalidateMoveSelectionSession()
		setMoveSelectionValues({
			dstBucket: bucket,
			dstPrefix: prefix,
			confirm: '',
		})
		setMoveSelectionOpen(true)
	}, [bucket, currentScopeKey, invalidateMoveSelectionSession, prefix, profileId, selectedKeys.size])

	const handleMoveSelectionCancel = useCallback(() => {
		setMoveSelectionStateScopeKey(currentScopeKey)
		invalidateMoveSelectionSession()
		setMoveSelectionOpen(false)
		setMoveSelectionValues({ dstBucket: '', dstPrefix: '', confirm: '' })
	}, [currentScopeKey, invalidateMoveSelectionSession])

	const moveSelectionMutation = useMutation({
		mutationFn: async (args: {
			dstBucket: string
			dstPrefix: string
			sessionId: number
			scopeProfileId: string | null
			scopeApiToken: string
		}) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')

			const dstBucket = args.dstBucket.trim()
			if (!dstBucket) throw new Error('destination bucket is required')

			const srcPrefix = normalizePrefix(prefix)
			const dstPrefix = normalizePrefix(args.dstPrefix)
			const uniqueKeys = Array.from(new Set(Array.from(selectedKeys).map((key) => key.trim()).filter(Boolean)))
			if (uniqueKeys.length === 0) throw new Error('no selected keys to move')
			if (uniqueKeys.length > 50_000) throw new Error('too many keys to move; use a prefix job instead')

			const dstSet = new Set<string>()
			const items: { srcKey: string; dstKey: string }[] = []

			for (const srcKeyRaw of uniqueKeys) {
				const srcKey = srcKeyRaw.replace(/^\/+/, '')
				if (!srcKey) continue

				let rel: string
				if (srcPrefix && srcKey.startsWith(srcPrefix)) {
					rel = srcKey.slice(srcPrefix.length)
				} else if (!srcPrefix) {
					rel = srcKey
				} else {
					rel = fileNameFromKey(srcKey)
				}
				rel = rel.replace(/^\/+/, '')
				if (!rel) rel = fileNameFromKey(srcKey)

				const dstKey = `${dstPrefix}${rel}`
				if (bucket === dstBucket && dstKey === srcKey) continue
				if (dstSet.has(dstKey)) {
					throw new Error(`multiple selected items map to the same destination: ${dstKey}`)
				}
				dstSet.add(dstKey)
				items.push({ srcKey, dstKey })
			}

			if (items.length === 0) throw new Error('nothing to move (already in destination)')

			return createJobWithRetry({
				type: 'transfer_move_batch',
				payload: {
					srcBucket: bucket,
					dstBucket,
					items,
					dryRun: false,
				},
			})
		},
		onSuccess: async (job, args) => {
			await queryClient.invalidateQueries({ queryKey: ['jobs', args.scopeProfileId, args.scopeApiToken], exact: false })
			if (args.sessionId !== moveSelectionSessionRef.current) return
			message.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>
							Move task started: {job.id}
							{args.dstPrefix ? ` -> ${args.dstBucket}/${normalizePrefix(args.dstPrefix)}` : ` -> ${args.dstBucket}/`}
						</Typography.Text>
						<Button size="small" type="link" onClick={() => navigate('/jobs')}>
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
			setSelectedKeys(new Set())
			handleMoveSelectionCancel()
		},
		onError: (err, args) => {
			if (args.sessionId !== moveSelectionSessionRef.current) return
			message.error(formatErr(err))
		},
	})

	const handleMoveSelectionSubmit = useCallback(
		(values: MoveSelectionValues) => {
			if (!moveSelectionScopeMatches || !profileId || !bucket) return
			if (selectedKeys.size === 0) {
				message.info('Select at least one object first')
				return
			}
			if (values.confirm !== 'MOVE') {
				message.error('Type MOVE to proceed')
				return
			}
			moveSelectionMutation.mutate({
				dstBucket: values.dstBucket,
				dstPrefix: values.dstPrefix,
				sessionId: moveSelectionSessionRef.current,
				scopeProfileId: profileId,
				scopeApiToken: apiToken,
			})
		},
		[apiToken, bucket, moveSelectionMutation, moveSelectionScopeMatches, profileId, selectedKeys.size],
	)

	return {
		moveSelectionOpen: moveSelectionScopeMatches ? moveSelectionOpen : false,
		moveSelectionValues: moveSelectionScopeMatches ? moveSelectionValues : { dstBucket: '', dstPrefix: '', confirm: '' },
		setMoveSelectionValues,
		moveSelectionSubmitting: moveSelectionMutation.isPending,
		openMoveSelection,
		handleMoveSelectionCancel,
		handleMoveSelectionSubmit,
	}
}
