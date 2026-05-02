import { useCallback, useEffect, useRef, useState } from 'react'
import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query'

import type { APIClientShape } from '../../api/client'
import { queryKeys } from '../../api/queryKeys'
import type { ListObjectsResponse } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { ObjectTypeFilter } from './objectsTypes'
import type { NewFolderFormValues } from './objectsNewFolderRuntime'

type UseObjectsNewFolderArgs = {
	api: APIClientShape
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

type NewFolderMutationArgs = NewFolderFormValues & { sessionId: number }

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
	const currentScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const [newFolderOpen, setNewFolderOpen] = useState(false)
	const [newFolderValues, setNewFolderValues] = useState<NewFolderFormValues>({ name: '', allowPath: false })
	const [newFolderError, setNewFolderError] = useState<string | null>(null)
	const [newFolderPartialKey, setNewFolderPartialKey] = useState<string | null>(null)
	const [newFolderParentPrefix, setNewFolderParentPrefix] = useState('')
	const [newFolderStateScopeKey, setNewFolderStateScopeKey] = useState(currentScopeKey)
	const newFolderSessionRef = useRef(0)
	const newFolderScopeMatches = newFolderStateScopeKey === currentScopeKey

	const invalidateNewFolderSession = useCallback(() => {
		newFolderSessionRef.current += 1
	}, [])

	useEffect(() => {
		invalidateNewFolderSession()
	}, [apiToken, bucket, invalidateNewFolderSession, prefix, profileId])

	const openNewFolder = useCallback(
		(parentPrefixOverride?: string) => {
			if (!profileId || !bucket) return
			setNewFolderStateScopeKey(currentScopeKey)
			invalidateNewFolderSession()
			setNewFolderError(null)
			setNewFolderPartialKey(null)
			setNewFolderOpen(true)
			const p = typeof parentPrefixOverride === 'string' ? parentPrefixOverride : prefix
			setNewFolderParentPrefix(p === '/' ? '' : p)
			setNewFolderValues({ name: '', allowPath: false })
		},
		[bucket, currentScopeKey, invalidateNewFolderSession, prefix, profileId],
	)

	const createFolderMutation = useMutation({
		mutationFn: async (args: NewFolderMutationArgs) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			const runtime = await import('./objectsNewFolderRuntime')
			return runtime.createFolderPath({
				api,
				profileId,
				bucket,
				parentPrefix: newFolderParentPrefix,
				values: args,
			})
		},
		onMutate: async (values: NewFolderMutationArgs) => {
			if (!profileId || !bucket) return null

			const [runtime, queryCache] = await Promise.all([
				import('./objectsNewFolderRuntime'),
				import('./objectsQueryCache'),
			])
			const plan = runtime.buildCreateFolderPlan(values, newFolderParentPrefix)
			if (plan.parentPrefix !== runtime.normalizeNewFolderPrefix(prefix)) return null
			const objectsQueryKey = queryKeys.objects.list(profileId, bucket, prefix, apiToken)
			await queryClient.cancelQueries({ queryKey: objectsQueryKey, exact: true })
			const previous = queryClient.getQueryData<InfiniteData<ListObjectsResponse, string | undefined>>(objectsQueryKey)
			queryClient.setQueryData<InfiniteData<ListObjectsResponse, string | undefined> | undefined>(objectsQueryKey, (data) =>
				queryCache.insertOptimisticPrefixIntoObjectsData(data, plan.visiblePrefix),
			)

			return {
				sessionId: values.sessionId,
				objectsQueryKey,
				previousObjectsData: previous,
			}
		},
		onSuccess: async (resp: { key: string }, _values, context) => {
			if (context?.sessionId !== newFolderSessionRef.current) {
				if (context?.objectsQueryKey) {
					await queryClient.invalidateQueries({
						queryKey: context.objectsQueryKey,
						exact: true,
					})
				}
				return
			}
			const createdKey = resp.key
			const runtime = await import('./objectsNewFolderRuntime')
			const visibility = runtime.buildNewFolderVisibilityOutcome({
				createdKey,
				parentPrefix: newFolderParentPrefix,
				currentPrefix: prefix,
				typeFilter,
				favoritesOnly,
				searchText,
			})
			if (visibility.autoOpened) {
				onOpenPrefix(createdKey)
			}

			let folderVisibleAfterRefresh = true
			if (profileId) {
				const queryCache = await import('./objectsQueryCache')
				await queryCache.invalidateObjectQueriesForPrefix(queryClient, {
					profileId,
					bucket,
					changedPrefix: createdKey,
					apiToken,
				})
				if (visibility.shouldVerifyVisibleAfterRefresh) {
					const refreshed = await api.objects.listObjects({
						profileId,
						bucket,
						prefix: visibility.parentPrefixNormalized,
						delimiter: '/',
						maxKeys: 200,
					})
					folderVisibleAfterRefresh = Array.isArray(refreshed.commonPrefixes) && refreshed.commonPrefixes.includes(visibility.visiblePrefix)
				}
			}

			setNewFolderStateScopeKey(currentScopeKey)
			setNewFolderOpen(false)
			setNewFolderValues({ name: '', allowPath: false })
			setNewFolderPartialKey(null)

			const feedback = await import('./objectsNewFolderFeedback')
			if (!folderVisibleAfterRefresh) {
				feedback.showNewFolderVisibilityWarning({
					createdKey,
					onOpenPrefix,
				})
			} else {
				feedback.showNewFolderCreatedFeedback({
					autoOpened: visibility.autoOpened,
					createdKey,
					createdOutsideLabel: visibility.createdOutsideLabel,
					createdOutsideView: visibility.createdOutsideView,
					onClearSearch,
					onDisableFavoritesOnly,
					onOpenPrefix,
					onShowFolders,
					parentPrefix: newFolderParentPrefix,
					viewHideLabel: visibility.viewHideLabel,
					viewHideReason: visibility.viewHideReason,
				})
			}
			void refreshTreeNode(visibility.parentTreeKey)
		},
		onError: (err, _values, context) => {
			if (context?.objectsQueryKey) {
				queryClient.setQueryData(context.objectsQueryKey, context.previousObjectsData)
			}
			if (context?.sessionId !== newFolderSessionRef.current) return
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
			if (!newFolderScopeMatches) return
			setNewFolderError(null)
			setNewFolderPartialKey(null)
			createFolderMutation.mutate({
				...values,
				sessionId: newFolderSessionRef.current,
			})
		},
		[createFolderMutation, newFolderScopeMatches],
	)

	const handleNewFolderCancel = useCallback(() => {
		setNewFolderStateScopeKey(currentScopeKey)
		invalidateNewFolderSession()
		setNewFolderOpen(false)
		setNewFolderError(null)
		setNewFolderPartialKey(null)
		setNewFolderValues({ name: '', allowPath: false })
	}, [currentScopeKey, invalidateNewFolderSession])

	return {
		newFolderOpen: newFolderScopeMatches ? newFolderOpen : false,
		newFolderValues: newFolderScopeMatches ? newFolderValues : { name: '', allowPath: false },
		setNewFolderValues,
		newFolderSubmitting: createFolderMutation.isPending,
		newFolderError: newFolderScopeMatches ? newFolderError : null,
		newFolderPartialKey: newFolderScopeMatches ? newFolderPartialKey : null,
		newFolderParentPrefix: newFolderScopeMatches ? newFolderParentPrefix : '',
		openNewFolder,
		handleNewFolderSubmit,
		handleNewFolderCancel,
	}
}
