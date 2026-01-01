import { InfoCircleOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import {
	Alert,
	Button,
	Descriptions,
	Divider,
	Form,
	Input,
	InputNumber,
	Space,
	Spin,
	Switch,
	Tag,
	Tooltip,
	Typography,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'

import {
	APIClient,
	APIError,
	DEFAULT_RETRY_COUNT,
	DEFAULT_RETRY_DELAY_MS,
	RETRY_COUNT_MAX,
	RETRY_COUNT_MIN,
	RETRY_COUNT_STORAGE_KEY,
	RETRY_DELAY_MAX_MS,
	RETRY_DELAY_MIN_MS,
	RETRY_DELAY_STORAGE_KEY,
} from '../api/client'
import { clearNetworkLog, getNetworkLog, subscribeNetworkLog, type NetworkLogEvent } from '../lib/networkStatus'
import { MOVE_CLEANUP_FILENAME_MAX_LEN, MOVE_CLEANUP_FILENAME_TEMPLATE } from '../lib/moveCleanupDefaults'
import { useLocalStorageState } from '../lib/useLocalStorageState'

type Props = {
	apiToken: string
	setApiToken: (v: string) => void
	profileId: string | null
	setProfileId: (v: string | null) => void
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
		const rawAddr = metaQuery.data?.serverAddr?.trim() ?? ''
		if (!rawAddr) return window.location.origin
		if (rawAddr.startsWith('http://') || rawAddr.startsWith('https://')) {
			return rawAddr.replace(/\/+$/, '')
		}
		if (rawAddr.startsWith('0.0.0.0') || rawAddr.startsWith('::') || rawAddr.startsWith('[::')) {
			return window.location.origin
		}
		return `${window.location.protocol}//${rawAddr}`.replace(/\/+$/, '')
	}, [metaQuery.data?.serverAddr])
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

	return (
		<Space direction="vertical" size="large" style={{ width: '100%' }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
				<Typography.Title level={3} style={{ margin: 0 }}>
					Settings
				</Typography.Title>
			</div>

			<Form layout="vertical">
				<Form.Item label="Backend API Token (X-Api-Token)">
					<Input.Password
						placeholder="Must match API_TOKEN"
						value={props.apiToken}
						onChange={(e) => props.setApiToken(e.target.value)}
						autoComplete="current-password"
					/>
					<Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
						This must match the server's <Typography.Text code>API_TOKEN</Typography.Text> (or{' '}
						<Typography.Text code>--api-token</Typography.Text>). It is not related to S3 credentials or the
						transfer engine.
					</Typography.Paragraph>
				</Form.Item>

				<Form.Item label="Selected Profile">
					<Space.Compact style={{ width: '100%' }}>
						<Input value={props.profileId ?? ''} placeholder="(none)" readOnly />
						<Button danger onClick={() => props.setProfileId(null)}>
							Clear
						</Button>
					</Space.Compact>
				</Form.Item>
				<Form.Item label="Default: Move after upload" extra="Applies to folder uploads from this device.">
					<Switch checked={moveAfterUploadDefault} onChange={setMoveAfterUploadDefault} />
				</Form.Item>
				<Form.Item label="Default: Auto-clean empty folders" extra="Used only when move-after-upload is enabled.">
					<Switch
						checked={cleanupEmptyDirsDefault}
						onChange={setCleanupEmptyDirsDefault}
						disabled={!moveAfterUploadDefault}
					/>
				</Form.Item>
				<Form.Item label="Move cleanup report filename template" extra="Available tokens: {bucket} {prefix} {label} {timestamp}">
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

				<Divider titlePlacement="left">Downloads</Divider>

				<Form.Item
					label="Downloads: Use server proxy"
					extra="When enabled, downloads and 'Link...' use /download-proxy for same-origin access and Content-Disposition. When disabled, presigned URLs are used (requires S3 CORS for in-app progress)."
				>
					<Switch checked={downloadLinkProxyEnabled} onChange={setDownloadLinkProxyEnabled} />
				</Form.Item>

				<Divider titlePlacement="left">Network</Divider>

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
				<Form.Item label="Network diagnostics" extra="Recent network events and retries (this session).">
					<Space direction="vertical" size={8} style={{ width: '100%' }}>
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
							<Space direction="vertical" size={4} style={{ width: '100%' }}>
								{networkLog.length === 0 ? (
									<Typography.Text type="secondary">No network events yet.</Typography.Text>
								) : (
									networkLog.map((entry, index) => (
										<Typography.Text key={`${entry.ts}-${index}`} type="secondary">
											{new Date(entry.ts).toLocaleTimeString()} · {entry.kind} · {entry.message}
										</Typography.Text>
									))
								)}
							</Space>
						</div>
					</Space>
				</Form.Item>
			</Form>

			<Divider titlePlacement="left">API</Divider>
			<Space direction="vertical" size={4} style={{ width: '100%' }}>
				<Typography.Text type="secondary">OpenAPI 3.0 spec and interactive docs.</Typography.Text>
				<Space wrap>
					<Button type="link" href={apiDocsUrl} target="_blank" rel="noreferrer">
						Open API Docs
					</Button>
					<Button type="link" href={openapiUrl} target="_blank" rel="noreferrer">
						OpenAPI YAML
					</Button>
				</Space>
			</Space>

			<Divider titlePlacement="left">Server</Divider>

			{metaQuery.isFetching && !metaQuery.data ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
					<Spin />
				</div>
			) : null}

			{metaQuery.isError ? (
				<Alert
					type="error"
					showIcon
					message="Failed to load /meta"
					description={formatErr(metaQuery.error)}
					style={{ marginBottom: 12 }}
				/>
			) : null}

			{metaQuery.data ? (
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
						<Space direction="vertical" size={0}>
							<Tag color={tlsEnabled ? 'success' : 'default'}>{tlsEnabled ? 'enabled' : 'disabled'}</Tag>
							{!tlsEnabled && tlsReason ? <Typography.Text type="secondary">{tlsReason}</Typography.Text> : null}
						</Space>
					</Descriptions.Item>
					<Descriptions.Item label="Allowed Local Dirs">
						{metaQuery.data.allowedLocalDirs?.length ? (
							<Typography.Text code>{metaQuery.data.allowedLocalDirs.join(', ')}</Typography.Text>
						) : (
							<Typography.Text type="secondary">(not configured)</Typography.Text>
						)}
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
			) : null}
		</Space>
	)
}

function formatErr(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}
