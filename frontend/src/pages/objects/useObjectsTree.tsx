import { FolderOutlined } from '@ant-design/icons'
import { message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { APIClient } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { TreeNode } from '../../lib/tree'
import { upsertTreeChildren } from '../../lib/tree'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { folderLabelFromPrefix, treeAncestorKeys, treeKeyFromPrefix } from './objectsListUtils'

type LogFn = (
	enabled: boolean,
	level: 'debug' | 'warn',
	message: string,
	context?: Record<string, unknown>,
) => void

type UseObjectsTreeArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	prefix: string
	debugEnabled: boolean
	log: LogFn
}

export function useObjectsTree({ api, profileId, bucket, prefix, debugEnabled, log }: UseObjectsTreeArgs) {
	const [, setTreeExpandedByBucket] = useLocalStorageState<Record<string, string[]>>('objectsTreeExpandedByBucket', {})
	const [treeData, setTreeData] = useState<TreeNode[]>(() => [
		{ key: '/', title: '(root)', isLeaf: false, icon: <FolderOutlined style={{ color: '#1677ff' }} /> },
	])
	const [treeExpandedKeys, setTreeExpandedKeys] = useState<string[]>([])
	const [treeSelectedKeys, setTreeSelectedKeys] = useState<string[]>(['/'])
	const treeLoadedKeysRef = useRef<Set<string>>(new Set())
	const treeLoadingKeysRef = useRef<Set<string>>(new Set())
	const [treeLoadingKeys, setTreeLoadingKeys] = useState<string[]>([])
	const treeEpochRef = useRef(0)
	const [treeDrawerOpen, setTreeDrawerOpen] = useState(false)

	const loadTreeChildren = useCallback(
		async (nodeKey: string): Promise<void> => {
			if (!profileId || !bucket) return
			if (treeLoadedKeysRef.current.has(nodeKey)) return
			if (treeLoadingKeysRef.current.has(nodeKey)) return
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
					const resp = await api.listObjects({
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
				message.error(formatErr(err))
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
					icon: <FolderOutlined style={{ color: '#1677ff' }} />,
				}))

			setTreeData((prev) => upsertTreeChildren(prev, nodeKey, children))
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
		treeEpochRef.current++
		treeLoadedKeysRef.current.clear()
		treeLoadingKeysRef.current.clear()
		setTreeLoadingKeys([])
		setTreeExpandedKeys([])
		setTreeData([
			{ key: '/', title: bucket || '(root)', isLeaf: false, icon: <FolderOutlined style={{ color: '#1677ff' }} /> },
		])
	}, [bucket])

	useEffect(() => {
		if (!bucket) return
		if (treeExpandedKeys.length === 0) return
		setTreeExpandedByBucket((prev) => ({ ...prev, [bucket]: treeExpandedKeys }))
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
		treeLoadingKeys,
		treeDrawerOpen,
		setTreeDrawerOpen,
	}
}
