import { Button, Space, Typography } from 'antd'
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import {
	DEFAULT_RETRY_COUNT,
	DEFAULT_RETRY_DELAY_MS,
	RETRY_COUNT_STORAGE_KEY,
	RETRY_DELAY_STORAGE_KEY,
} from '../api/client'
import type { APIClientShape } from '../api/client'
import type { MetaResponse } from '../api/types'
import { getApiBaseUrl, stripApiBaseSuffix } from '../api/baseUrl'
import { AppTabs } from '../components/AppTabs'
import {
	DEFAULT_DOWNLOAD_TASK_CONCURRENCY,
	DEFAULT_UPLOAD_TASK_CONCURRENCY,
	DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY,
	UPLOAD_TASK_CONCURRENCY_STORAGE_KEY,
	sanitizeDownloadTaskConcurrency,
	sanitizeUploadTaskConcurrency,
} from '../components/transfers/transferConcurrencyPreferences'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { clearDismissedDialogs, countDismissedDialogs, subscribeDialogPreferences } from '../lib/dialogPreferences'
import { clearNetworkLog, getNetworkLog, subscribeNetworkLog, type NetworkLogEvent } from '../lib/networkStatus'
import {
	OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
	OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
} from '../lib/objectIndexing'
import {
	OBJECTS_COST_MODE_DEFAULT,
	OBJECTS_COST_MODE_STORAGE_KEY,
	type ObjectsCostMode,
} from '../lib/objectsCostMode'
import {
	THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
} from '../lib/thumbnailCache'
import { appFeedback } from '../lib/appFeedback'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { reloadPage } from '../lib/reloadPage'
import { clearResettableUiState } from '../lib/storageResetRegistry'
import {
	AccessSettingsSection,
	NetworkSettingsSection,
	ObjectsSettingsSection,
	ServerSettingsSection,
	TransfersSettingsSection,
} from './settings/settingsLazy'
import styles from './SettingsPage.module.css'

type Props = {
	api: APIClientShape
	meta?: MetaResponse
	shellScopeKey: string
	apiToken: string
	setApiToken: (v: string) => void
	profileId: string | null
	setProfileId: (v: string | null) => void
}

function SettingsSectionFallback() {
	return (
		<div role="status" className={styles.sectionFallback}>
			<span>Loading settings…</span>
			<span className={styles.sectionFallbackBar} aria-hidden="true" />
		</div>
	)
}

function RecoverySettingsSection({
	dismissedDialogCount,
	onResetDismissedDialogs,
	onResetUiState,
}: {
	dismissedDialogCount: number
	onResetDismissedDialogs: () => void
	onResetUiState: () => void
}) {
	return (
		<Space orientation="vertical" size="middle" className={styles.fullWidth}>
			<Typography.Text type="secondary" className={styles.sectionIntro}>
				What this affects: browser-stored layout, filters, selections, and dismissed safety dialogs.
			</Typography.Text>
			<div className={styles.recoveryCard}>
				<Space orientation="vertical" size={8} className={styles.fullWidth}>
					<Typography.Text strong>Saved UI state</Typography.Text>
					<Typography.Text type="secondary">
						Clears saved view, filter, and layout state from this browser. Use it when the UI looks stuck because an old local state was persisted.
					</Typography.Text>
					<Button danger onClick={onResetUiState}>
						Reset saved UI state
					</Button>
				</Space>
			</div>
			<div className={styles.recoveryCard}>
				<Space orientation="vertical" size={8} className={styles.fullWidth}>
					<Typography.Text strong>Dismissed dialog confirmations</Typography.Text>
					<Typography.Text type="secondary">
						{dismissedDialogCount > 0
							? `${dismissedDialogCount} dialog preference(s) are currently suppressed.`
							: 'No dialog preferences are currently suppressed.'}
					</Typography.Text>
					<Button onClick={onResetDismissedDialogs} disabled={dismissedDialogCount === 0}>
						Reset dismissed dialogs
					</Button>
				</Space>
			</div>
		</Space>
	)
}

