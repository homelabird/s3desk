import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Space, Typography, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import type { Job, JobCreateRequest } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { fileNameFromKey, folderLabelFromPrefix, normalizePrefix, parentPrefixFromKey } from './objectsListUtils'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type UseObjectsRenameArgs = {
	profileId: string | null
	apiToken: string
	bucket: string
	createJobWithRetry: CreateJobWithRetry
}

type RenameFormValues = { name: string; confirm: string }

export function useObjectsRename({ profileId, apiToken, bucket, createJobWithRetry }: UseObjectsRenameArgs) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const currentScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}`
	const [renameOpen, setRenameOpen] = useState(false)
	const [renameKind, setRenameKind] = useState<'object' | 'prefix'>('object')
	const [renameSource, setRenameSource] = useState<string | null>(null)
	const [renameValues, setRenameValues] = useState<RenameFormValues>({ name: '', confirm: '' })
	const [renameStateScopeKey, setRenameStateScopeKey] = useState(currentScopeKey)
	const renameSessionRef = useRef(0)
	const renameScopeMatches = renameStateScopeKey === currentScopeKey

	const invalidateRenameSession = useCallback(() => {
		renameSessionRef.current += 1
	}, [])

	useEffect(() => {
		invalidateRenameSession()
	}, [apiToken, bucket, invalidateRenameSession, profileId])

	const focusRenameInput = useCallback(() => {
		window.setTimeout(() => {
			const el = document.getElementById('objectsRenameInput') as HTMLInputElement | null
			el?.focus()
		}, 0)
	}, [])

	const openRenameObject = useCallback(
		(key: string) => {
			if (!profileId || !bucket) return
			setRenameStateScopeKey(currentScopeKey)
			invalidateRenameSession()
			setRenameKind('object')
			setRenameSource(key)
			setRenameValues({ name: fileNameFromKey(key), confirm: '' })
			setRenameOpen(true)
			focusRenameInput()
		},
		[bucket, currentScopeKey, focusRenameInput, invalidateRenameSession, profileId],
	)

	const openRenamePrefix = useCallback(
		(srcPrefix: string) => {
			if (!profileId || !bucket) return
			setRenameStateScopeKey(currentScopeKey)
			invalidateRenameSession()
			setRenameKind('prefix')
			setRenameSource(srcPrefix)
			setRenameValues({ name: folderLabelFromPrefix(srcPrefix), confirm: '' })
			setRenameOpen(true)
			focusRenameInput()
		},
		[bucket, currentScopeKey, focusRenameInput, invalidateRenameSession, profileId],
	)

	const renameMutation = useMutation({
		mutationFn: async (args: {
			kind: 'object' | 'prefix'
			src: string
			name: string
			sessionId: number
			scopeProfileId: string | null
			scopeApiToken: string
		}) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			const raw = args.name.trim().replace(/\/+$/, '')
			if (!raw) throw new Error('name is required')
			if (raw === '.' || raw === '..') throw new Error('invalid name')
			if (raw.includes('/')) throw new Error("name must not contain '/'")
			if (raw.includes('\u0000')) throw new Error('invalid name')

			if (args.kind === 'prefix') {
				const srcPrefix = normalizePrefix(args.src)
				const parent = parentPrefixFromKey(srcPrefix.replace(/\/+$/, ''))
				const dstPrefix = `${parent}${raw}/`
				if (dstPrefix === srcPrefix) throw new Error('already in destination')
				if (dstPrefix.startsWith(srcPrefix)) throw new Error('destination must not be under source prefix')
				return createJobWithRetry({
					type: 'transfer_move_prefix',
					payload: {
						srcBucket: bucket,
						srcPrefix,
						dstBucket: bucket,
						dstPrefix,
						include: [],
						exclude: [],
						dryRun: false,
					},
				})
			}

			const srcKey = args.src.trim().replace(/^\/+/, '')
			const parent = parentPrefixFromKey(srcKey)
			const dstKey = `${parent}${raw}`
			if (dstKey === srcKey) throw new Error('already in destination')
			return createJobWithRetry({
				type: 'transfer_move_object',
				payload: {
					srcBucket: bucket,
					srcKey,
					dstBucket: bucket,
					dstKey,
					dryRun: false,
				},
			})
		},
		onSuccess: async (job, args) => {
			await queryClient.invalidateQueries({ queryKey: ['jobs', args.scopeProfileId, args.scopeApiToken], exact: false })
			if (args.sessionId !== renameSessionRef.current) return
			message.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>Rename task started: {job.id}</Typography.Text>
						<Button size="small" type="link" onClick={() => navigate('/jobs')}>
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
			setRenameStateScopeKey(currentScopeKey)
			invalidateRenameSession()
			setRenameOpen(false)
			setRenameSource(null)
			setRenameValues({ name: '', confirm: '' })
		},
		onError: (err, args) => {
			if (args.sessionId !== renameSessionRef.current) return
			message.error(formatErr(err))
		},
	})

	const handleRenameSubmit = useCallback(
		(values: RenameFormValues) => {
			if (!renameScopeMatches || !renameSource) return
			if (values.confirm !== 'RENAME') {
				message.error('Type RENAME to proceed')
				return
			}
			renameMutation.mutate({
				kind: renameKind,
				src: renameSource,
				name: values.name,
				sessionId: renameSessionRef.current,
				scopeProfileId: profileId,
				scopeApiToken: apiToken,
			})
		},
		[apiToken, profileId, renameKind, renameMutation, renameScopeMatches, renameSource],
	)

	const handleRenameCancel = useCallback(() => {
		setRenameStateScopeKey(currentScopeKey)
		invalidateRenameSession()
		setRenameOpen(false)
		setRenameSource(null)
		setRenameValues({ name: '', confirm: '' })
	}, [currentScopeKey, invalidateRenameSession])

	return {
		renameOpen: renameScopeMatches ? renameOpen : false,
		renameKind,
		renameSource: renameScopeMatches ? renameSource : null,
		renameValues: renameScopeMatches ? renameValues : { name: '', confirm: '' },
		setRenameValues,
		renameSubmitting: renameMutation.isPending,
		openRenameObject,
		openRenamePrefix,
		handleRenameSubmit,
		handleRenameCancel,
	}
}
