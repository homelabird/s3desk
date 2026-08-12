import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Space, Typography } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { queryKeys } from '../../api/queryKeys'
import type { Job, JobCreateRequest } from '../../api/types'
import { objectsFeedback } from './objectsFeedback'
import { fileNameFromKey, folderLabelFromPrefix } from './objectsListUtils'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type UseObjectsRenameArgs = {
	profileId: string | null
	apiToken: string
	bucket: string
	prefix: string
	createJobWithRetry: CreateJobWithRetry
}

type RenameFormValues = { name: string; confirm: string }

export function useObjectsRename({ profileId, apiToken, bucket, prefix, createJobWithRetry }: UseObjectsRenameArgs) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const currentScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const [renameOpen, setRenameOpen] = useState(false)
	const [renameKind, setRenameKind] = useState<'object' | 'prefix'>('object')
	const [renameSource, setRenameSource] = useState<string | null>(null)
	const [renameValues, setRenameValues] = useState<RenameFormValues>({ name: '', confirm: '' })
	const [renameStateScopeKey, setRenameStateScopeKey] = useState(currentScopeKey)
	const renameSessionRef = useRef(0)
	const [renameSessionId, setRenameSessionId] = useState(0)
	const renameSubmittingSessionRef = useRef<number | null>(null)
	const [renameSubmittingSessionId, setRenameSubmittingSessionId] = useState<number | null>(null)
	const renameScopeMatches = renameStateScopeKey === currentScopeKey
	const renameSubmitting = renameScopeMatches && renameSubmittingSessionId === renameSessionId

	const invalidateRenameSession = useCallback(() => {
		const nextSessionId = renameSessionRef.current + 1
		renameSessionRef.current = nextSessionId
		setRenameSessionId(nextSessionId)
	}, [])

	useEffect(() => {
		invalidateRenameSession()
	}, [apiToken, bucket, invalidateRenameSession, prefix, profileId])

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
			const runtime = await import('./objectsDeferredActionRuntime')
			return createJobWithRetry(runtime.buildRenameJobRequest({ ...args, bucket }))
		},
		onSuccess: async (job, args) => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.scope(args.scopeProfileId, args.scopeApiToken), exact: false })
			if (args.sessionId !== renameSessionRef.current) return
			objectsFeedback.open({
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
			objectsFeedback.error(err)
		},
		onSettled: (_data, _error, args) => {
			if (args.sessionId !== renameSubmittingSessionRef.current) return
			renameSubmittingSessionRef.current = null
			setRenameSubmittingSessionId(null)
		},
	})

	const handleRenameSubmit = useCallback(
		(values: RenameFormValues) => {
			if (renameSubmittingSessionRef.current === renameSessionRef.current) return
			if (!renameScopeMatches || !renameSource) return
			if (values.confirm !== 'RENAME') {
				objectsFeedback.typeRenameToProceed()
				return
			}
			renameSubmittingSessionRef.current = renameSessionRef.current
			setRenameSubmittingSessionId(renameSessionRef.current)
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
		renameSubmitting,
		openRenameObject,
		openRenamePrefix,
		handleRenameSubmit,
		handleRenameCancel,
	}
}
