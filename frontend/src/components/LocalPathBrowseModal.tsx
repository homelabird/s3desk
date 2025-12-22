import { Alert, Button, Modal, Space, Spin, Tree, Typography } from 'antd'
import { FolderOutlined, ReloadOutlined } from '@ant-design/icons'
import type { DataNode, EventDataNode } from 'antd/es/tree'
import { useCallback, useEffect, useRef, useState } from 'react'

import { APIClient, APIError } from '../api/client'

type Props = {
	api: APIClient
	profileId: string | null
	open: boolean
	onCancel: () => void
	onSelect: (path: string) => void
	title?: string
}

export function LocalPathBrowseModal(props: Props) {
	const [treeData, setTreeData] = useState<DataNode[]>([])
	const loadedKeysRef = useRef<Set<string>>(new Set())
	const epochRef = useRef(0)
	const [loadingRoot, setLoadingRoot] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedPath, setSelectedPath] = useState<string | null>(null)

	const loadRoot = useCallback(async () => {
		if (!props.profileId) return
		const epoch = ++epochRef.current
		setLoadingRoot(true)
		setError(null)
		setSelectedPath(null)
		loadedKeysRef.current.clear()
		try {
			const resp = await props.api.listLocalEntries({ profileId: props.profileId })
			if (epochRef.current !== epoch) return

			const roots = (resp.entries ?? []).map((e): DataNode => ({
				key: e.path,
				title: (
					<Space size={8}>
						<FolderOutlined style={{ color: '#1677ff' }} />
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
	}, [props.api, props.profileId])

	useEffect(() => {
		if (!props.open) return
		void loadRoot()
	}, [loadRoot, props.open])

	const onLoadData = useCallback(
		async (node: EventDataNode<DataNode>) => {
			if (!props.profileId) return
			const key = String(node.key)
			if (!key) return
			if (loadedKeysRef.current.has(key)) return
			setError(null)
			loadedKeysRef.current.add(key)

			const epoch = epochRef.current
			try {
				const resp = await props.api.listLocalEntries({ profileId: props.profileId, path: key })
				if (epochRef.current !== epoch) return
				const children = (resp.entries ?? []).map((e): DataNode => ({
					key: e.path,
					title: (
						<Space size={8}>
							<FolderOutlined style={{ color: '#1677ff' }} />
							<Typography.Text>{e.name || e.path}</Typography.Text>
						</Space>
					),
					isLeaf: false,
				}))
				setTreeData((prev) => upsertTreeChildren(prev, key, children))
			} catch (err) {
				loadedKeysRef.current.delete(key)
				setError(formatErr(err))
			}
		},
		[props.api, props.profileId],
	)

	return (
		<Modal
			open={props.open}
			title={props.title ?? 'Browse local folders'}
			onCancel={props.onCancel}
			okText="Select folder"
			okButtonProps={{ disabled: !selectedPath }}
			onOk={() => {
				if (!selectedPath) return
				props.onSelect(selectedPath)
			}}
			destroyOnClose
		>
			{!props.profileId ? (
				<Alert type="warning" showIcon message="Select a profile first" />
			) : (
				<Space direction="vertical" size="small" style={{ width: '100%' }}>
					<Alert
						type="info"
						showIcon
						message="Only directories under ALLOWED_LOCAL_DIRS are shown"
						description="This selects a server-side destination path for jobs."
					/>

					{error ? <Alert type="error" showIcon message="Failed to list directories" description={error} /> : null}

					<Space style={{ width: '100%', justifyContent: 'space-between' }}>
						<Typography.Text type="secondary" ellipsis={{ tooltip: selectedPath ?? '' }} style={{ maxWidth: 520 }}>
							Selected: {selectedPath ?? '-'}
						</Typography.Text>
						<Button icon={<ReloadOutlined />} onClick={() => void loadRoot()} disabled={loadingRoot}>
							Reload
						</Button>
					</Space>

					<div style={{ height: 420, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}>
						{loadingRoot ? (
							<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
								<Spin />
							</div>
						) : treeData.length === 0 ? (
							<Typography.Text type="secondary">No directories.</Typography.Text>
						) : (
							<Tree.DirectoryTree
								blockNode
								showIcon={false}
								treeData={treeData}
								loadData={onLoadData}
								onSelect={(keys) => setSelectedPath(keys.length ? String(keys[0]) : null)}
							/>
						)}
					</div>
				</Space>
			)}
		</Modal>
	)
}

function upsertTreeChildren(nodes: DataNode[], targetKey: string, children: DataNode[]): DataNode[] {
	return nodes.map((node) => {
		if (String(node.key) === targetKey) {
			const nextChildren = children.length ? children : undefined
			return { ...node, children: nextChildren, isLeaf: children.length === 0 }
		}
		if (node.children && Array.isArray(node.children)) {
			return { ...node, children: upsertTreeChildren(node.children as DataNode[], targetKey, children) }
		}
		return node
	})
}

function formatErr(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}
