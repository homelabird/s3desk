import { InfoCircleOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import {
	Alert,
	Button,
	Descriptions,
	Form,
	Input,
	InputNumber,
	message,
	Space,
	Spin,
	Switch,
	Tag,
	Collapse,
	Tooltip,
	Typography,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
	APIClient,
	DEFAULT_RETRY_COUNT,
	DEFAULT_RETRY_DELAY_MS,
	RETRY_COUNT_MAX,
	RETRY_COUNT_MIN,
	RETRY_COUNT_STORAGE_KEY,
	RETRY_DELAY_MAX_MS,
	RETRY_DELAY_MIN_MS,
	RETRY_DELAY_STORAGE_KEY,
} from '../api/client'
import { getApiBaseUrl, stripApiBaseSuffix } from '../api/baseUrl'
import { AppTabs } from '../components/AppTabs'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { formatTime } from '../lib/format'
import { clearNetworkLog, getNetworkLog, subscribeNetworkLog, type NetworkLogEvent } from '../lib/networkStatus'
import { MOVE_CLEANUP_FILENAME_MAX_LEN, MOVE_CLEANUP_FILENAME_TEMPLATE } from '../lib/moveCleanupDefaults'
import {
	OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
	OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MAX_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MIN_HOURS,
} from '../lib/objectIndexing'
import {
	THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	THUMBNAIL_CACHE_MAX_ENTRIES,
	THUMBNAIL_CACHE_MIN_ENTRIES,
} from '../lib/thumbnailCache'
import { useLocalStorageState } from '../lib/useLocalStorageState'

type Props = {
	apiToken: string
	setApiToken: (v: string) => void
	profileId: string | null
	setProfileId: (v: string | null) => void
}

const RESETTABLE_UI_STATE_KEYS = [
	// Global navigation-ish state
	'bucket',
	'prefix',
	'uploadPrefix',
	'uploadBatchConcurrency',
	'uploadBatchBytesMiB',
	'uploadChunkSizeMiB',
	'uploadChunkConcurrency',
	'uploadChunkThresholdMiB',
	'uploadChunkFileConcurrency',
	'uploadAutoTuneEnabled',
	'uploadResumeConversionEnabled',

	// Jobs
	'jobsFollowLogs',
	'jobsStatusFilter',
	'jobsTypeFilter',
	'jobsErrorCodeFilter',
	'jobsColumnVisibility',

	// Objects: views/filters/layout
	'objectsTabs',
	'objectsActiveTabId',
	'objectsRecentPrefixesByBucket',
	'objectsBookmarksByBucket',
	'objectsUIMode',
	'objectsPrefixByBucket',
	'objectsSearch',
	'objectsGlobalSearch',
	'objectsGlobalSearchPrefix',
	'objectsGlobalSearchLimit',
	'objectsGlobalSearchExt',
	'objectsGlobalSearchMinSize',
	'objectsGlobalSearchMaxSize',
	'objectsGlobalSearchMinModifiedMs',
	'objectsGlobalSearchMaxModifiedMs',
	'objectsTypeFilter',
	'objectsFavoritesOnly',
	'objectsFavoritesFirst',
	'objectsFavoritesSearch',
	'objectsFavoritesOpenDetails',
	'objectsExtFilter',
	'objectsMinSize',
	'objectsMaxSize',
	'objectsMinModifiedMs',
	'objectsMaxModifiedMs',
	'objectsSort',
	'objectsShowThumbnails',
	'objectsThumbnailCacheSize',
	'objectsAutoIndexEnabled',
	'objectsAutoIndexTtlHours',
	'objectsTreeWidth',
	'objectsTreeExpandedByBucket',
	'objectsDetailsOpen',
	'objectsDetailsWidth',
] as const

function ApiTokenField(props: { apiToken: string; setApiToken: (v: string) => void }) {
	const [draft, setDraft] = useState(props.apiToken)
	const apply = () => {
		props.setApiToken(draft.trim())
	}
	return (
		<Space.Compact style={{ width: '100%' }}>
			<Input.Password
				placeholder="Must match API_TOKEN…"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={apply}
				onPressEnter={(e) => {
					e.preventDefault()
					apply()
				}}
				autoComplete="current-password"
			/>
			<Button type="primary" onClick={apply}>
				Apply
			</Button>
		</Space.Compact>
	)
}

function networkLogTagColor(kind: NetworkLogEvent['kind']): string {
	return kind === 'retry' ? 'orange' : 'blue'
}

export function SettingsPage(props: Props) {
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const [moveAfterUploadDefault, setMoveAfterUploadDefault] = useLocalStorageState<boolean>('moveAfterUploadDefault', false)
	const [cleanupEmptyDirsDefault, setCleanupEmptyDirsDefault] = useLocalStorageState<boolean>(
		'cleanupEmptyDirsDefault',
		false,
	)
	const [moveCleanupFilenameTemplate, setMoveCleanupFilenameTemplate] = useLocalStorageState<string>(
		'moveCleanupFilenameTemplate',
		MOVE_CLEANUP_FILENAME_TEMPLATE,
	)
	const [moveCleanupFilenameMaxLen, setMoveCleanupFilenameMaxLen] = useLocalStorageState<number>(
		'moveCleanupFilenameMaxLen',
		MOVE_CLEANUP_FILENAME_MAX_LEN,
	)
	const [downloadLinkProxyEnabled, setDownloadLinkProxyEnabled] = useLocalStorageState<boolean>(
		'downloadLinkProxyEnabled',
		false,
	)
	const [uploadAutoTuneEnabled, setUploadAutoTuneEnabled] = useLocalStorageState<boolean>('uploadAutoTuneEnabled', true)
	const [uploadBatchConcurrencySetting, setUploadBatchConcurrencySetting] = useLocalStorageState<number>(
		'uploadBatchConcurrency',
		16,
	)
	const [uploadBatchBytesMiBSetting, setUploadBatchBytesMiBSetting] = useLocalStorageState<number>(
		'uploadBatchBytesMiB',
		64,
	)
	const [uploadChunkSizeMiBSetting, setUploadChunkSizeMiBSetting] = useLocalStorageState<number>(
		'uploadChunkSizeMiB',
		128,
	)
	const [uploadChunkConcurrencySetting, setUploadChunkConcurrencySetting] = useLocalStorageState<number>(
		'uploadChunkConcurrency',
		8,
	)
	const [uploadChunkThresholdMiBSetting, setUploadChunkThresholdMiBSetting] = useLocalStorageState<number>(
		'uploadChunkThresholdMiB',
		256,
	)
	const [uploadChunkFileConcurrencySetting, setUploadChunkFileConcurrencySetting] = useLocalStorageState<number>(
		'uploadChunkFileConcurrency',
		2,
	)
	const [uploadResumeConversionEnabled, setUploadResumeConversionEnabled] = useLocalStorageState<boolean>(
		'uploadResumeConversionEnabled',
		false,
	)
	const [objectsShowThumbnails, setObjectsShowThumbnails] = useLocalStorageState<boolean>('objectsShowThumbnails', true)
	const [objectsThumbnailCacheSize, setObjectsThumbnailCacheSize] = useLocalStorageState<number>(
		'objectsThumbnailCacheSize',
		THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	)
	const [objectsAutoIndexEnabled, setObjectsAutoIndexEnabled] = useLocalStorageState<boolean>(
		'objectsAutoIndexEnabled',
		OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
	)
	const [objectsAutoIndexTtlHours, setObjectsAutoIndexTtlHours] = useLocalStorageState<number>(
		'objectsAutoIndexTtlHours',
		OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
	)
	const [apiRetryCount, setApiRetryCount] = useLocalStorageState<number>(RETRY_COUNT_STORAGE_KEY, DEFAULT_RETRY_COUNT)
	const [apiRetryDelayMs, setApiRetryDelayMs] = useLocalStorageState<number>(RETRY_DELAY_STORAGE_KEY, DEFAULT_RETRY_DELAY_MS)
	const [networkLog, setNetworkLog] = useState<NetworkLogEvent[]>(() => getNetworkLog())

	useEffect(() => {
		return subscribeNetworkLog(
			(entry) => {
				setNetworkLog((prev) => [entry, ...prev].slice(0, 50))
			},
			() => setNetworkLog([]),
		)
	}, [])

	const metaQuery = useQuery({
		queryKey: ['meta', props.apiToken],
		queryFn: () => api.getMeta(),
		retry: false,
	})
	const apiDocsBase = useMemo(() => {
		const apiBaseUrl = getApiBaseUrl()
		const api = new URL(apiBaseUrl, window.location.origin)
		api.pathname = stripApiBaseSuffix(api.pathname)
		return `${api.origin}${api.pathname}`.replace(/\/+$/, '')
	}, [])
	const openapiUrl = `${apiDocsBase}/openapi.yml`
	const apiDocsUrl = `${apiDocsBase}/docs`
	const tlsCapability = metaQuery.data?.capabilities?.profileTls
	const tlsEnabled = tlsCapability?.enabled ?? false
	const tlsReason = tlsCapability?.reason ?? ''
	const mtlsLabel = (
		<Space size={4}>
			<span>mTLS (client cert)</span>
			<Tooltip title="Requires ENCRYPTION_KEY to store client certificates at rest.">
				<InfoCircleOutlined />
			</Tooltip>
		</Space>
	)

	const onResetUiState = useCallback(() => {
		confirmDangerAction({
			title: 'Reset saved UI state?',
			description:
				'Clears stored view / filter / layout state from your browser (localStorage). Useful when screens look wrong after a lot of navigation. Your API token will be kept.\n\nThe app will reload after reset.',
			confirmText: 'RESET',
			confirmHint: 'RESET',
			okText: 'Reset and reload',
			onConfirm: async () => {
				for (const k of RESETTABLE_UI_STATE_KEYS) {
					try {
						localStorage.removeItem(k)
					} catch {
						// ignore
					}
				}
				message.success('Saved UI state reset. Reloading…')
				window.location.reload()
			},
		})
	}, [])

	return (
		<Space orientation="vertical" size="large" style={{ width: '100%' }}>
			<AppTabs
				defaultActiveKey="access"
				items={[
					{
						key: 'access',
						label: 'Access',
						children: (
							<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
								<Form layout="vertical" requiredMark={false}>
									<Form.Item label="Backend API Token (X-Api-Token)">
										<ApiTokenField key={props.apiToken} apiToken={props.apiToken} setApiToken={props.setApiToken} />
										<Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
											This must match the server's <Typography.Text code>API_TOKEN</Typography.Text> (or{' '}
											<Typography.Text code>--api-token</Typography.Text>). It is not related to S3 credentials.
										</Typography.Paragraph>
									</Form.Item>

									<Form.Item label="Selected Profile" extra="Used by most pages to scope S3 operations.">
										<Space.Compact style={{ width: '100%' }}>
											<Input value={props.profileId ?? ''} placeholder="(none)…" readOnly />
											<Button danger onClick={() => props.setProfileId(null)}>
												Clear
											</Button>
										</Space.Compact>
									</Form.Item>
								</Form>

								<Collapse
									size="small"
									items={[
										{
											key: 'advanced',
											label: 'Advanced',
											children: (
												<Space orientation="vertical" size={4} style={{ width: '100%' }}>
														<Typography.Text type="secondary">OpenAPI 3.0 spec and interactive docs.</Typography.Text>
														<Space wrap>
															<Button type="link" href={apiDocsUrl} target="_blank" rel="noopener noreferrer">
																Open API Docs (new tab)
															</Button>
															<Button type="link" href={openapiUrl} target="_blank" rel="noopener noreferrer">
																OpenAPI YAML (new tab)
															</Button>
														</Space>
													</Space>
												),
											},
									]}
								/>
							</Space>
						),
					},
					{
						key: 'transfers',
						label: 'Transfers',
						children: (
							<Form layout="vertical" requiredMark={false}>
								<Form.Item label="Default: Move after upload" extra="Applies to folder uploads from this device.">
									<Switch
										checked={moveAfterUploadDefault}
										onChange={setMoveAfterUploadDefault}
										aria-label="Default: Move after upload"
									/>
								</Form.Item>
								<Form.Item label="Default: Auto-clean empty folders" extra="Used only when move-after-upload is enabled.">
									<Switch
										checked={cleanupEmptyDirsDefault}
										onChange={setCleanupEmptyDirsDefault}
										disabled={!moveAfterUploadDefault}
										aria-label="Default: Auto-clean empty folders"
									/>
								</Form.Item>

								<Form.Item
									label="Downloads: Use server proxy"
									extra="When enabled, downloads and 'Link…' always use /download-proxy. When disabled, downloads try presigned URLs first and fall back to the proxy only if CORS blocks the request."
								>
									<Switch
										checked={downloadLinkProxyEnabled}
										onChange={setDownloadLinkProxyEnabled}
										aria-label="Downloads: Use server proxy"
									/>
								</Form.Item>

								<Collapse
									size="small"
									items={[
										{
											key: 'advanced',
											label: 'Advanced',
											children: (
												<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
													<Form.Item
														label="Upload auto-tuning"
														extra="Automatically adjusts batch/chunk settings based on file size."
													>
														<Switch
															checked={uploadAutoTuneEnabled}
															onChange={setUploadAutoTuneEnabled}
															aria-label="Upload auto-tuning"
														/>
													</Form.Item>
													<Form.Item
														label="Upload batch concurrency"
														extra="Number of parallel upload batches per client. Higher values can improve throughput on fast networks."
													>
														<InputNumber
															min={1}
															max={32}
															precision={0}
															value={uploadBatchConcurrencySetting}
															onChange={(value) =>
																setUploadBatchConcurrencySetting(typeof value === 'number' ? value : 16)
															}
															style={{ width: '100%' }}
														/>
													</Form.Item>
													<Form.Item
														label="Upload batch size (MiB)"
														extra="Target size per upload batch. Larger batches reduce request overhead but increase memory use."
													>
														<InputNumber
															min={8}
															max={256}
															step={8}
															precision={0}
															value={uploadBatchBytesMiBSetting}
															onChange={(value) =>
																setUploadBatchBytesMiBSetting(typeof value === 'number' ? value : 64)
															}
															style={{ width: '100%' }}
														/>
													</Form.Item>
													<Form.Item
														label="Upload tuning presets"
														extra="Quick presets for batch + chunk settings. You can still fine-tune below."
													>
														<Space wrap>
															<Button
																onClick={() => {
																	setUploadBatchConcurrencySetting(8)
																	setUploadBatchBytesMiBSetting(32)
																	setUploadChunkSizeMiBSetting(64)
																	setUploadChunkConcurrencySetting(4)
																	setUploadChunkThresholdMiBSetting(128)
																}}
															>
																Stable
															</Button>
															<Button
																onClick={() => {
																	setUploadBatchConcurrencySetting(16)
																	setUploadBatchBytesMiBSetting(64)
																	setUploadChunkSizeMiBSetting(128)
																	setUploadChunkConcurrencySetting(8)
																	setUploadChunkThresholdMiBSetting(256)
																}}
															>
																Fast
															</Button>
															<Button
																type="primary"
																onClick={() => {
																	setUploadBatchConcurrencySetting(32)
																	setUploadBatchBytesMiBSetting(128)
																	setUploadChunkSizeMiBSetting(256)
																	setUploadChunkConcurrencySetting(16)
																	setUploadChunkThresholdMiBSetting(512)
																}}
															>
																Max Throughput
															</Button>
														</Space>
													</Form.Item>
													<Form.Item
														label="Upload chunk size (MiB)"
														extra="Single-file uploads above the threshold are split into chunks of this size."
													>
														<InputNumber
															min={16}
															max={512}
															step={16}
															precision={0}
															value={uploadChunkSizeMiBSetting}
															onChange={(value) =>
																setUploadChunkSizeMiBSetting(typeof value === 'number' ? value : 128)
															}
															style={{ width: '100%' }}
														/>
													</Form.Item>
													<Form.Item
														label="Upload chunk concurrency"
														extra="Parallel chunk uploads for a single large file."
													>
														<InputNumber
															min={1}
															max={16}
															precision={0}
															value={uploadChunkConcurrencySetting}
															onChange={(value) =>
																setUploadChunkConcurrencySetting(typeof value === 'number' ? value : 8)
															}
															style={{ width: '100%' }}
														/>
													</Form.Item>
													<Form.Item
														label="Upload file concurrency (chunked)"
														extra="Number of large files uploaded in parallel when chunking."
													>
														<InputNumber
															min={1}
															max={8}
															precision={0}
															value={uploadChunkFileConcurrencySetting}
															onChange={(value) =>
																setUploadChunkFileConcurrencySetting(typeof value === 'number' ? value : 2)
															}
															style={{ width: '100%' }}
														/>
													</Form.Item>
													<Form.Item
														label="Chunking threshold (MiB)"
														extra="Files larger than this threshold use chunked uploads."
													>
														<InputNumber
															min={64}
															max={2048}
															step={64}
															precision={0}
															value={uploadChunkThresholdMiBSetting}
															onChange={(value) =>
																setUploadChunkThresholdMiBSetting(typeof value === 'number' ? value : 256)
															}
															style={{ width: '100%' }}
														/>
													</Form.Item>
													<Form.Item
														label="Resume conversion mode"
														extra="Allows resuming uploads even if chunk sizes changed between sessions."
													>
														<Switch
															checked={uploadResumeConversionEnabled}
															onChange={setUploadResumeConversionEnabled}
															aria-label="Resume conversion mode"
														/>
													</Form.Item>
													<Form.Item
														label="Move cleanup report filename template"
														extra="Available tokens: {bucket} {prefix} {label} {timestamp}"
													>
														<Input
															value={moveCleanupFilenameTemplate}
															onChange={(e) => setMoveCleanupFilenameTemplate(e.target.value)}
															placeholder={MOVE_CLEANUP_FILENAME_TEMPLATE}
														/>
													</Form.Item>
													<Form.Item label="Move cleanup report filename max length">
														<InputNumber
															min={40}
															max={200}
															value={moveCleanupFilenameMaxLen}
															onChange={(value) =>
																setMoveCleanupFilenameMaxLen(typeof value === 'number' ? value : MOVE_CLEANUP_FILENAME_MAX_LEN)
															}
															style={{ width: '100%' }}
														/>
													</Form.Item>
												</Space>
											),
										},
									]}
								/>
							</Form>
						),
					},
					{
						key: 'objects',
						label: 'Objects',
						children: (
							<Form layout="vertical" requiredMark={false}>
								<Form.Item
									label="Show image thumbnails"
									extra="Controls thumbnails in the object list and details panel."
								>
									<Switch
										checked={objectsShowThumbnails}
										onChange={setObjectsShowThumbnails}
										aria-label="Show image thumbnails"
									/>
								</Form.Item>
								<Collapse
									size="small"
									items={[
										{
											key: 'advanced',
											label: 'Advanced',
											children: (
												<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
													<Form.Item label="Thumbnail cache size" extra="Max cached thumbnails kept in memory (LRU).">
														<InputNumber
															min={THUMBNAIL_CACHE_MIN_ENTRIES}
															max={THUMBNAIL_CACHE_MAX_ENTRIES}
															step={50}
															precision={0}
															value={objectsThumbnailCacheSize}
															onChange={(value) =>
																setObjectsThumbnailCacheSize(
																	typeof value === 'number'
																		? Math.min(
																				THUMBNAIL_CACHE_MAX_ENTRIES,
																				Math.max(THUMBNAIL_CACHE_MIN_ENTRIES, value),
																			)
																		: THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
																)
															}
															style={{ width: '100%' }}
														/>
													</Form.Item>
													<Form.Item
														label="Auto index current prefix"
														extra="When Global Search is used, build/refresh the index for the current prefix automatically."
													>
														<Switch
															checked={objectsAutoIndexEnabled}
															onChange={setObjectsAutoIndexEnabled}
															aria-label="Auto index current prefix"
														/>
													</Form.Item>
													<Form.Item
														label="Auto index TTL (hours)"
														extra="Rebuild prefix index when it is older than this value."
													>
														<InputNumber
															min={OBJECTS_AUTO_INDEX_TTL_MIN_HOURS}
															max={OBJECTS_AUTO_INDEX_TTL_MAX_HOURS}
															step={1}
															precision={0}
															value={objectsAutoIndexTtlHours}
															onChange={(value) =>
																setObjectsAutoIndexTtlHours(
																	typeof value === 'number'
																		? Math.min(
																				OBJECTS_AUTO_INDEX_TTL_MAX_HOURS,
																				Math.max(OBJECTS_AUTO_INDEX_TTL_MIN_HOURS, value),
																			)
																		: OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
																)
															}
															disabled={!objectsAutoIndexEnabled}
															style={{ width: '100%' }}
														/>
													</Form.Item>
												</Space>
											),
										},
									]}
								/>
							</Form>
						),
					},
					{
						key: 'network',
						label: 'Network',
						children: (
							<Form layout="vertical" requiredMark={false}>
								<Form.Item label="HTTP retry count" extra="Applies to GET and other idempotent requests.">
									<InputNumber
										min={RETRY_COUNT_MIN}
										max={RETRY_COUNT_MAX}
										precision={0}
										value={apiRetryCount}
										onChange={(value) =>
											setApiRetryCount(
												typeof value === 'number'
													? Math.min(RETRY_COUNT_MAX, Math.max(RETRY_COUNT_MIN, value))
													: DEFAULT_RETRY_COUNT,
											)
										}
										style={{ width: '100%' }}
									/>
								</Form.Item>
								<Form.Item label="Retry base delay (ms)" extra={`Exponential backoff, capped at ${RETRY_DELAY_MAX_MS}ms.`}>
									<InputNumber
										min={RETRY_DELAY_MIN_MS}
										max={RETRY_DELAY_MAX_MS}
										step={100}
										value={apiRetryDelayMs}
										onChange={(value) =>
											setApiRetryDelayMs(
												typeof value === 'number'
													? Math.min(RETRY_DELAY_MAX_MS, Math.max(RETRY_DELAY_MIN_MS, value))
													: DEFAULT_RETRY_DELAY_MS,
											)
										}
										style={{ width: '100%' }}
									/>
								</Form.Item>
								<Collapse
									size="small"
									items={[
										{
											key: 'advanced',
											label: 'Advanced',
											children: (
												<Form.Item
													label="Network diagnostics"
													extra="Recent network events and retries (this session)."
													style={{ marginBottom: 0 }}
												>
														<Space orientation="vertical" size={8} style={{ width: '100%' }}>
															<Typography.Text type="secondary">Session log ({networkLog.length})</Typography.Text>
															<Typography.Text type="secondary">
																Retry entries include wait time and reason. If <Typography.Text code>Retry-After</Typography.Text> appears, wait that
																interval before manual retry.
															</Typography.Text>
															<Button size="small" onClick={() => clearNetworkLog()} disabled={networkLog.length === 0}>
																Clear log
															</Button>
														<div
															style={{
																border: '1px solid rgba(0, 0, 0, 0.08)',
																borderRadius: 8,
																padding: 8,
																maxHeight: 160,
																overflow: 'auto',
															}}
														>
															<Space orientation="vertical" size={4} style={{ width: '100%' }}>
																{networkLog.length === 0 ? (
																	<Typography.Text type="secondary">No network events yet.</Typography.Text>
																) : (
																		networkLog.map((entry, index) => (
																			<Space key={`${entry.ts}-${index}`} size={8} wrap>
																				<Typography.Text type="secondary">{formatTime(entry.ts)}</Typography.Text>
																				<Tag color={networkLogTagColor(entry.kind)}>{entry.kind.toUpperCase()}</Tag>
																				<Typography.Text type="secondary">{entry.message}</Typography.Text>
																			</Space>
																		))
																	)}
																</Space>
															</div>
													</Space>
												</Form.Item>
											),
										},
									]}
								/>
							</Form>
						),
					},
					{
						key: 'server',
						label: 'Server',
						children: (
							<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
								{metaQuery.isFetching && !metaQuery.data ? (
									<div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
										<Spin />
									</div>
								) : null}

								{metaQuery.isError ? (
									<Alert
										type="error"
										showIcon
										title="Failed to load /meta"
										description={formatErr(metaQuery.error)}
										style={{ marginBottom: 12 }}
									/>
								) : null}

								{metaQuery.data ? (
									<>
										{metaQuery.data.transferEngine.available && !metaQuery.data.transferEngine.compatible ? (
											<Alert
												type="warning"
												showIcon
												title="Transfer engine is incompatible"
												description={`Requires rclone >= ${metaQuery.data.transferEngine.minVersion}. Current: ${metaQuery.data.transferEngine.version || 'unknown'}.`}
											/>
										) : null}

										<Collapse
											size="small"
											items={[
												{
													key: 'advanced',
													label: 'Advanced',
													children: (
														<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
															<Typography.Text type="secondary">Detailed server metadata and capability status.</Typography.Text>
															<Descriptions size="small" bordered column={1}>
																<Descriptions.Item label="Version">{metaQuery.data.version}</Descriptions.Item>
																<Descriptions.Item label="Server Addr">
																	<Typography.Text code>{metaQuery.data.serverAddr}</Typography.Text>
																</Descriptions.Item>
																<Descriptions.Item label="Data Dir">
																	<Typography.Text code>{metaQuery.data.dataDir}</Typography.Text>
																</Descriptions.Item>
																<Descriptions.Item label="Static Dir">
																	<Typography.Text code>{metaQuery.data.staticDir}</Typography.Text>
																</Descriptions.Item>
																<Descriptions.Item label="API Token Required">
																	<Tag color={metaQuery.data.apiTokenEnabled ? 'warning' : 'default'}>
																		{metaQuery.data.apiTokenEnabled ? 'enabled' : 'disabled'}
																	</Tag>
																</Descriptions.Item>
																<Descriptions.Item label="Encryption">
																	<Tag color={metaQuery.data.encryptionEnabled ? 'success' : 'default'}>
																		{metaQuery.data.encryptionEnabled ? 'enabled' : 'disabled'}
																	</Tag>
																</Descriptions.Item>
																<Descriptions.Item label={mtlsLabel}>
																	<Space orientation="vertical" size={0}>
																		<Tag color={tlsEnabled ? 'success' : 'default'}>{tlsEnabled ? 'enabled' : 'disabled'}</Tag>
																		{!tlsEnabled && tlsReason ? <Typography.Text type="secondary">{tlsReason}</Typography.Text> : null}
																	</Space>
																</Descriptions.Item>
																<Descriptions.Item label="Allowed Local Dirs">
																	<Space orientation="vertical" size={0}>
																		{metaQuery.data.allowedLocalDirs?.length ? (
																			<Typography.Text code>{metaQuery.data.allowedLocalDirs.join(', ')}</Typography.Text>
																		) : (
																			<Typography.Text type="secondary">(not configured)</Typography.Text>
																		)}
																		<Typography.Text type="secondary">
																			Server-side local sync jobs are restricted to these roots.
																		</Typography.Text>
																	</Space>
																</Descriptions.Item>
																<Descriptions.Item label="Job Concurrency">{metaQuery.data.jobConcurrency}</Descriptions.Item>
																<Descriptions.Item label="Job Log Max Bytes">
																	{metaQuery.data.jobLogMaxBytes ? (
																		<Typography.Text code>{metaQuery.data.jobLogMaxBytes}</Typography.Text>
																	) : (
																		<Typography.Text type="secondary">(unlimited)</Typography.Text>
																	)}
																</Descriptions.Item>
																<Descriptions.Item label="Job Retention (seconds)">
																	{metaQuery.data.jobRetentionSeconds ? (
																		<Typography.Text code>{metaQuery.data.jobRetentionSeconds}</Typography.Text>
																	) : (
																		<Typography.Text type="secondary">(keep forever)</Typography.Text>
																	)}
																</Descriptions.Item>
																<Descriptions.Item label="Job Log Retention (seconds)">
																	{metaQuery.data.jobLogRetentionSeconds ? (
																		<Typography.Text code>{metaQuery.data.jobLogRetentionSeconds}</Typography.Text>
																	) : (
																		<Typography.Text type="secondary">(keep forever)</Typography.Text>
																	)}
																</Descriptions.Item>
																<Descriptions.Item label="Upload Session TTL (seconds)">
																	{metaQuery.data.uploadSessionTTLSeconds}
																</Descriptions.Item>
																<Descriptions.Item label="Upload Max Bytes">
																	{metaQuery.data.uploadMaxBytes ? (
																		<Typography.Text code>{metaQuery.data.uploadMaxBytes}</Typography.Text>
																	) : (
																		<Typography.Text type="secondary">(unlimited)</Typography.Text>
																	)}
																</Descriptions.Item>
																<Descriptions.Item label="Transfer Engine">
																	<Space>
																		<Tag color={metaQuery.data.transferEngine.available ? 'success' : 'default'}>
																			{metaQuery.data.transferEngine.available ? 'available' : 'missing'}
																		</Tag>
																		{metaQuery.data.transferEngine.available ? (
																			<Tag color={metaQuery.data.transferEngine.compatible ? 'success' : 'error'}>
																				{metaQuery.data.transferEngine.compatible
																					? 'compatible'
																					: `incompatible (>= ${metaQuery.data.transferEngine.minVersion})`}
																			</Tag>
																		) : null}
																		<Typography.Text code>{metaQuery.data.transferEngine.name}</Typography.Text>
																		{metaQuery.data.transferEngine.version ? (
																			<Typography.Text code>{metaQuery.data.transferEngine.version}</Typography.Text>
																		) : null}
																		{metaQuery.data.transferEngine.path ? (
																			<Typography.Text code>{metaQuery.data.transferEngine.path}</Typography.Text>
																		) : null}
																	</Space>
																</Descriptions.Item>
															</Descriptions>
														</Space>
													),
												},
											]}
										/>
									</>
								) : null}
							</Space>
						),
					},
					{
						key: 'troubleshooting',
						label: 'Troubleshooting',
						children: (
							<Space orientation="vertical" size={8} style={{ width: '100%' }}>
								<Typography.Text type="secondary">
									Clears saved view / filter / layout state from your browser (localStorage). Useful when a screen looks
									"stuck" because an old filter or panel state was persisted.
								</Typography.Text>
								<Button danger onClick={onResetUiState}>
									Reset saved UI state
								</Button>
							</Space>
						),
					},
				]}
			/>
		</Space>
	)
}

// formatErr lives in ../lib/errors
