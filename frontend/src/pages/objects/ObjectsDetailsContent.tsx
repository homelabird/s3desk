import { Alert, Button, Descriptions, Divider, Empty, Space, Spin, Typography } from 'antd'
import { CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, LinkOutlined, ReloadOutlined, SnippetsOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'

import type { ObjectMeta } from '../../api/types'
import type { ObjectPreview } from './objectsTypes'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'

export type ObjectsDetailsContentProps = {
	hasProfile: boolean
	hasBucket: boolean
	isAdvanced: boolean
	selectedCount: number
	detailsKey: string | null
	detailsMeta: ObjectMeta | null
	fallbackSize?: number
	isMetaFetching: boolean
	isMetaError: boolean
	metaErrorMessage: string
	onRetryMeta: () => void
	onCopyKey: () => void
	onDownload: () => void
	onPresign: () => void
	isPresignLoading: boolean
	onCopyMove: (mode: 'copy' | 'move') => void
	onDelete: () => void
	isDeleteLoading: boolean
	thumbnail?: ReactNode
	preview: ObjectPreview | null
	onLoadPreview: () => void
	onCancelPreview: () => void
	canCancelPreview: boolean
}

export function ObjectsDetailsContent(props: ObjectsDetailsContentProps) {
	if (!props.hasProfile) {
		return <Typography.Text type="secondary">Select a profile first.</Typography.Text>
	}
	if (!props.hasBucket) {
		return <Typography.Text type="secondary">Select a bucket first.</Typography.Text>
	}
	if (props.selectedCount === 0) {
		return <Empty description="Select an object to see details" />
	}
	if (props.selectedCount > 1) {
		return (
			<Space direction="vertical" size="small" style={{ width: '100%' }}>
				<Typography.Text strong>{props.selectedCount} selected</Typography.Text>
				<Typography.Text type="secondary">Use the selection bar for bulk actions.</Typography.Text>
			</Space>
		)
	}
	if (!props.detailsKey) {
		return <Typography.Text type="secondary">Select an object to load metadata.</Typography.Text>
	}

	return (
		<Space direction="vertical" size="middle" style={{ width: '100%' }}>
			<Space wrap>
				<Button size="small" icon={<CopyOutlined />} onClick={props.onCopyKey}>
					Copy key
				</Button>
				<Button size="small" icon={<DownloadOutlined />} onClick={props.onDownload}>
					Download (client)
				</Button>
				<Button size="small" icon={<LinkOutlined />} onClick={props.onPresign} loading={props.isPresignLoading}>
					URL
				</Button>
				{props.isAdvanced ? (
					<>
						<Button size="small" icon={<SnippetsOutlined />} onClick={() => props.onCopyMove('copy')}>
							Copy
						</Button>
						<Button size="small" icon={<EditOutlined />} onClick={() => props.onCopyMove('move')}>
							Move
						</Button>
					</>
				) : null}
				<Button size="small" danger icon={<DeleteOutlined />} onClick={props.onDelete} loading={props.isDeleteLoading}>
					Delete
				</Button>
			</Space>

			{props.isMetaFetching && !props.detailsMeta ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
					<Spin />
				</div>
			) : props.isMetaError ? (
				<Alert
					type="error"
					showIcon
					message="Failed to load metadata"
					description={props.metaErrorMessage}
					action={
						<Button size="small" onClick={props.onRetryMeta} disabled={!props.detailsKey}>
							Retry
						</Button>
					}
				/>
			) : props.detailsMeta ? (
				<>
					<Descriptions size="small" bordered column={1}>
						<Descriptions.Item label="Key">
							<Typography.Text code>{props.detailsMeta.key}</Typography.Text>
						</Descriptions.Item>
						<Descriptions.Item label="Size">
							{typeof props.detailsMeta.size === 'number' && Number.isFinite(props.detailsMeta.size) ? (
								formatBytes(props.detailsMeta.size)
							) : (
								<Typography.Text type="secondary">-</Typography.Text>
							)}
						</Descriptions.Item>
						<Descriptions.Item label="ETag">
							{props.detailsMeta.etag ? (
								<Typography.Text code>{props.detailsMeta.etag}</Typography.Text>
							) : (
								<Typography.Text type="secondary">-</Typography.Text>
							)}
						</Descriptions.Item>
						<Descriptions.Item label="Last Modified">
							{props.detailsMeta.lastModified ? (
								<Typography.Text code>{formatDateTime(props.detailsMeta.lastModified)}</Typography.Text>
							) : (
								<Typography.Text type="secondary">-</Typography.Text>
							)}
						</Descriptions.Item>
						<Descriptions.Item label="Content Type">
							{props.detailsMeta.contentType ? (
								<Typography.Text code>{props.detailsMeta.contentType}</Typography.Text>
							) : (
								<Typography.Text type="secondary">-</Typography.Text>
							)}
						</Descriptions.Item>
					</Descriptions>

					{props.detailsMeta.metadata && Object.keys(props.detailsMeta.metadata).length ? (
						<Descriptions size="small" bordered column={1} title="Metadata">
							{Object.entries(props.detailsMeta.metadata).map(([k, v]) => (
								<Descriptions.Item key={k} label={k}>
									<Typography.Text code>{v}</Typography.Text>
								</Descriptions.Item>
							))}
						</Descriptions>
					) : (
						<Typography.Text type="secondary">No user metadata</Typography.Text>
					)}

					{props.thumbnail ? (
						<Space direction="vertical" size="small" style={{ width: '100%' }}>
							<Typography.Text strong>Thumbnail</Typography.Text>
							<div style={{ display: 'flex', justifyContent: 'center' }}>{props.thumbnail}</div>
						</Space>
					) : null}

					<Divider style={{ marginBlock: 8 }} />

					<Space direction="vertical" size="small" style={{ width: '100%' }}>
						<Space style={{ width: '100%', justifyContent: 'space-between' }}>
							<Typography.Text strong>Preview</Typography.Text>
							<Space>
								{props.preview?.status === 'loading' ? (
									<Button size="small" onClick={props.onCancelPreview} disabled={!props.canCancelPreview}>
										Cancel
									</Button>
								) : null}
								<Button size="small" icon={<ReloadOutlined />} onClick={props.onLoadPreview} disabled={!props.detailsMeta}>
									{props.preview ? 'Reload' : 'Load'}
								</Button>
							</Space>
						</Space>

						{props.preview?.status === 'loading' ? (
							<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
								<Spin />
							</div>
						) : props.preview?.status === 'error' ? (
							<Alert type="error" showIcon message="Preview failed" description={props.preview.error ?? 'unknown error'} />
						) : props.preview?.status === 'unsupported' ? (
							<Empty description="Preview not available for this type" />
						) : props.preview?.status === 'ready' && props.preview.kind === 'image' && props.preview.url ? (
							<div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 8, background: '#fafafa' }}>
								<img
									src={props.preview.url}
									alt={props.detailsKey}
									style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain', display: 'block', marginInline: 'auto' }}
								/>
							</div>
						) : props.preview?.status === 'ready' && (props.preview.kind === 'text' || props.preview.kind === 'json') ? (
							<div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 8, background: '#fafafa', maxHeight: 360, overflow: 'auto' }}>
								<pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
									{props.preview.text}
									{props.preview.truncated ? '\n\n…(truncated)…' : ''}
								</pre>
							</div>
						) : (
							<Typography.Text type="secondary">Click “Load” to fetch a larger preview.</Typography.Text>
						)}
					</Space>
				</>
			) : (
				<Typography.Text type="secondary">Select an object to load metadata.</Typography.Text>
			)}
		</Space>
	)
}

// formatDateTime lives in ../../lib/format
