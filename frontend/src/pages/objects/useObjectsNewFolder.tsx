import { useCallback, useState } from 'react'
import { Button, message, Typography } from 'antd'
import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query'

import type { APIClient } from '../../api/client'
import type { ListObjectsResponse } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { ObjectTypeFilter } from './objectsTypes'
import { getVisibleCreatedPrefix, insertOptimisticPrefixIntoObjectsData, invalidateObjectQueriesForPrefix } from './objectsQueryCache'
import {
	displayNameForPrefix,
	matchesSearchTokens,
	normalizeForSearch,
	normalizePrefix,
	splitSearchTokens,
} from './objectsListUtils'

type UseObjectsNewFolderArgs = {
	api: APIClient
	apiToken: string
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

type NewFolderFormValues = { name: string; allowPath: boolean }
type CreateFolderPlan = { parentPrefix: string; parts: string[]; key: string; visiblePrefix: string }

function buildCreateFolderPlan(values: NewFolderFormValues, parentPrefix: string): CreateFolderPlan {
	const allowPath = !!values.allowPath
	const rawInput = values.name.trim().replace(/\/+$/, '').replace(/^\/+/, '')
	if (!rawInput) throw new Error('folder name is required')
	if (rawInput.includes('\u0000')) throw new Error('invalid folder name')

	const parts = rawInput.split('/').filter(Boolean)
	if (parts.length === 0) throw new Error('folder name is required')
	if (!allowPath && parts.length > 1) throw new Error("folder name must not contain '/'")
	for (const part of parts) {
		if (part === '.' || part === '..') throw new Error('invalid folder name')
	}

	const normalizedParentPrefix = normalizePrefix(parentPrefix)
	let key = normalizedParentPrefix
	for (const part of parts) {
		key = `${key}${part}/`
	}

	return {
		parentPrefix: normalizedParentPrefix,
		parts,
		key,
		visiblePrefix: getVisibleCreatedPrefix(normalizedParentPrefix, key),
	}
}

export function useObjectsNewFolder({
	api,
	apiToken,
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
	const [newFolderValues, setNewFolderValues] = useState<NewFolderFormValues>({ name: '', allowPath: false })
	const [newFolderError, setNewFolderError] = useState<string | null>(null)
	const [newFolderPartialKey, setNewFolderPartialKey] = useState<string | null>(null)
	const [newFolderParentPrefix, setNewFolderParentPrefix] = useState('')

	const openNewFolder = useCallback(
		(parentPrefixOverride?: string) => {
			if (!profileId || !bucket) return
			setNewFolderError(null)
			setNewFolderPartialKey(null)
			setNewFolderOpen(true)
			const p = typeof parentPrefixOverride === 'string' ? parentPrefixOverride : prefix
			setNewFolderParentPrefix(p === '/' ? '' : p)
			setNewFolderValues({ name: '', allowPath: false })
		},
		[bucket, prefix, profileId],
	)

	const createFolderMutation = useMutation({
		mutationFn: async (args: NewFolderFormValues) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			const plan = buildCreateFolderPlan(args, newFolderParentPrefix)
			let current = plan.parentPrefix
			let last = ''
			try {
				for (const part of plan.parts) {
					current = `${current}${part}/`
					await api.objects.createFolder({ profileId, bucket, key: current })
					last = current
				}
			} catch (err) {
				const e = err instanceof Error ? err : new Error(String(err))
				;(e as { partialKey?: string }).partialKey = last || undefined
				throw e
			}
			return { key: last }
		},
		onMutate: async (values: NewFolderFormValues) => {
			if (!profileId || !bucket) return null

			const parentPrefixNormalized = normalizePrefix(newFolderParentPrefix)
			const currentPrefixNormalized = normalizePrefix(prefix)
			if (parentPrefixNormalized !== currentPrefixNormalized) return null

			const plan = buildCreateFolderPlan(values, newFolderParentPrefix)
			const objectsQueryKey = ['objects', profileId, bucket, prefix, apiToken] as const
			await queryClient.cancelQueries({ queryKey: objectsQueryKey, exact: true })
			const previous = queryClient.getQueryData<InfiniteData<ListObjectsResponse, string | undefined>>(objectsQueryKey)
			queryClient.setQueryData<InfiniteData<ListObjectsResponse, string | undefined> | undefined>(objectsQueryKey, (data) =>
				insertOptimisticPrefixIntoObjectsData(data, plan.visiblePrefix),
			)

			return {
				objectsQueryKey,
				previousObjectsData: previous,
			}
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
			const visiblePrefix = getVisibleCreatedPrefix(parentPrefixNormalized, createdKey)
			let folderVisibleAfterRefresh = true
			if (profileId) {
				await invalidateObjectQueriesForPrefix(queryClient, {
					profileId,
					bucket,
					changedPrefix: createdKey,
				})
				if (parentIsCurrent && !viewHideReason && !createdOutsideView) {
					const refreshed = await api.objects.listObjects({
						profileId,
						bucket,
						prefix: parentPrefixNormalized,
						delimiter: '/',
						maxKeys: 200,
					})
					folderVisibleAfterRefresh = Array.isArray(refreshed.commonPrefixes) && refreshed.commonPrefixes.includes(visiblePrefix)
				}
			}

			setNewFolderOpen(false)
			setNewFolderValues({ name: '', allowPath: false })
			setNewFolderPartialKey(null)

			const toastActionLabel = autoOpened ? 'Reopen' : 'Open'
			const toastAction = (
				<Button
					type="link"
					size="small"
					style={{ paddingInline: 4 }}
					onClick={() => {
						onOpenPrefix(createdKey)
					}}
				>
					{toastActionLabel}
				</Button>
			)
			if (!folderVisibleAfterRefresh) {
				message.warning({
					duration: 8,
					content: (
						<span>
							Folder create request completed, but the provider did not return it after refresh: <Typography.Text code>{createdKey}</Typography.Text>{' '}
							{toastAction}
						</span>
					),
				})
			} else {
				message.success({
					duration: 6,
					content: (
						<span>
							Folder created{autoOpened ? ' and opened' : ''}
							{viewHideLabel ? ` (${viewHideLabel})` : createdOutsideLabel ? ` (under ${createdOutsideLabel})` : ''}: <Typography.Text code>{createdKey}</Typography.Text>{' '}
							{toastAction}
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
			}
			const parentKey = normalizePrefix(newFolderParentPrefix) || '/'
			void refreshTreeNode(parentKey)
		},
		onError: (err, _values, context) => {
			if (context?.objectsQueryKey) {
				queryClient.setQueryData(context.objectsQueryKey, context.previousObjectsData)
			}
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
		setNewFolderValues({ name: '', allowPath: false })
	}, [])

	return {
		newFolderOpen,
		newFolderValues,
		setNewFolderValues,
		newFolderSubmitting: createFolderMutation.isPending,
		newFolderError,
		newFolderPartialKey,
		newFolderParentPrefix,
		openNewFolder,
		handleNewFolderSubmit,
		handleNewFolderCancel,
	}
}
