import { useCallback, useState } from 'react'
import { Form, message } from 'antd'
import { useMutation } from '@tanstack/react-query'

import type { Job, JobCreateRequest } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { normalizePrefix, suggestCopyPrefix } from './objectsListUtils'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type CopyMoveFormValues = { dstBucket: string; dstKey: string; dryRun: boolean; confirm: string }
type CopyPrefixFormValues = { dstBucket: string; dstPrefix: string; include: string; exclude: string; dryRun: boolean; confirm: string }

type UseObjectsCopyMoveArgs = {
	profileId: string | null
	bucket: string
	prefix: string
	createJobWithRetry: CreateJobWithRetry
	splitLines: (value: string) => string[]
}

export function useObjectsCopyMove({
	profileId,
	bucket,
	prefix,
	createJobWithRetry,
	splitLines,
}: UseObjectsCopyMoveArgs) {
	const [copyMoveOpen, setCopyMoveOpen] = useState(false)
	const [copyMoveMode, setCopyMoveMode] = useState<'copy' | 'move'>('copy')
	const [copyMoveSrcKey, setCopyMoveSrcKey] = useState<string | null>(null)
	const [copyMoveForm] = Form.useForm<CopyMoveFormValues>()

	const [copyPrefixOpen, setCopyPrefixOpen] = useState(false)
	const [copyPrefixMode, setCopyPrefixMode] = useState<'copy' | 'move'>('copy')
	const [copyPrefixSrcPrefix, setCopyPrefixSrcPrefix] = useState('')
	const [copyPrefixForm] = Form.useForm<CopyPrefixFormValues>()

	const openCopyMove = useCallback(
		(mode: 'copy' | 'move', key: string) => {
			if (!profileId || !bucket) return
			setCopyMoveMode(mode)
			setCopyMoveSrcKey(key)
			setCopyMoveOpen(true)
			copyMoveForm.setFieldsValue({ dstBucket: bucket, dstKey: key, dryRun: false, confirm: '' })
		},
		[bucket, copyMoveForm, profileId],
	)

	const openCopyPrefix = useCallback(
		(mode: 'copy' | 'move', srcPrefixOverride?: string) => {
			if (!profileId || !bucket) return
			const srcPrefix = normalizePrefix(srcPrefixOverride ?? prefix)
			if (!srcPrefix) return

			setCopyPrefixMode(mode)
			setCopyPrefixSrcPrefix(srcPrefix)
			setCopyPrefixOpen(true)
			copyPrefixForm.setFieldsValue({
				dstBucket: bucket,
				dstPrefix: suggestCopyPrefix(srcPrefix),
				include: '',
				exclude: '',
				dryRun: false,
				confirm: '',
			})
		},
		[bucket, copyPrefixForm, prefix, profileId],
	)

	const copyPrefixJobMutation = useMutation({
		mutationFn: (args: {
			mode: 'copy' | 'move'
			srcPrefix: string
			dstBucket: string
			dstPrefix: string
			include: string[]
			exclude: string[]
			dryRun: boolean
		}) =>
			createJobWithRetry({
				type: args.mode === 'copy' ? 'transfer_copy_prefix' : 'transfer_move_prefix',
				payload: {
					srcBucket: bucket,
					srcPrefix: args.srcPrefix,
					dstBucket: args.dstBucket,
					dstPrefix: args.dstPrefix,
					include: args.include,
					exclude: args.exclude,
					dryRun: args.dryRun,
				},
			}),
		onSuccess: (job, args) => {
			message.success(`${args.mode === 'copy' ? 'Copy' : 'Move'} task started: ${job.id}`)
			setCopyPrefixOpen(false)
			setCopyPrefixSrcPrefix('')
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const copyMoveMutation = useMutation({
		mutationFn: (args: { mode: 'copy' | 'move'; srcKey: string; dstBucket: string; dstKey: string; dryRun: boolean }) => {
			const type = args.mode === 'copy' ? 'transfer_copy_object' : 'transfer_move_object'
			return createJobWithRetry({
				type,
				payload: {
					srcBucket: bucket,
					srcKey: args.srcKey,
					dstBucket: args.dstBucket,
					dstKey: args.dstKey,
					dryRun: args.dryRun,
				},
			})
		},
		onSuccess: (job, args) => {
			message.success(`${args.mode === 'copy' ? 'Copy' : 'Move'} task started: ${job.id}`)
			setCopyMoveOpen(false)
			setCopyMoveSrcKey(null)
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const handleCopyPrefixSubmit = useCallback(
		(values: CopyPrefixFormValues) => {
			if (!profileId || !bucket || !copyPrefixSrcPrefix) return
			copyPrefixJobMutation.mutate({
				mode: copyPrefixMode,
				srcPrefix: copyPrefixSrcPrefix,
				dstBucket: values.dstBucket.trim(),
				dstPrefix: normalizePrefix(values.dstPrefix),
				include: splitLines(values.include),
				exclude: splitLines(values.exclude),
				dryRun: values.dryRun,
			})
		},
		[bucket, copyPrefixJobMutation, copyPrefixMode, copyPrefixSrcPrefix, profileId, splitLines],
	)

	const handleCopyMoveSubmit = useCallback(
		(values: CopyMoveFormValues) => {
			if (!profileId || !bucket || !copyMoveSrcKey) return
			copyMoveMutation.mutate({
				mode: copyMoveMode,
				srcKey: copyMoveSrcKey,
				dstBucket: values.dstBucket.trim(),
				dstKey: values.dstKey.trim(),
				dryRun: values.dryRun,
			})
		},
		[bucket, copyMoveMode, copyMoveMutation, copyMoveSrcKey, profileId],
	)

	const handleCopyPrefixCancel = useCallback(() => {
		setCopyPrefixOpen(false)
		setCopyPrefixSrcPrefix('')
	}, [])

	const handleCopyMoveCancel = useCallback(() => {
		setCopyMoveOpen(false)
		setCopyMoveSrcKey(null)
	}, [])

	return {
		copyMoveOpen,
		copyMoveMode,
		copyMoveSrcKey,
		copyMoveForm,
		copyMoveSubmitting: copyMoveMutation.isPending,
		openCopyMove,
		handleCopyMoveSubmit,
		handleCopyMoveCancel,
		copyPrefixOpen,
		copyPrefixMode,
		copyPrefixSrcPrefix,
		copyPrefixForm,
		copyPrefixSubmitting: copyPrefixJobMutation.isPending,
		openCopyPrefix,
		handleCopyPrefixSubmit,
		handleCopyPrefixCancel,
	}
}
