import { useQuery } from '@tanstack/react-query'
import { Button, message, Space, Typography } from 'antd'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import {
	APIClient,
	DEFAULT_RETRY_COUNT,
	DEFAULT_RETRY_DELAY_MS,
	RETRY_COUNT_STORAGE_KEY,
	RETRY_DELAY_STORAGE_KEY,
} from '../api/client'
import { getApiBaseUrl, stripApiBaseSuffix } from '../api/baseUrl'
import { AppTabs } from '../components/AppTabs'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { clearNetworkLog, getNetworkLog, subscribeNetworkLog, type NetworkLogEvent } from '../lib/networkStatus'
import {
	OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
	OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
} from '../lib/objectIndexing'
import {
	THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
} from '../lib/thumbnailCache'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import {
	AccessSettingsSection,
	NetworkSettingsSection,
	ObjectsSettingsSection,
	ServerSettingsSection,
	TransfersSettingsSection,
} from './settings/settingsLazy'
import styles from './SettingsPage.module.css'

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

export function SettingsPage(props: Props) {
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
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
		<Space orientation="vertical" size="large" className={styles.fullWidth}>
			<AppTabs
				defaultActiveKey="access"
				items={[
					{
						key: 'access',
						label: 'Access',
						children: (
							<Suspense fallback={null}>
								<AccessSettingsSection
									apiToken={props.apiToken}
									setApiToken={props.setApiToken}
									profileId={props.profileId}
									setProfileId={props.setProfileId}
									apiDocsUrl={apiDocsUrl}
									openapiUrl={openapiUrl}
								/>
							</Suspense>
						),
					},
					{
						key: 'transfers',
						label: 'Transfers',
						children: (
							<Suspense fallback={null}>
								<TransfersSettingsSection
									downloadLinkProxyEnabled={downloadLinkProxyEnabled}
									setDownloadLinkProxyEnabled={setDownloadLinkProxyEnabled}
									uploadAutoTuneEnabled={uploadAutoTuneEnabled}
									setUploadAutoTuneEnabled={setUploadAutoTuneEnabled}
									uploadBatchConcurrencySetting={uploadBatchConcurrencySetting}
									setUploadBatchConcurrencySetting={setUploadBatchConcurrencySetting}
									uploadBatchBytesMiBSetting={uploadBatchBytesMiBSetting}
									setUploadBatchBytesMiBSetting={setUploadBatchBytesMiBSetting}
									uploadChunkSizeMiBSetting={uploadChunkSizeMiBSetting}
									setUploadChunkSizeMiBSetting={setUploadChunkSizeMiBSetting}
									uploadChunkConcurrencySetting={uploadChunkConcurrencySetting}
									setUploadChunkConcurrencySetting={setUploadChunkConcurrencySetting}
									uploadChunkThresholdMiBSetting={uploadChunkThresholdMiBSetting}
									setUploadChunkThresholdMiBSetting={setUploadChunkThresholdMiBSetting}
									uploadChunkFileConcurrencySetting={uploadChunkFileConcurrencySetting}
									setUploadChunkFileConcurrencySetting={setUploadChunkFileConcurrencySetting}
									uploadResumeConversionEnabled={uploadResumeConversionEnabled}
									setUploadResumeConversionEnabled={setUploadResumeConversionEnabled}
								/>
							</Suspense>
						),
					},
					{
						key: 'objects',
						label: 'Objects',
						children: (
							<Suspense fallback={null}>
								<ObjectsSettingsSection
									objectsShowThumbnails={objectsShowThumbnails}
									setObjectsShowThumbnails={setObjectsShowThumbnails}
									objectsThumbnailCacheSize={objectsThumbnailCacheSize}
									setObjectsThumbnailCacheSize={setObjectsThumbnailCacheSize}
									objectsAutoIndexEnabled={objectsAutoIndexEnabled}
									setObjectsAutoIndexEnabled={setObjectsAutoIndexEnabled}
									objectsAutoIndexTtlHours={objectsAutoIndexTtlHours}
									setObjectsAutoIndexTtlHours={setObjectsAutoIndexTtlHours}
								/>
							</Suspense>
						),
					},
					{
						key: 'network',
						label: 'Network',
						children: (
							<Suspense fallback={null}>
								<NetworkSettingsSection
									apiRetryCount={apiRetryCount}
									setApiRetryCount={setApiRetryCount}
									apiRetryDelayMs={apiRetryDelayMs}
									setApiRetryDelayMs={setApiRetryDelayMs}
									networkLog={networkLog}
									onClearNetworkLog={() => clearNetworkLog()}
								/>
							</Suspense>
						),
					},
					{
						key: 'server',
						label: 'Server',
						children: (
							<Suspense fallback={null}>
								<ServerSettingsSection
									api={api}
									meta={metaQuery.data}
									isFetching={metaQuery.isFetching}
									errorMessage={metaQuery.isError ? formatErr(metaQuery.error) : null}
								/>
							</Suspense>
						),
					},
					{
						key: 'troubleshooting',
						label: 'Troubleshooting',
						children: (
							<Space orientation="vertical" size={8} className={styles.fullWidth}>
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
