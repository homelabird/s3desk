import {
	DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY,
	UPLOAD_TASK_CONCURRENCY_STORAGE_KEY,
} from '../components/transfers/transferConcurrencyPreferences'

type ResettableStorage = Pick<Storage, 'key' | 'length' | 'removeItem'>

export const RESETTABLE_UI_STATE_KEYS = [
	// Global navigation-ish state
	'profileId',
	'bucket',
	'prefix',
	'uploadPrefix',
	UPLOAD_TASK_CONCURRENCY_STORAGE_KEY,
	'uploadBatchConcurrency',
	'uploadBatchBytesMiB',
	'uploadChunkSizeMiB',
	'uploadChunkConcurrency',
	'uploadChunkThresholdMiB',
	'uploadChunkFileConcurrency',
	'uploadAutoTuneEnabled',
	'uploadResumeConversionEnabled',
	DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY,
	'transfersTab',

	// Jobs
	'jobsFollowLogs',
	'jobsStatusFilter',
	'jobsSearchFilter',
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
	'objectsCostMode',
	'objectsAutoIndexEnabled',
	'objectsAutoIndexTtlHours',
	'objectsTreeWidth',
	'objectsTreeExpandedByBucket',
	'objectsDetailsOpen',
	'objectsDetailsWidth',
] as const

export const RESETTABLE_UI_STATE_PREFIXES = ['app:', 'objects:', 'uploads:', 'jobs:', 'transfers:'] as const

function getDefaultStorage(): ResettableStorage | null {
	return typeof window === 'undefined' ? null : window.localStorage
}

export function clearResettableUiState(storage: ResettableStorage | null = getDefaultStorage()) {
	if (!storage) return

	for (const key of RESETTABLE_UI_STATE_KEYS) {
		try {
			storage.removeItem(key)
		} catch {
			// ignore localStorage access failures
		}
	}

	for (let index = storage.length - 1; index >= 0; index -= 1) {
		const key = storage.key(index)
		if (!key) continue
		if (!RESETTABLE_UI_STATE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
		try {
			storage.removeItem(key)
		} catch {
			// ignore localStorage access failures
		}
	}
}