export function SettingsPage(props: Props) {
	const [downloadLinkProxyEnabled, setDownloadLinkProxyEnabled] = useLocalStorageState<boolean>(
		'downloadLinkProxyEnabled',
		false,
	)
	const [downloadTaskConcurrencySetting, setDownloadTaskConcurrencySetting] = useLocalStorageState<number>(
		DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY,
		DEFAULT_DOWNLOAD_TASK_CONCURRENCY,
		{ sanitize: sanitizeDownloadTaskConcurrency },
	)
	const [uploadAutoTuneEnabled, setUploadAutoTuneEnabled] = useLocalStorageState<boolean>('uploadAutoTuneEnabled', true)
	const [uploadTaskConcurrencySetting, setUploadTaskConcurrencySetting] = useLocalStorageState<number>(
		UPLOAD_TASK_CONCURRENCY_STORAGE_KEY,
		DEFAULT_UPLOAD_TASK_CONCURRENCY,
		{ sanitize: sanitizeUploadTaskConcurrency },
	)
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
	const [objectsCostMode, setObjectsCostMode] = useLocalStorageState<ObjectsCostMode>(
		OBJECTS_COST_MODE_STORAGE_KEY,
		OBJECTS_COST_MODE_DEFAULT,
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
	const dismissedDialogCount = useSyncExternalStore(
		subscribeDialogPreferences,
		() => countDismissedDialogs(props.apiToken),
		() => 0,
	)

	useEffect(() => {
		return subscribeNetworkLog(
			(entry) => {
				setNetworkLog((prev) => [entry, ...prev].slice(0, 50))
			},
			() => setNetworkLog([]),
		)
	}, [])

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
				'Clears stored view / filter / layout / selection state from your browser (localStorage). Useful when screens look wrong after a lot of navigation. Your API token will be kept.\n\nThe app will reload after reset.',
			confirmText: 'RESET',
			confirmHint: 'RESET',
			okText: 'Reset and reload',
			onConfirm: async () => {
				clearResettableUiState()
				appFeedback.success('Saved UI state reset. Reloading…')
				reloadPage()
			},
		})
	}, [])

	const onResetDismissedDialogs = useCallback(() => {
		clearDismissedDialogs(props.apiToken)
		appFeedback.success('Dismissed dialog preferences reset.')
	}, [props.apiToken])

	return (
		<Space orientation="vertical" size="large" className={styles.fullWidth}>
			<AppTabs
				ariaLabel="Settings sections"
				defaultActiveKey="access"
				items={[
					{
						key: 'access',
						label: 'Access',
						children: (
							<Suspense fallback={<SettingsSectionFallback />}>
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
						key: 'objects',
						label: 'Objects',
						children: (
							<Suspense fallback={<SettingsSectionFallback />}>
								<ObjectsSettingsSection
									objectsShowThumbnails={objectsShowThumbnails}
									setObjectsShowThumbnails={setObjectsShowThumbnails}
									objectsThumbnailCacheSize={objectsThumbnailCacheSize}
									setObjectsThumbnailCacheSize={setObjectsThumbnailCacheSize}
									objectsCostMode={objectsCostMode}
									setObjectsCostMode={setObjectsCostMode}
									objectsAutoIndexEnabled={objectsAutoIndexEnabled}
									setObjectsAutoIndexEnabled={setObjectsAutoIndexEnabled}
									objectsAutoIndexTtlHours={objectsAutoIndexTtlHours}
									setObjectsAutoIndexTtlHours={setObjectsAutoIndexTtlHours}
								/>
							</Suspense>
						),
					},
					{
						key: 'transfers',
						label: 'Transfers',
						children: (
							<Suspense fallback={<SettingsSectionFallback />}>
								<TransfersSettingsSection
									downloadLinkProxyEnabled={downloadLinkProxyEnabled}
									setDownloadLinkProxyEnabled={setDownloadLinkProxyEnabled}
									downloadTaskConcurrencySetting={downloadTaskConcurrencySetting}
									setDownloadTaskConcurrencySetting={setDownloadTaskConcurrencySetting}
									uploadAutoTuneEnabled={uploadAutoTuneEnabled}
									setUploadAutoTuneEnabled={setUploadAutoTuneEnabled}
									uploadTaskConcurrencySetting={uploadTaskConcurrencySetting}
									setUploadTaskConcurrencySetting={setUploadTaskConcurrencySetting}
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
						key: 'advanced',
						label: 'Advanced',
						children: (
							<Space orientation="vertical" size="large" className={styles.fullWidth}>
								<Suspense fallback={<SettingsSectionFallback />}>
									<ServerSettingsSection
										api={props.api}
										meta={props.meta}
										scopeKey={props.shellScopeKey}
									/>
								</Suspense>
								<Suspense fallback={<SettingsSectionFallback />}>
									<NetworkSettingsSection
										apiRetryCount={apiRetryCount}
										setApiRetryCount={setApiRetryCount}
										apiRetryDelayMs={apiRetryDelayMs}
										setApiRetryDelayMs={setApiRetryDelayMs}
										networkLog={networkLog}
										onClearNetworkLog={() => clearNetworkLog()}
									/>
								</Suspense>
								<RecoverySettingsSection
									dismissedDialogCount={dismissedDialogCount}
									onResetDismissedDialogs={onResetDismissedDialogs}
									onResetUiState={onResetUiState}
								/>
							</Space>
						),
					},
				]}
			/>
		</Space>
	)
}

// formatErr lives in ../lib/errors
