import { useCallback, useState } from 'react'
import { Button, Form, message, Typography } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { APIClient } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { ObjectTypeFilter } from './objectsTypes'
import { displayNameForPrefix, matchesSearchTokens, normalizeForSearch, normalizePrefix, splitSearchTokens } from './objectsListUtils'

type UseObjectsNewFolderArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	prefix: string
	typeFilter: ObjectTypeFilter
	favoritesOnly: boolean
	searchText: string
	onClearSearch: () => void
	onDisableFavoritesOnly: () => void
	onShowFolders: () => void
	refreshTreeNode: (key: string) => Promise<void> | void
	onOpenPrefix: (prefix: string) => void
}

type NewFolderFormValues = { name: string; allowPath?: boolean }

export function useObjectsNewFolder({
	api,
	profileId,
	bucket,
	prefix,
	typeFilter,
	favoritesOnly,
	searchText,
	onClearSearch,
	onDisableFavoritesOnly,
	onShowFolders,
	refreshTreeNode,
	onOpenPrefix,
}: UseObjectsNewFolderArgs) {
	const queryClient = useQueryClient()
	const [newFolderOpen, setNewFolderOpen] = useState(false)
	const [newFolderForm] = Form.useForm<NewFolderFormValues>()
	const [newFolderError, setNewFolderError] = useState<string | null>(null)
	const [newFolderPartialKey, setNewFolderPartialKey] = useState<string | null>(null)
	const [newFolderParentPrefix, setNewFolderParentPrefix] = useState('')

	const openNewFolder = useCallback((parentPrefixOverride?: string) => {
		if (!profileId || !bucket) return
		setNewFolderError(null)
		setNewFolderPartialKey(null)
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
			try {
				for (const part of parts) {
					current = `${current}${part}/`
					await api.createFolder({ profileId, bucket, key: current })
					last = current
				}
			} catch (err) {
				const e = err instanceof Error ? err : new Error(String(err))
				;(e as { partialKey?: string }).partialKey = last || undefined
				throw e
			}
			return { key: last }
			},
			onSuccess: async (resp: { key: string }) => {
				const createdKey = resp.key
				const parentPrefixNormalized = normalizePrefix(newFolderParentPrefix)
				const currentPrefixNormalized = normalizePrefix(prefix)
				const parentIsCurrent = parentPrefixNormalized === currentPrefixNormalized
				const createdOutsideView = !parentIsCurrent
				const searchRaw = (searchText ?? '').trim()
				const tokens = splitSearchTokens(searchRaw)
				const normalizedTokens = tokens.map(normalizeForSearch)
				const matchesSearch = (value: string) => matchesSearchTokens(value, tokens, normalizedTokens)

				let viewHideReason: 'favoritesOnly' | 'filesOnly' | 'search' | null = null
				if (parentIsCurrent) {
					if (favoritesOnly) {
						viewHideReason = 'favoritesOnly'
					} else if (typeFilter === 'files') {
						viewHideReason = 'filesOnly'
					} else if (tokens.length > 0) {
						const displayName = displayNameForPrefix(createdKey, prefix)
						if (!(matchesSearch(displayName) || matchesSearch(createdKey))) {
							viewHideReason = 'search'
						}
					}
				}
				const autoOpened = parentIsCurrent && !!viewHideReason
				if (autoOpened) {
					onOpenPrefix(createdKey)
				}

				const viewHideLabel =
					viewHideReason === 'favoritesOnly'
						? 'favorites-only view'
						: viewHideReason === 'filesOnly'
							? 'files-only view'
							: viewHideReason === 'search'
								? 'search filter'
								: null
				const createdOutsideLabel = createdOutsideView ? (parentPrefixNormalized || '/') : null
				message.success({
					duration: 6,
					content: (
						<span>
							Folder created{autoOpened ? ' and opened' : ''}{viewHideLabel ? ` (${viewHideLabel})` : createdOutsideLabel ? ` (under ${createdOutsideLabel})` : ''}:{' '}
							<Typography.Text code>{createdKey}</Typography.Text>{' '}
							<Button
								type="link"
								size="small"
								style={{ paddingInline: 4 }}
								onClick={() => {
									onOpenPrefix(createdKey)
								}}
							>
								{autoOpened ? 'Reopen' : 'Open'}
							</Button>
							{autoOpened || createdOutsideView ? (
								<>
									<Button
										type="link"
										size="small"
										style={{ paddingInline: 4 }}
										onClick={() => onOpenPrefix(newFolderParentPrefix)}
									>
										Parent
									</Button>
									{autoOpened ? (
										<>
											{viewHideReason === 'favoritesOnly' ? (
												<Button type="link" size="small" style={{ paddingInline: 4 }} onClick={onDisableFavoritesOnly}>
													Disable favorites-only
												</Button>
											) : viewHideReason === 'filesOnly' ? (
												<Button type="link" size="small" style={{ paddingInline: 4 }} onClick={onShowFolders}>
													Show folders
												</Button>
											) : viewHideReason === 'search' ? (
												<Button type="link" size="small" style={{ paddingInline: 4 }} onClick={onClearSearch}>
													Clear search
												</Button>
											) : null}
										</>
									) : null}
								</>
							) : null}
						</span>
					),
				})
				setNewFolderOpen(false)
				newFolderForm.resetFields()
				setNewFolderPartialKey(null)
			await queryClient.invalidateQueries({ queryKey: ['objects'] })
			const parentKey = normalizePrefix(newFolderParentPrefix) || '/'
			void refreshTreeNode(parentKey)
		},
		onError: (err) => {
			const partialKey =
				typeof (err as { partialKey?: unknown })?.partialKey === 'string' && (err as { partialKey?: string }).partialKey
					? (err as { partialKey?: string }).partialKey!
					: null
			setNewFolderPartialKey(partialKey)
			setNewFolderError(formatErr(err))
		},
	})

	const handleNewFolderSubmit = useCallback(
		(values: NewFolderFormValues) => {
			setNewFolderError(null)
			setNewFolderPartialKey(null)
			createFolderMutation.mutate(values)
		},
		[createFolderMutation],
	)

	const handleNewFolderCancel = useCallback(() => {
		setNewFolderOpen(false)
		setNewFolderError(null)
		setNewFolderPartialKey(null)
		newFolderForm.resetFields()
	}, [newFolderForm])

	return {
		newFolderOpen,
		newFolderForm,
		newFolderSubmitting: createFolderMutation.isPending,
		newFolderError,
		newFolderPartialKey,
		newFolderParentPrefix,
		openNewFolder,
		handleNewFolderSubmit,
		handleNewFolderCancel,
	}
}
