import { useCallback, useState } from 'react'
import { Form, message } from 'antd'
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
}

type NewFolderFormValues = { name: string }

export function useObjectsNewFolder({ api, profileId, bucket, prefix, refreshTreeNode }: UseObjectsNewFolderArgs) {
	const queryClient = useQueryClient()
	const [newFolderOpen, setNewFolderOpen] = useState(false)
	const [newFolderForm] = Form.useForm<NewFolderFormValues>()

	const focusNewFolderInput = useCallback(() => {
		window.setTimeout(() => {
			const el = document.getElementById('objectsNewFolderInput') as HTMLInputElement | null
			el?.focus()
		}, 0)
	}, [])

	const openNewFolder = useCallback(() => {
		if (!profileId || !bucket) return
		setNewFolderOpen(true)
		newFolderForm.setFieldsValue({ name: '' })
		focusNewFolderInput()
	}, [bucket, focusNewFolderInput, newFolderForm, profileId])

	const createFolderMutation = useMutation({
		mutationFn: async (args: NewFolderFormValues) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			const raw = args.name.trim().replace(/\/+$/, '')
			if (!raw) throw new Error('folder name is required')
			if (raw === '.' || raw === '..') throw new Error('invalid folder name')
			if (raw.includes('/')) throw new Error("folder name must not contain '/'")
			if (raw.includes('\u0000')) throw new Error('invalid folder name')

			const key = `${normalizePrefix(prefix)}${raw}/`
			return api.createFolder({ profileId, bucket, key })
		},
		onSuccess: async (resp) => {
			message.success(`Folder created: ${resp.key}`)
			setNewFolderOpen(false)
			newFolderForm.resetFields()
			await queryClient.invalidateQueries({ queryKey: ['objects'] })
			const parentKey = normalizePrefix(prefix) || '/'
			void refreshTreeNode(parentKey)
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const handleNewFolderSubmit = useCallback(
		(values: NewFolderFormValues) => {
			createFolderMutation.mutate(values)
		},
		[createFolderMutation],
	)

	const handleNewFolderCancel = useCallback(() => {
		setNewFolderOpen(false)
		newFolderForm.resetFields()
	}, [newFolderForm])

	return {
		newFolderOpen,
		newFolderForm,
		newFolderSubmitting: createFolderMutation.isPending,
		openNewFolder,
		handleNewFolderSubmit,
		handleNewFolderCancel,
	}
}
