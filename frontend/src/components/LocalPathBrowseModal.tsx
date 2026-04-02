import { Alert, Button, Space, Spin, Typography } from 'antd'
import { FolderOutlined, ReloadOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useRef, useState } from 'react'

import { APIClient } from '../api/client'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import type { TreeNode } from '../lib/tree'
import { upsertTreeChildren } from '../lib/tree'
import { DialogModal } from './DialogModal'
import { SimpleTree } from './SimpleTree'

type Props = {
	api: APIClient
	profileId: string | null
	open: boolean
	onCancel: () => void
	onSelect: (path: string) => void
	title?: string
}

export function LocalPathBrowseModal(props: Props) {
	const { api, onCancel, onSelect, open, profileId, title } = props
	const [treeData, setTreeData] = useState<TreeNode[]>([])
	const [expandedKeys, setExpandedKeys] = useState<string[]>([])
	const [loadingKeys, setLoadingKeys] = useState<string[]>([])
	const loadedKeysRef = useRef<Set<string>>(new Set())
	const epochRef = useRef(0)
	const [loadingRoot, setLoadingRoot] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedPath, setSelectedPath] = useState<string | null>(null)

	const resetBrowseState = useCallback(() => {
		setTreeData([])
		setExpandedKeys([])
		setLoadingKeys([])
		setLoadingRoot(false)
		setError(null)
		setSelectedPath(null)
		loadedKeysRef.current.clear()
	}, [])

	const invalidateBrowseSession = useCallback(() => {
		epochRef.current += 1
	}, [])

	const loadRoot = useCallback(async () => {
		if (!profileId) return
		invalidateBrowseSession()
		const epoch = epochRef.current
		resetBrowseState()
		setLoadingRoot(true)
		try {
			const resp = await api.objects.listLocalEntries({ profileId })
			if (epochRef.current !== epoch) return

			const roots = (resp.entries ?? []).map((e): TreeNode => ({
				key: e.path,
				title: (
					<Space size={8}>
						<FolderOutlined style={{ color: 'var(--s3d-color-primary)' }} />
						<Typography.Text>{e.name || e.path}</Typography.Text>
						<Typography.Text type="secondary" ellipsis={{ tooltip: e.path }} style={{ maxWidth: 260 }}>
							{e.path}
						</Typography.Text>
					</Space>
				),
				isLeaf: false,
			}))
			setTreeData(roots)
		} catch (err) {
			if (epochRef.current !== epoch) return
			setError(formatErr(err))
			setTreeData([])
		} finally {
			if (epochRef.current === epoch) setLoadingRoot(false)
		}
	}, [api, invalidateBrowseSession, profileId, resetBrowseState])

	useEffect(() => {
		if (!open) return
		void loadRoot()
	}, [loadRoot, open])

	useEffect(() => {
		if (open && profileId) return
		invalidateBrowseSession()
		resetBrowseState()
	}, [invalidateBrowseSession, open, profileId, resetBrowseState])

	const onLoadData = useCallback(
		async (nodeKey: string) => {
			if (!profileId) return
			const key = String(nodeKey)
			if (!key) return
			if (loadedKeysRef.current.has(key)) return
			setError(null)
			loadedKeysRef.current.add(key)
			setLoadingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))

			const epoch = epochRef.current
			try {
				const resp = await api.objects.listLocalEntries({ profileId, path: key })
				if (epochRef.current !== epoch) return
				const children = (resp.entries ?? []).map((e): TreeNode => ({
					key: e.path,
					title: (
						<Space size={8}>
							<FolderOutlined style={{ color: 'var(--s3d-color-primary)' }} />
							<Typography.Text>{e.name || e.path}</Typography.Text>
						</Space>
					),
					isLeaf: false,
				}))
				setTreeData((prev) => upsertTreeChildren(prev, key, children))
				setLoadingKeys((prev) => prev.filter((k) => k !== key))
			} catch (err) {
				if (epochRef.current !== epoch) return
				loadedKeysRef.current.delete(key)
				setError(formatErr(err))
				setLoadingKeys((prev) => prev.filter((k) => k !== key))
			}
		},
		[api, profileId],
	)

	const handleCancel = useCallback(() => {
		invalidateBrowseSession()
		resetBrowseState()
		onCancel()
	}, [invalidateBrowseSession, onCancel, resetBrowseState])

	return (
			<DialogModal
			open={open}
			title={title ?? 'Browse local folders'}
			onClose={handleCancel}
			width={760}
			footer={
				<>
					<Button onClick={handleCancel}>Cancel</Button>
					<Button
							type="primary"
							disabled={!selectedPath}
							onClick={() => {
								if (!selectedPath) return
								onSelect(selectedPath)
							}}
						>
						Select folder
					</Button>
				</>
			}
		>
				{!profileId ? (
				<Alert type="warning" showIcon title="Select a profile first" />
			) : (
				<Space orientation="vertical" size="small" style={{ width: '100%' }}>
					<Alert
						type="info"
						showIcon
						title="Only directories under ALLOWED_LOCAL_DIRS are shown"
						description="This selects a server-side destination path for jobs."
					/>

					{error ? <Alert type="error" showIcon title="Failed to list directories" description={error} /> : null}

					<Space style={{ width: '100%', justifyContent: 'space-between' }}>
						<Typography.Text type="secondary" ellipsis={{ tooltip: selectedPath ?? '' }} style={{ maxWidth: 520 }}>
							Selected: {selectedPath ?? '-'}
						</Typography.Text>
						<Button icon={<ReloadOutlined />} onClick={() => void loadRoot()} disabled={loadingRoot}>
							Reload
						</Button>
					</Space>

					<div
						style={{
							height: 420,
							overflow: 'auto',
							border: '1px solid var(--s3d-color-border)',
							borderRadius: 8,
							padding: 8,
							background: 'var(--s3d-color-bg-elevated)',
						}}
					>
						{loadingRoot ? (
							<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
								<Spin />
							</div>
						) : treeData.length === 0 ? (
							<Typography.Text type="secondary">No directories.</Typography.Text>
						) : (
							<SimpleTree
								nodes={treeData}
								loadData={onLoadData}
								selectedKeys={selectedPath ? [selectedPath] : []}
								expandedKeys={expandedKeys}
								onExpandedKeysChange={setExpandedKeys}
								onSelectKey={(key) => setSelectedPath(key ? String(key) : null)}
								showIcon={false}
								loadingKeys={loadingKeys}
								indentPx={12}
							/>
						)}
					</div>
				</Space>
			)}
		</DialogModal>
	)
}
