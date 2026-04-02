import { useCallback, useEffect, useRef, useState } from 'react'
import { Space, Typography } from 'antd'

import { confirmDangerAction } from '../../lib/confirmDangerAction'

type DeleteMutation = {
	mutateAsync: (keys: string[]) => Promise<unknown>
}

type DeletePrefixMutation = {
	mutateAsync: (args: { prefix: string; dryRun: boolean }) => Promise<unknown>
}

type UseObjectsDeleteConfirmArgs = {
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	selectedKeys: Set<string>
	deleteMutation: DeleteMutation
	deletePrefixJobMutation: DeletePrefixMutation
}

export function useObjectsDeleteConfirm({
	apiToken,
	profileId,
	bucket,
	prefix,
	selectedKeys,
	deleteMutation,
	deletePrefixJobMutation,
}: UseObjectsDeleteConfirmArgs) {
	const currentContextKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const [deletePrefixConfirmState, setDeletePrefixConfirmState] = useState<{
		open: boolean
		dryRun: boolean
		prefix: string
		text: string
		contextKey: string
	}>({
		open: false,
		dryRun: false,
		prefix: '',
		text: '',
		contextKey: currentContextKey,
	})
	const deletePrefixConfirmSessionRef = useRef(0)
	const deletePrefixDialogSessionRef = useRef<number | null>(null)

	const invalidateDeletePrefixConfirmSession = useCallback(() => {
		deletePrefixConfirmSessionRef.current += 1
	}, [])

	const resetDeletePrefixConfirm = useCallback(() => {
		setDeletePrefixConfirmState((prev) => ({
			...prev,
			dryRun: false,
			prefix: '',
			text: '',
		}))
	}, [])

	useEffect(() => {
		invalidateDeletePrefixConfirmSession()
		deletePrefixDialogSessionRef.current = null
	}, [apiToken, bucket, invalidateDeletePrefixConfirmSession, prefix, profileId])

	const confirmDeleteObjects = useCallback(
		(keys: string[]) => {
			if (keys.length === 0) return
			const confirmSessionId = deletePrefixConfirmSessionRef.current

			if (keys.length === 1) {
				const key = keys[0]
				confirmDangerAction({
					title: 'Delete object?',
					description: 'This cannot be undone.',
					details: (
						<Space orientation="vertical" size={4} style={{ width: '100%' }}>
							<Typography.Text>
								Key: <Typography.Text code>{key}</Typography.Text>
							</Typography.Text>
						</Space>
					),
					onConfirm: async () => {
						if (confirmSessionId !== deletePrefixConfirmSessionRef.current) return
						await deleteMutation.mutateAsync(keys)
					},
				})
				return
			}

			confirmDangerAction({
				title: `Delete ${keys.length} objects?`,
				description: 'This cannot be undone.',
				onConfirm: async () => {
					if (confirmSessionId !== deletePrefixConfirmSessionRef.current) return
					await deleteMutation.mutateAsync(keys)
				},
			})
		},
		[deleteMutation],
	)

	const confirmDeleteSelected = useCallback(() => {
		confirmDeleteObjects(Array.from(selectedKeys))
	}, [confirmDeleteObjects, selectedKeys])

	const confirmDeletePrefixAsJob = useCallback(
		(dryRun: boolean, prefixOverride?: string) => {
			if (!profileId || !bucket) return

			const rawPrefix = (prefixOverride ?? prefix).trim()
			if (!rawPrefix) return
			const effectivePrefix = rawPrefix && !rawPrefix.endsWith('/') ? `${rawPrefix}/` : rawPrefix
			invalidateDeletePrefixConfirmSession()
			deletePrefixDialogSessionRef.current = deletePrefixConfirmSessionRef.current
			setDeletePrefixConfirmState({
				open: true,
				dryRun,
				prefix: effectivePrefix,
				text: '',
				contextKey: currentContextKey,
			})
		},
		[bucket, currentContextKey, invalidateDeletePrefixConfirmSession, prefix, profileId],
	)

	const handleDeletePrefixConfirm = useCallback(async () => {
		if (!deletePrefixConfirmState.prefix) return
		const sessionId = deletePrefixDialogSessionRef.current
		if (
			sessionId == null
			|| sessionId !== deletePrefixConfirmSessionRef.current
			|| deletePrefixConfirmState.contextKey !== currentContextKey
		)
			return
		await deletePrefixJobMutation.mutateAsync({
			prefix: deletePrefixConfirmState.prefix,
			dryRun: deletePrefixConfirmState.dryRun,
		})
		if (sessionId !== deletePrefixConfirmSessionRef.current) return
		deletePrefixDialogSessionRef.current = null
		invalidateDeletePrefixConfirmSession()
		resetDeletePrefixConfirm()
		setDeletePrefixConfirmState((prev) => ({
			...prev,
			open: false,
		}))
	}, [
		currentContextKey,
		deletePrefixConfirmState,
		deletePrefixJobMutation,
		invalidateDeletePrefixConfirmSession,
		resetDeletePrefixConfirm,
	])

	const handleDeletePrefixCancel = useCallback(() => {
		deletePrefixDialogSessionRef.current = null
		invalidateDeletePrefixConfirmSession()
		setDeletePrefixConfirmState((prev) => ({
			...prev,
			open: false,
		}))
		resetDeletePrefixConfirm()
	}, [invalidateDeletePrefixConfirmSession, resetDeletePrefixConfirm])

	const deletePrefixConfirmOpen =
		deletePrefixConfirmState.open
		&& deletePrefixConfirmState.contextKey === currentContextKey

	const deletePrefixConfirmDryRun = deletePrefixConfirmOpen ? deletePrefixConfirmState.dryRun : false
	const deletePrefixConfirmPrefix = deletePrefixConfirmOpen ? deletePrefixConfirmState.prefix : ''
	const deletePrefixConfirmText = deletePrefixConfirmOpen ? deletePrefixConfirmState.text : ''

	const setDeletePrefixConfirmText = useCallback((text: string) => {
		setDeletePrefixConfirmState((prev) => ({
			...prev,
			text,
		}))
	}, [])

	return {
		deletePrefixConfirmOpen,
		deletePrefixConfirmDryRun,
		deletePrefixConfirmPrefix,
		deletePrefixConfirmText,
		setDeletePrefixConfirmText,
		confirmDeleteObjects,
		confirmDeleteSelected,
		confirmDeletePrefixAsJob,
		handleDeletePrefixConfirm,
		handleDeletePrefixCancel,
	}
}
