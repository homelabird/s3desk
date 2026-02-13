import { useCallback, useState } from 'react'
import { Button, Form, message, Typography } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { APIClient } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { normalizePrefix } from './objectsListUtils'

type UseObjectsNewFolderArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	prefix: string
	refreshTreeNode: (key: string) => Promise<void> | void
	onOpenPrefix: (prefix: string) => void
}

type NewFolderFormValues = { name: string; allowPath?: boolean }

export function useObjectsNewFolder({ api, profileId, bucket, prefix, refreshTreeNode, onOpenPrefix }: UseObjectsNewFolderArgs) {
	const queryClient = useQueryClient()
	const [newFolderOpen, setNewFolderOpen] = useState(false)
	const [newFolderForm] = Form.useForm<NewFolderFormValues>()
	const [newFolderError, setNewFolderError] = useState<string | null>(null)
	const [newFolderParentPrefix, setNewFolderParentPrefix] = useState('')

	const openNewFolder = useCallback((parentPrefixOverride?: string) => {
		if (!profileId || !bucket) return
		setNewFolderError(null)
		setNewFolderOpen(true)
		const p = typeof parentPrefixOverride === 'string' ? parentPrefixOverride : prefix
		setNewFolderParentPrefix(p === '/' ? '' : p)
		newFolderForm.setFieldsValue({ name: '', allowPath: false })
	}, [bucket, newFolderForm, prefix, profileId])

	const createFolderMutation = useMutation({
		mutationFn: async (args: NewFolderFormValues) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			const allowPath = !!args.allowPath
			const rawInput = args.name.trim().replace(/\/+$/, '').replace(/^\/+/, '')
			if (!rawInput) throw new Error('folder name is required')
			if (rawInput.includes('\u0000')) throw new Error('invalid folder name')

			const parts = rawInput.split('/').filter(Boolean)
			if (parts.length === 0) throw new Error('folder name is required')
			if (!allowPath && parts.length > 1) throw new Error("folder name must not contain '/'")
			for (const part of parts) {
				if (part === '.' || part === '..') throw new Error('invalid folder name')
			}

			const parent = normalizePrefix(newFolderParentPrefix)
			let current = parent
			let last = ''
			for (const part of parts) {
				current = `${current}${part}/`
				last = current
				await api.createFolder({ profileId, bucket, key: current })
			}
			return { key: last }
		},
		onSuccess: async (resp: { key: string }) => {
			const createdKey = resp.key
			message.success({
				content: (
					<span>
						Folder created: <Typography.Text code>{createdKey}</Typography.Text>{' '}
						<Button
							type="link"
							size="small"
							style={{ paddingInline: 4 }}
							onClick={() => {
								onOpenPrefix(createdKey)
							}}
						>
							Open
						</Button>
					</span>
				),
			})
			setNewFolderOpen(false)
			newFolderForm.resetFields()
			await queryClient.invalidateQueries({ queryKey: ['objects'] })
			const parentKey = normalizePrefix(newFolderParentPrefix) || '/'
			void refreshTreeNode(parentKey)
		},
		onError: (err) => {
			setNewFolderError(formatErr(err))
		},
	})

	const handleNewFolderSubmit = useCallback(
		(values: NewFolderFormValues) => {
			setNewFolderError(null)
			createFolderMutation.mutate(values)
		},
		[createFolderMutation],
	)

	const handleNewFolderCancel = useCallback(() => {
		setNewFolderOpen(false)
		setNewFolderError(null)
		newFolderForm.resetFields()
	}, [newFolderForm])

	return {
		newFolderOpen,
		newFolderForm,
		newFolderSubmitting: createFolderMutation.isPending,
		newFolderError,
		newFolderParentPrefix,
		openNewFolder,
		handleNewFolderSubmit,
		handleNewFolderCancel,
	}
}
