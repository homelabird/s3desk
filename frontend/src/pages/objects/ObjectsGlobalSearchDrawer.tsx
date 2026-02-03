import { Alert, Button, DatePicker, Divider, Drawer, Empty, Input, InputNumber, Select, Space, Spin, Switch, Table, Typography } from 'antd'
import { CopyOutlined, DownloadOutlined, InfoCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'

import type { ObjectItem } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'

type ObjectsGlobalSearchDrawerProps = {
	open: boolean
	onClose: () => void
	hasProfile: boolean
	hasBucket: boolean
	bucket: string
	currentPrefix: string
	isMd: boolean
	queryDraft: string
	onQueryDraftChange: (value: string) => void
	prefixFilter: string
	onPrefixFilterChange: (value: string) => void
	limit: number
	onLimitChange: (value: number) => void
	extFilter: string
	onExtFilterChange: (value: string) => void
	minSizeBytes: number | null
	maxSizeBytes: number | null
	onMinSizeBytesChange: (value: number | null) => void
	onMaxSizeBytesChange: (value: number | null) => void
	modifiedAfterMs: number | null
	modifiedBeforeMs: number | null
	onModifiedRangeChange: (startMs: number | null, endMs: number | null) => void
	onReset: () => void
	onRefresh: () => void
	isRefreshing: boolean
	isError: boolean
	isNotIndexed: boolean
	errorMessage: string
	onCreateIndexJob: () => void
	isCreatingIndexJob: boolean
	indexPrefix: string
	onIndexPrefixChange: (value: string) => void
	indexFullReindex: boolean
	onIndexFullReindexChange: (value: boolean) => void
	searchQueryText: string
	isFetching: boolean
	hasNextPage: boolean
	isFetchingNextPage: boolean
	items: ObjectItem[]
	onLoadMore: () => void
	onUseCurrentPrefix: () => void
	onOpenPrefixForKey: (key: string) => void
	onCopyKey: (key: string) => void
	onDownloadKey: (key: string, size?: number) => void
	onOpenDetails: (key: string) => void
}

const mbFromBytes = (value: number | null) => {
	if (value == null || !Number.isFinite(value)) return null
	return Math.round((value / (1024 * 1024)) * 100) / 100
}

const bytesFromMb = (value: number | null) => {
	if (value == null || !Number.isFinite(value)) return null
	return Math.max(0, Math.round(value * 1024 * 1024))
}

const toDayjs = (value: number | null): Dayjs | null => {
	if (value == null || !Number.isFinite(value)) return null
	return dayjs(value)
}

export function ObjectsGlobalSearchDrawer(props: ObjectsGlobalSearchDrawerProps) {
	const drawerWidth = props.isMd ? 920 : '100%'
	const inputWidth = props.isMd ? 360 : '100%'
	const prefixWidth = props.isMd ? 260 : '100%'
	const limitWidth = props.isMd ? 140 : '100%'
	const extWidth = props.isMd ? 160 : '100%'
	const sizeWidth = props.isMd ? 160 : '100%'
	const dateWidth = props.isMd ? 320 : '100%'
	const tableKeyWidth = props.isMd ? 520 : 260
	const tableScrollY = props.isMd ? 520 : undefined
	const dateRange: [Dayjs | null, Dayjs | null] = [toDayjs(props.modifiedAfterMs), toDayjs(props.modifiedBeforeMs)]

	return (
		<Drawer open={props.open} onClose={props.onClose} width={drawerWidth} title="Global Search (Indexed)" destroyOnHidden>
			{!props.hasProfile ? (
				<Alert type="warning" showIcon title="Select a profile first" />
			) : !props.hasBucket ? (
				<Alert type="warning" showIcon title="Select a bucket first" />
			) : (
				<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
						<Space wrap>
							<Input
								allowClear
								prefix={<SearchOutlined />}
								placeholder="Search query (substring)…"
								aria-label="Search query"
								style={{ width: inputWidth, maxWidth: '100%' }}
								value={props.queryDraft}
								onChange={(e) => props.onQueryDraftChange(e.target.value)}
							/>
							<Input
								allowClear
								placeholder="Prefix filter (optional)…"
								aria-label="Prefix filter"
								style={{ width: prefixWidth, maxWidth: '100%' }}
								value={props.prefixFilter}
								onChange={(e) => props.onPrefixFilterChange(e.target.value)}
							/>
						<Select
							value={props.limit}
							style={{ width: limitWidth, maxWidth: '100%' }}
							aria-label="Result limit"
							options={[
								{ label: 'Limit 50', value: 50 },
								{ label: 'Limit 100', value: 100 },
								{ label: 'Limit 200', value: 200 },
							]}
							onChange={(value) => props.onLimitChange(Number(value))}
						/>
						<Button icon={<ReloadOutlined />} onClick={props.onRefresh} loading={props.isRefreshing}>
							Refresh
						</Button>
						<Button onClick={props.onReset}>Reset</Button>
					</Space>

					<Space orientation="vertical" size="small" style={{ width: '100%' }}>
						<Typography.Text type="secondary">Filters</Typography.Text>
						<Space wrap>
							<Input
								allowClear
								placeholder="Ext (e.g. log)…"
								aria-label="Extension filter"
								style={{ width: extWidth, maxWidth: '100%' }}
								value={props.extFilter}
								onChange={(e) => props.onExtFilterChange(e.target.value)}
							/>
							<InputNumber
								min={0}
								step={0.1}
								placeholder="Min MB…"
								aria-label="Minimum size (MB)"
								style={{ width: sizeWidth, maxWidth: '100%' }}
								value={mbFromBytes(props.minSizeBytes)}
								onChange={(value) => props.onMinSizeBytesChange(bytesFromMb(typeof value === 'number' ? value : null))}
							/>
							<InputNumber
								min={0}
								step={0.1}
								placeholder="Max MB…"
								aria-label="Maximum size (MB)"
								style={{ width: sizeWidth, maxWidth: '100%' }}
								value={mbFromBytes(props.maxSizeBytes)}
								onChange={(value) => props.onMaxSizeBytesChange(bytesFromMb(typeof value === 'number' ? value : null))}
							/>
							<DatePicker.RangePicker
								allowClear
								aria-label="Modified date range"
								style={{ width: dateWidth, maxWidth: '100%' }}
								value={dateRange}
								onChange={(values) => {
									const start = values?.[0] ?? null
									const end = values?.[1] ?? null
									const startMs = start ? start.startOf('day').valueOf() : null
									const endMs = end ? end.endOf('day').valueOf() : null
									props.onModifiedRangeChange(startMs, endMs)
								}}
							/>
						</Space>
					</Space>

					{props.isError ? (
						props.isNotIndexed ? (
							<Alert
								type="info"
								showIcon
								title="Index not found"
								description="Create an s3_index_objects job first, then search again."
								action={
									<Button type="primary" size="small" onClick={props.onCreateIndexJob} loading={props.isCreatingIndexJob}>
										Index bucket
									</Button>
								}
							/>
						) : (
							<Alert type="error" showIcon title="Search failed" description={props.errorMessage} />
						)
					) : null}

					<Divider style={{ marginBlock: 4 }} />

					<Space orientation="vertical" size="small" style={{ width: '100%' }}>
						<Typography.Text type="secondary">
							Build/rebuild the index for <Typography.Text code>{props.bucket}</Typography.Text>:
						</Typography.Text>
						<Space wrap>
							<Input
								allowClear
								placeholder="Index prefix (optional)…"
								aria-label="Index prefix"
								style={{ width: inputWidth, maxWidth: '100%' }}
								value={props.indexPrefix}
								onChange={(e) => props.onIndexPrefixChange(e.target.value)}
							/>
							<Button size="small" onClick={props.onUseCurrentPrefix} disabled={!props.currentPrefix.trim()}>
								Use current prefix
							</Button>
							<Space>
								<Typography.Text type="secondary">Full reindex</Typography.Text>
								<Switch
									checked={props.indexFullReindex}
									onChange={(value) => props.onIndexFullReindexChange(value)}
									aria-label="Full reindex"
								/>
							</Space>
							<Button type="primary" onClick={props.onCreateIndexJob} loading={props.isCreatingIndexJob}>
								Create index job
							</Button>
						</Space>
					</Space>

					<Divider style={{ marginBlock: 8 }} />

					{!props.searchQueryText ? (
						<Empty description="Type a query to search" />
					) : props.isFetching && props.items.length === 0 ? (
						<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
							<Spin />
						</div>
					) : props.items.length === 0 ? (
						<Empty description="No results" />
					) : (
						<>
							<Typography.Text type="secondary">
								{props.items.length} result(s)
								{props.hasNextPage ? ' (more available)' : ''}
							</Typography.Text>
							<Table
								size="small"
								rowKey="key"
								dataSource={props.items}
								pagination={false}
								scroll={{ x: true, y: tableScrollY }}
								columns={[
									{
										title: 'Key',
										dataIndex: 'key',
										render: (key: string) => (
											<Typography.Text code ellipsis={{ tooltip: key }} style={{ maxWidth: tableKeyWidth, display: 'inline-block' }}>
												{key}
											</Typography.Text>
										),
									},
									{
										title: 'Size',
										dataIndex: 'size',
										width: 120,
										render: (value: number) => (typeof value === 'number' && value >= 0 ? formatBytes(value) : '-'),
									},
									{
										title: 'Last modified',
										dataIndex: 'lastModified',
										width: 220,
										render: (value: string) =>
											value ? (
												<Typography.Text code title={value}>
													{formatDateTime(value)}
												</Typography.Text>
											) : (
												<Typography.Text type="secondary">-</Typography.Text>
											),
									},
									{
										title: 'Actions',
										width: 260,
										render: (_: unknown, row: ObjectItem) => (
											<Space size="small">
												<Button size="small" onClick={() => props.onOpenPrefixForKey(row.key)}>
													Open
												</Button>
												<Button
													size="small"
													icon={<CopyOutlined />}
													aria-label="Copy key"
													onClick={() => props.onCopyKey(row.key)}
												/>
												<Button
													size="small"
													icon={<DownloadOutlined />}
													aria-label="Download"
													onClick={() => props.onDownloadKey(row.key, row.size)}
												/>
												<Button
													size="small"
													icon={<InfoCircleOutlined />}
													aria-label="Open details"
													onClick={() => props.onOpenDetails(row.key)}
												/>
											</Space>
										),
									},
								]}
							/>
							<div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
								<Button onClick={props.onLoadMore} disabled={!props.hasNextPage} loading={props.isFetchingNextPage}>
									Load more
								</Button>
							</div>
						</>
					)}
				</Space>
			)}
		</Drawer>
	)
}
