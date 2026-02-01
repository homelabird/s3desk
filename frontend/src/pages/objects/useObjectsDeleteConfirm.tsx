import { useCallback, useState } from 'react'
import { Space, Typography } from 'antd'

import { confirmDangerAction } from '../../lib/confirmDangerAction'

type DeleteMutation = {
	mutateAsync: (keys: string[]) => Promise<unknown>
}

type DeletePrefixMutation = {
	mutateAsync: (args: { prefix: string; dryRun: boolean }) => Promise<unknown>
}

type UseObjectsDeleteConfirmArgs = {
	profileId: string | null
	bucket: string
	prefix: string
	selectedKeys: Set<string>
	deleteMutation: DeleteMutation
	deletePrefixJobMutation: DeletePrefixMutation
}

export function useObjectsDeleteConfirm({
	profileId,
	bucket,
	prefix,
	selectedKeys,
	deleteMutation,
	deletePrefixJobMutation,
}: UseObjectsDeleteConfirmArgs) {
	const [deletePrefixConfirmOpen, setDeletePrefixConfirmOpen] = useState(false)
	const [deletePrefixConfirmDryRun, setDeletePrefixConfirmDryRun] = useState(false)
	const [deletePrefixConfirmPrefix, setDeletePrefixConfirmPrefix] = useState('')
	const [deletePrefixConfirmText, setDeletePrefixConfirmText] = useState('')

	const resetDeletePrefixConfirm = useCallback(() => {
		setDeletePrefixConfirmText('')
		setDeletePrefixConfirmPrefix('')
		setDeletePrefixConfirmDryRun(false)
	}, [])

	const confirmDeleteObjects = useCallback(
		(keys: string[]) => {
			if (keys.length === 0) return

			if (keys.length === 1) {
				const key = keys[0]
				confirmDangerAction({
					title: 'Delete object?',
					description: 'This cannot be undone.',
					details: (
						<Space direction="vertical" size={4} style={{ width: '100%' }}>
							<Typography.Text>
								Key: <Typography.Text code>{key}</Typography.Text>
							</Typography.Text>
						</Space>
					),
					onConfirm: async () => {
						await deleteMutation.mutateAsync(keys)
					},
				})
				return
			}

			confirmDangerAction({
				title: `Delete ${keys.length} objects?`,
				description: 'This cannot be undone.',
				onConfirm: async () => {
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
			setDeletePrefixConfirmDryRun(dryRun)
			setDeletePrefixConfirmPrefix(effectivePrefix)
			setDeletePrefixConfirmText('')
			setDeletePrefixConfirmOpen(true)
		},
		[bucket, prefix, profileId],
	)

	const handleDeletePrefixConfirm = useCallback(async () => {
		if (!deletePrefixConfirmPrefix) return
		await deletePrefixJobMutation.mutateAsync({ prefix: deletePrefixConfirmPrefix, dryRun: deletePrefixConfirmDryRun })
		setDeletePrefixConfirmOpen(false)
		resetDeletePrefixConfirm()
	}, [deletePrefixConfirmDryRun, deletePrefixConfirmPrefix, deletePrefixJobMutation, resetDeletePrefixConfirm])

	const handleDeletePrefixCancel = useCallback(() => {
		setDeletePrefixConfirmOpen(false)
		resetDeletePrefixConfirm()
	}, [resetDeletePrefixConfirm])

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
