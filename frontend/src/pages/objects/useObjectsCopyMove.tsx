import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { Job, JobCreateRequest } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { normalizePrefix, suggestCopyPrefix } from './objectsListUtils'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type CopyMoveValues = { dstBucket: string; dstKey: string; dryRun: boolean; confirm: string }

type CopyPrefixValues = {
	dstBucket: string
	dstPrefix: string
	include: string
	exclude: string
	dryRun: boolean
	confirm: string
}

type UseObjectsCopyMoveArgs = {
	profileId: string | null
	apiToken: string
	bucket: string
	prefix: string
	createJobWithRetry: CreateJobWithRetry
	splitLines: (value: string) => string[]
}

export function useObjectsCopyMove({ profileId, apiToken, bucket, prefix, createJobWithRetry, splitLines }: UseObjectsCopyMoveArgs) {
	const queryClient = useQueryClient()
	const currentScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const [copyMoveOpen, setCopyMoveOpen] = useState(false)
	const [copyMoveMode, setCopyMoveMode] = useState<'copy' | 'move'>('copy')
	const [copyMoveSrcKey, setCopyMoveSrcKey] = useState<string | null>(null)
	const [copyMoveValues, setCopyMoveValues] = useState<CopyMoveValues>({
		dstBucket: '',
		dstKey: '',
		dryRun: false,
		confirm: '',
	})

	const [copyPrefixOpen, setCopyPrefixOpen] = useState(false)
	const [copyPrefixMode, setCopyPrefixMode] = useState<'copy' | 'move'>('copy')
	const [copyPrefixSrcPrefix, setCopyPrefixSrcPrefix] = useState('')
	const [copyPrefixValues, setCopyPrefixValues] = useState<CopyPrefixValues>({
		dstBucket: '',
		dstPrefix: '',
		include: '',
		exclude: '',
		dryRun: false,
		confirm: '',
	})
	const copyMoveSessionRef = useRef(0)
	const copyPrefixSessionRef = useRef(0)
	const [copyMoveStateScopeKey, setCopyMoveStateScopeKey] = useState(currentScopeKey)
	const [copyPrefixStateScopeKey, setCopyPrefixStateScopeKey] = useState(currentScopeKey)
	const copyMoveScopeMatches = copyMoveStateScopeKey === currentScopeKey
	const copyPrefixScopeMatches = copyPrefixStateScopeKey === currentScopeKey

	const invalidateCopyMoveSession = useCallback(() => {
		copyMoveSessionRef.current += 1
	}, [])

	const invalidateCopyPrefixSession = useCallback(() => {
		copyPrefixSessionRef.current += 1
	}, [])

	useEffect(() => {
		invalidateCopyMoveSession()
		invalidateCopyPrefixSession()
	}, [apiToken, bucket, invalidateCopyMoveSession, invalidateCopyPrefixSession, prefix, profileId])

	const openCopyMove = useCallback(
		(mode: 'copy' | 'move', key: string) => {
			if (!profileId || !bucket) return
			setCopyMoveStateScopeKey(currentScopeKey)
			invalidateCopyMoveSession()
			setCopyMoveMode(mode)
			setCopyMoveSrcKey(key)
			setCopyMoveValues({ dstBucket: bucket, dstKey: key, dryRun: false, confirm: '' })
			setCopyMoveOpen(true)
		},
		[bucket, currentScopeKey, invalidateCopyMoveSession, profileId],
	)

	const openCopyPrefix = useCallback(
		(mode: 'copy' | 'move', srcPrefixOverride?: string) => {
			if (!profileId || !bucket) return
			const srcPrefix = normalizePrefix(srcPrefixOverride ?? prefix)
			if (!srcPrefix) return

			setCopyPrefixStateScopeKey(currentScopeKey)
			invalidateCopyPrefixSession()
			setCopyPrefixMode(mode)
			setCopyPrefixSrcPrefix(srcPrefix)
			setCopyPrefixValues({
				dstBucket: bucket,
				dstPrefix: suggestCopyPrefix(srcPrefix),
				include: '',
				exclude: '',
				dryRun: false,
				confirm: '',
			})
			setCopyPrefixOpen(true)
		},
		[bucket, currentScopeKey, invalidateCopyPrefixSession, prefix, profileId],
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
			sessionId: number
			scopeProfileId: string | null
			scopeApiToken: string
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
		onSuccess: async (job, args) => {
			await queryClient.invalidateQueries({ queryKey: ['jobs', args.scopeProfileId, args.scopeApiToken], exact: false })
			if (args.sessionId !== copyPrefixSessionRef.current) return
			message.success(`${args.mode === 'copy' ? 'Copy' : 'Move'} task started: ${job.id}`)
			setCopyPrefixStateScopeKey(currentScopeKey)
			invalidateCopyPrefixSession()
			setCopyPrefixOpen(false)
			setCopyPrefixSrcPrefix('')
			setCopyPrefixValues({ dstBucket: '', dstPrefix: '', include: '', exclude: '', dryRun: false, confirm: '' })
		},
		onError: (err, args) => {
			if (args.sessionId !== copyPrefixSessionRef.current) return
			message.error(formatErr(err))
		},
	})

	const copyMoveMutation = useMutation({
		mutationFn: (args: {
			mode: 'copy' | 'move'
			srcKey: string
			dstBucket: string
			dstKey: string
			dryRun: boolean
			sessionId: number
			scopeProfileId: string | null
			scopeApiToken: string
		}) => {
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
		onSuccess: async (job, args) => {
			await queryClient.invalidateQueries({ queryKey: ['jobs', args.scopeProfileId, args.scopeApiToken], exact: false })
			if (args.sessionId !== copyMoveSessionRef.current) return
			message.success(`${args.mode === 'copy' ? 'Copy' : 'Move'} task started: ${job.id}`)
			setCopyMoveStateScopeKey(currentScopeKey)
			invalidateCopyMoveSession()
			setCopyMoveOpen(false)
			setCopyMoveSrcKey(null)
			setCopyMoveValues({ dstBucket: '', dstKey: '', dryRun: false, confirm: '' })
		},
		onError: (err, args) => {
			if (args.sessionId !== copyMoveSessionRef.current) return
			message.error(formatErr(err))
		},
	})

	const handleCopyPrefixSubmit = useCallback(
		(values: CopyPrefixValues) => {
			if (!copyPrefixScopeMatches || !profileId || !bucket || !copyPrefixSrcPrefix) return

			const dstBucket = values.dstBucket.trim()
			if (!dstBucket) {
				message.error('Destination bucket is required')
				return
			}

			const dstPrefix = normalizePrefix(values.dstPrefix)
			if (!dstPrefix) {
				message.error('Destination prefix is required')
				return
			}
			if (dstPrefix.includes('*')) {
				message.error('Wildcards are not allowed')
				return
			}

			if (copyPrefixMode === 'move' && !values.dryRun && values.confirm !== 'MOVE') {
				message.error('Type MOVE to proceed')
				return
			}

			if (dstBucket === bucket) {
				if (dstPrefix === copyPrefixSrcPrefix) {
					message.error('Destination must be different')
					return
				}
				if (dstPrefix.startsWith(copyPrefixSrcPrefix)) {
					message.error('Destination must not be under source')
					return
				}
			}

			copyPrefixJobMutation.mutate({
				mode: copyPrefixMode,
				srcPrefix: copyPrefixSrcPrefix,
				dstBucket,
				dstPrefix,
				include: splitLines(values.include),
				exclude: splitLines(values.exclude),
				dryRun: values.dryRun,
				sessionId: copyPrefixSessionRef.current,
				scopeProfileId: profileId,
				scopeApiToken: apiToken,
			})
		},
		[apiToken, bucket, copyPrefixJobMutation, copyPrefixMode, copyPrefixScopeMatches, copyPrefixSrcPrefix, profileId, splitLines],
	)

	const handleCopyMoveSubmit = useCallback(
		(values: CopyMoveValues) => {
			if (!copyMoveScopeMatches || !profileId || !bucket || !copyMoveSrcKey) return

			const dstBucket = values.dstBucket.trim()
			if (!dstBucket) {
				message.error('Destination bucket is required')
				return
			}

			const dstKey = values.dstKey.trim().replace(/^\/+/, '')
			if (!dstKey) {
				message.error('Destination key is required')
				return
			}
			if (dstKey.includes('*')) {
				message.error('Wildcards are not allowed')
				return
			}

			if (copyMoveMode === 'move' && !values.dryRun && values.confirm !== 'MOVE') {
				message.error('Type MOVE to proceed')
				return
			}

			if (dstBucket === bucket && dstKey === copyMoveSrcKey) {
				message.error('Destination must be different')
				return
			}

			copyMoveMutation.mutate({
				mode: copyMoveMode,
				srcKey: copyMoveSrcKey,
				dstBucket,
				dstKey,
				dryRun: values.dryRun,
				sessionId: copyMoveSessionRef.current,
				scopeProfileId: profileId,
				scopeApiToken: apiToken,
			})
		},
		[apiToken, bucket, copyMoveMode, copyMoveMutation, copyMoveScopeMatches, copyMoveSrcKey, profileId],
	)

	const handleCopyPrefixCancel = useCallback(() => {
		setCopyPrefixStateScopeKey(currentScopeKey)
		invalidateCopyPrefixSession()
		setCopyPrefixOpen(false)
		setCopyPrefixSrcPrefix('')
		setCopyPrefixValues({ dstBucket: '', dstPrefix: '', include: '', exclude: '', dryRun: false, confirm: '' })
	}, [currentScopeKey, invalidateCopyPrefixSession])

	const handleCopyMoveCancel = useCallback(() => {
		setCopyMoveStateScopeKey(currentScopeKey)
		invalidateCopyMoveSession()
		setCopyMoveOpen(false)
		setCopyMoveSrcKey(null)
		setCopyMoveValues({ dstBucket: '', dstKey: '', dryRun: false, confirm: '' })
	}, [currentScopeKey, invalidateCopyMoveSession])

	return {
		copyMoveOpen: copyMoveScopeMatches ? copyMoveOpen : false,
		copyMoveMode: copyMoveScopeMatches ? copyMoveMode : 'copy',
		copyMoveSrcKey: copyMoveScopeMatches ? copyMoveSrcKey : null,
		copyMoveValues: copyMoveScopeMatches ? copyMoveValues : { dstBucket: '', dstKey: '', dryRun: false, confirm: '' },
		setCopyMoveValues,
		copyMoveSubmitting: copyMoveMutation.isPending,
		openCopyMove,
		handleCopyMoveSubmit,
		handleCopyMoveCancel,
		copyPrefixOpen: copyPrefixScopeMatches ? copyPrefixOpen : false,
		copyPrefixMode: copyPrefixScopeMatches ? copyPrefixMode : 'copy',
		copyPrefixSrcPrefix: copyPrefixScopeMatches ? copyPrefixSrcPrefix : '',
		copyPrefixValues: copyPrefixScopeMatches
			? copyPrefixValues
			: { dstBucket: '', dstPrefix: '', include: '', exclude: '', dryRun: false, confirm: '' },
		setCopyPrefixValues,
		copyPrefixSubmitting: copyPrefixJobMutation.isPending,
		openCopyPrefix,
		handleCopyPrefixSubmit,
		handleCopyPrefixCancel,
	}
}
