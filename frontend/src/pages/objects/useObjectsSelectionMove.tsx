import { Button, Space, Typography, message } from 'antd'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
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
	bucket: string
	prefix: string
	selectedKeys: Set<string>
	createJobWithRetry: CreateJobWithRetry
	setSelectedKeys: (next: Set<string>) => void
}

export function useObjectsSelectionMove({
	profileId,
	bucket,
	prefix,
	selectedKeys,
	createJobWithRetry,
	setSelectedKeys,
}: UseObjectsSelectionMoveArgs) {
	const [moveSelectionOpen, setMoveSelectionOpen] = useState(false)
	const [moveSelectionValues, setMoveSelectionValues] = useState<MoveSelectionValues>({
		dstBucket: '',
		dstPrefix: '',
		confirm: '',
	})
	const navigate = useNavigate()

	const openMoveSelection = useCallback(() => {
		if (!profileId || !bucket || selectedKeys.size === 0) return
		setMoveSelectionValues({
			dstBucket: bucket,
			dstPrefix: prefix,
			confirm: '',
		})
		setMoveSelectionOpen(true)
	}, [bucket, prefix, profileId, selectedKeys.size])

	const handleMoveSelectionCancel = useCallback(() => {
		setMoveSelectionOpen(false)
		setMoveSelectionValues({ dstBucket: '', dstPrefix: '', confirm: '' })
	}, [])

	const moveSelectionMutation = useMutation({
		mutationFn: async (args: { dstBucket: string; dstPrefix: string }) => {
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
		onSuccess: (job, args) => {
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
		onError: (err) => message.error(formatErr(err)),
	})

	const handleMoveSelectionSubmit = useCallback(
		(values: MoveSelectionValues) => {
			if (!profileId || !bucket) return
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
			})
		},
		[bucket, moveSelectionMutation, profileId, selectedKeys.size],
	)

	return {
		moveSelectionOpen,
		moveSelectionValues,
		setMoveSelectionValues,
		moveSelectionSubmitting: moveSelectionMutation.isPending,
		openMoveSelection,
		handleMoveSelectionCancel,
		handleMoveSelectionSubmit,
	}
}
