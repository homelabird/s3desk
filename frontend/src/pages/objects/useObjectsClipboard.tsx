import { useMutation, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { queryKeys } from '../../api/queryKeys'
import type { Job, JobCreateRequest } from '../../api/types'
import { copyToClipboard } from '../../lib/clipboard'
import { normalizePrefix } from './objectsListUtils'
import { objectsFeedback } from './objectsFeedback'
import type { ClipboardObjects } from './objectsActionCatalog'

const INTERNAL_CLIPBOARD_BY_SERVER_SCOPE = new Map<string, ClipboardObjects>()

function getClipboardServerScope(apiToken: string): string {
	return apiToken.trim() || '__no_server__'
}

function readInternalClipboard(apiToken: string): ClipboardObjects | null {
	return INTERNAL_CLIPBOARD_BY_SERVER_SCOPE.get(getClipboardServerScope(apiToken)) ?? null
}

function writeInternalClipboard(apiToken: string, value: ClipboardObjects | null) {
	const scope = getClipboardServerScope(apiToken)
	if (!value) {
		INTERNAL_CLIPBOARD_BY_SERVER_SCOPE.delete(scope)
		return
	}
	INTERNAL_CLIPBOARD_BY_SERVER_SCOPE.set(scope, value)
}

type UseObjectsClipboardArgs = {
	profileId: string | null
	apiToken: string
	bucket: string
	prefix: string
	selectedKeys: Set<string>
	createJobWithRetry: (req: JobCreateRequest) => Promise<Job>
	queryClient: QueryClient
}

export function useObjectsClipboard({
	profileId,
	apiToken,
	bucket,
	prefix,
	selectedKeys,
	createJobWithRetry,
	queryClient,
}: UseObjectsClipboardArgs) {
	const [clipboardObjectsState, setClipboardObjectsState] = useState<ClipboardObjects | null>(() => readInternalClipboard(apiToken))
	const navigate = useNavigate()
	const clipboardContextVersionRef = useRef(0)
	const setClipboardObjects = useCallback((value: ClipboardObjects | null) => {
		writeInternalClipboard(apiToken, value)
		setClipboardObjectsState(value)
	}, [apiToken])

	useEffect(() => {
		setClipboardObjectsState(readInternalClipboard(apiToken))
	}, [apiToken])

	const invalidateClipboardContext = useCallback(() => {
		clipboardContextVersionRef.current += 1
	}, [])

	useEffect(() => {
		invalidateClipboardContext()
	}, [apiToken, bucket, invalidateClipboardContext, prefix, profileId])

	const pasteObjectsMutation = useMutation({
		mutationFn: async (args: {
			mode: 'copy' | 'move'
			srcBucket: string
			srcPrefix: string
			keys: string[]
			dstBucket: string
			dstPrefix: string
			contextVersion: number
		}) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			const { buildPasteObjectsJobRequest } = await import('./objectsClipboardRuntime')
			return createJobWithRetry(buildPasteObjectsJobRequest(args))
		},
		onMutate: (args) => ({
			contextVersion: args.contextVersion,
			scopeProfileId: profileId,
			scopeApiToken: apiToken,
		}),
		onSuccess: async (job, args, context) => {
			await queryClient.invalidateQueries({
				queryKey: queryKeys.jobs.scope(context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken),
				exact: false,
			})
			if ((context?.contextVersion ?? args.contextVersion) !== clipboardContextVersionRef.current) return
			const label = args.mode === 'copy' ? 'Paste copy task' : 'Paste move task'
			try {
				const { showObjectsJobStartedFeedback } = await import('./objectsJobFeedback')
				showObjectsJobStartedFeedback({ jobId: job.id, label, onOpenJobs: () => navigate('/jobs') })
			} catch {
				objectsFeedback.success(`${label} started: ${job.id}`, 6)
			}
			if (args.mode === 'move') {
				setClipboardObjects(null)
			}
		},
		onError: (err, args, context) => {
			if ((context?.contextVersion ?? args.contextVersion) !== clipboardContextVersionRef.current) return
			objectsFeedback.error(err)
		},
	})

	const onCopy = useCallback(async (value: string) => {
		const res = await copyToClipboard(value)
		if (res.ok) {
			objectsFeedback.copied()
			return
		}
		objectsFeedback.clipboardFailed()
	}, [])

	const copySelectionToClipboard = useCallback(
		async (mode: 'copy' | 'move') => {
			if (!bucket) return
			const keys = Array.from(selectedKeys)
			if (keys.length === 0) return

			setClipboardObjects({ mode, srcProfileId: profileId, srcBucket: bucket, srcPrefix: normalizePrefix(prefix), keys })

			const res = await copyToClipboard(keys.join('\n'))
			if (res.ok) {
				if (mode === 'copy') objectsFeedback.copiedKeys(keys.length)
				else objectsFeedback.cutKeys(keys.length)
				return
			}
			objectsFeedback.savedInternallyButClipboardFailed()
		},
		[bucket, prefix, profileId, selectedKeys, setClipboardObjects],
	)

	const readClipboardObjectsFromSystemClipboard = useCallback(async (): Promise<ClipboardObjects | null> => {
		if (!bucket) {
			objectsFeedback.selectBucketFirst()
			return null
		}
		const { readClipboardObjectsFromSystemClipboard: readClipboard } = await import('./objectsClipboardRuntime')
		return readClipboard(bucket)
	}, [bucket])

	const pasteClipboardObjects = useCallback(async () => {
		const pasteContextVersion = clipboardContextVersionRef.current
		if (!profileId) {
			objectsFeedback.selectProfileFirst()
			return
		}
		if (!bucket) {
			objectsFeedback.selectBucketFirst()
			return
		}

		if (clipboardObjectsState?.srcProfileId && clipboardObjectsState.srcProfileId !== profileId) {
			setClipboardObjects(null)
			objectsFeedback.clipboardDifferentProfile()
			return
		}

		const src = clipboardObjectsState ?? (await readClipboardObjectsFromSystemClipboard())
		if (!src) return
		if (pasteContextVersion !== clipboardContextVersionRef.current) return

		setClipboardObjects(src)

		const mode = src.mode
		const doPaste = async () => {
			if (pasteContextVersion !== clipboardContextVersionRef.current) return
			await pasteObjectsMutation.mutateAsync({
				mode,
				srcBucket: src.srcBucket,
				srcPrefix: src.srcPrefix,
				keys: src.keys,
				dstBucket: bucket,
				dstPrefix: prefix,
				contextVersion: pasteContextVersion,
			})
		}

		if (mode === 'move') {
			const { confirmMoveClipboardObjects } = await import('./objectsJobFeedback')
			if (pasteContextVersion !== clipboardContextVersionRef.current) return
			confirmMoveClipboardObjects({
				count: src.keys.length,
				onConfirm: async () => doPaste(),
			})
			return
		}

		await doPaste()
	}, [bucket, clipboardObjectsState, pasteObjectsMutation, prefix, profileId, readClipboardObjectsFromSystemClipboard, setClipboardObjects])

	return {
		clipboardObjects: clipboardObjectsState,
		onCopy,
		copySelectionToClipboard,
		pasteClipboardObjects,
	}
}
