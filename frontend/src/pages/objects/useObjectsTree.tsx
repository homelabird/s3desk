import { FolderOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'

import type { APIClientShape } from '../../api/client'
import { legacyProfileScopedStorageKeys, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import type { TreeNode } from '../../lib/tree'
import { upsertTreeChildren } from '../../lib/tree'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { objectsFeedback } from './objectsFeedback'
import { folderLabelFromPrefix, treeAncestorKeys, treeKeyFromPrefix } from './objectsListUtils'

type LogFn = (
	enabled: boolean,
	level: 'debug' | 'warn',
	message: string,
	context?: Record<string, unknown>,
) => void

type UseObjectsTreeArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	debugEnabled: boolean
	log: LogFn
}

export function useObjectsTree({ api, apiToken, profileId, bucket, prefix, debugEnabled, log }: UseObjectsTreeArgs) {
	const [treeExpandedByBucket, setTreeExpandedByBucket] = useLocalStorageState<Record<string, string[]>>(
		profileScopedStorageKey('objects', apiToken, profileId, 'treeExpandedByBucket'),
		{},
		{
			legacyLocalStorageKey: 'objectsTreeExpandedByBucket',
			legacyLocalStorageKeys: legacyProfileScopedStorageKeys('objects', apiToken, profileId, 'treeExpandedByBucket'),
		},
	)
	const [treeData, setTreeData] = useState<TreeNode[]>(() => [
		{ key: '/', title: '(root)', isLeaf: false, icon: <FolderOutlined style={{ color: 'var(--s3d-color-primary)' }} /> },
	])
	const [treeExpandedKeys, setTreeExpandedKeys] = useState<string[]>([])
	const [treeSelectedKeys, setTreeSelectedKeys] = useState<string[]>(['/'])
	const treeLoadedKeysRef = useRef<Set<string>>(new Set())
	const treeLoadingKeysRef = useRef<Set<string>>(new Set())
	const lastTreeScopeKeyRef = useRef<string | null>(null)
	const [treeLoadingKeys, setTreeLoadingKeys] = useState<string[]>([])
	const [treeErrorMessage, setTreeErrorMessage] = useState<string | null>(null)
	const treeEpochRef = useRef(0)
	const [treeDrawerOpen, setTreeDrawerOpen] = useState(false)
	const [treeDrawerScopeKey, setTreeDrawerScopeKey] = useState('')
	const treeScopeKey = `${apiToken || '__no_server__'}:${profileId?.trim() || '__no_profile__'}:${bucket}`
	const treeDrawerOpenVisible = treeDrawerOpen && treeDrawerScopeKey === treeScopeKey

	const setScopedTreeDrawerOpen = useCallback(
		(next: SetStateAction<boolean>) => {
			const nextOpen = typeof next === 'function' ? next(treeDrawerOpenVisible) : next
			setTreeDrawerOpen(nextOpen)
			setTreeDrawerScopeKey(nextOpen ? treeScopeKey : '')
		},
		[treeDrawerOpenVisible, treeScopeKey],
	)

	const loadTreeChildren = useCallback(
		async (nodeKey: string): Promise<void> => {
			if (!profileId || !bucket) return
			if (treeLoadedKeysRef.current.has(nodeKey)) return
			if (treeLoadingKeysRef.current.has(nodeKey)) return
			setTreeErrorMessage(null)
			treeLoadingKeysRef.current.add(nodeKey)
			setTreeLoadingKeys((prev) => (prev.includes(nodeKey) ? prev : [...prev, nodeKey]))

			const epoch = treeEpochRef.current
			const prefixesSet = new Set<string>()
			const seenTokens = new Set<string>()
			let token: string | undefined
			let pageCount = 0

			try {
				for (;;) {
					pageCount += 1
					if (pageCount > 10000) {
						log(debugEnabled, 'warn', 'Tree listing exceeded page cap; stopping pagination', {
							bucket,
							prefix: nodeKey,
						})
						break
					}
					const resp = await api.objects.listObjects({
						profileId,
						bucket,
						prefix: nodeKey === '/' ? undefined : nodeKey,
						delimiter: '/',
						maxKeys: 1000,
						continuationToken: token,
					})
					if (token) {
						seenTokens.add(token)
					}
					const commonPrefixes = Array.isArray(resp.commonPrefixes) ? resp.commonPrefixes : []
					for (const p of commonPrefixes) prefixesSet.add(p)
					const pageEmpty = commonPrefixes.length === 0 && resp.items.length === 0
					if (!resp.isTruncated) break
					const nextToken = resp.nextContinuationToken ?? undefined
					if (pageEmpty) {
						log(debugEnabled, 'warn', 'Tree listing returned empty page; stopping pagination', {
							bucket,
							prefix: nodeKey,
							nextToken,
						})
						break
					}
					if (!nextToken) {
						log(debugEnabled, 'warn', 'Tree listing missing continuation token; stopping pagination', {
							bucket,
							prefix: nodeKey,
						})
						break
					}
					if (seenTokens.has(nextToken)) {
						log(debugEnabled, 'warn', 'Tree listing repeated continuation token; stopping pagination', {
							bucket,
							prefix: nodeKey,
							nextToken,
						})
						break
					}
					token = nextToken
				}
			} catch (err) {
				const nextErrorMessage = objectsFeedback.errorMessage(err)
				setTreeErrorMessage(nextErrorMessage)
				treeLoadingKeysRef.current.delete(nodeKey)
				setTreeLoadingKeys((prev) => prev.filter((k) => k !== nodeKey))
				return
			}

			if (treeEpochRef.current !== epoch) {
				treeLoadingKeysRef.current.delete(nodeKey)
				setTreeLoadingKeys((prev) => prev.filter((k) => k !== nodeKey))
				return
			}

			const children: TreeNode[] = Array.from(prefixesSet)
				.sort((a, b) => a.localeCompare(b))
				.map((p) => ({
					key: p,
					title: folderLabelFromPrefix(p),
					isLeaf: false,
					icon: <FolderOutlined style={{ color: 'var(--s3d-color-primary)' }} />,
				}))

			setTreeData((prev) => upsertTreeChildren(prev, nodeKey, children))
			setTreeErrorMessage(null)
			treeLoadedKeysRef.current.add(nodeKey)
			treeLoadingKeysRef.current.delete(nodeKey)
			setTreeLoadingKeys((prev) => prev.filter((k) => k !== nodeKey))
		},
		[api, bucket, debugEnabled, log, profileId],
	)

	const onTreeLoadData = useCallback(async (nodeKey: string) => {
		await loadTreeChildren(String(nodeKey))
	}, [loadTreeChildren])

	const refreshTreeNode = useCallback(
		async (nodeKey: string) => {
			treeLoadedKeysRef.current.delete(nodeKey)
			await loadTreeChildren(nodeKey)
		},
		[loadTreeChildren],
	)

	useEffect(() => {
		if (lastTreeScopeKeyRef.current === treeScopeKey) return
		lastTreeScopeKeyRef.current = treeScopeKey
		treeEpochRef.current++
		treeLoadedKeysRef.current.clear()
		treeLoadingKeysRef.current.clear()
		setTreeLoadingKeys([])
		setTreeErrorMessage(null)
		setTreeExpandedKeys(bucket ? [...(treeExpandedByBucket[bucket] ?? [])] : [])
		setTreeData([
			{ key: '/', title: bucket || '(root)', isLeaf: false, icon: <FolderOutlined style={{ color: 'var(--s3d-color-primary)' }} /> },
		])
	}, [apiToken, bucket, profileId, treeExpandedByBucket, treeScopeKey])

	useEffect(() => {
		if (!bucket) return
		setTreeExpandedByBucket((prev) => {
			const next = { ...prev }
			if (treeExpandedKeys.length === 0) {
				delete next[bucket]
				return next
			}
			next[bucket] = [...treeExpandedKeys]
			return next
		})
	}, [bucket, setTreeExpandedByBucket, treeExpandedKeys])

	useEffect(() => {
		const key = treeKeyFromPrefix(prefix)
		setTreeSelectedKeys([key])
		if (treeLoadedKeysRef.current.size === 0) return
		const ancestors = treeAncestorKeys(key)
		setTreeExpandedKeys((prev) => {
			const next = new Set(prev)
			for (const k of ancestors) next.add(k)
			return Array.from(next)
		})
	}, [prefix])

	return {
		treeData,
		treeExpandedKeys,
		setTreeExpandedKeys,
		treeSelectedKeys,
		setTreeSelectedKeys,
		onTreeLoadData,
		refreshTreeNode,
		treeErrorMessage,
		treeLoadingKeys,
		treeDrawerOpen: treeDrawerOpenVisible,
		setTreeDrawerOpen: setScopedTreeDrawerOpen,
	}
}
