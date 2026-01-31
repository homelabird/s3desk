import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Dropdown, Grid, Menu, Space, Typography, message } from 'antd'
import { SnippetsOutlined } from '@ant-design/icons'
import {
	lazy,
	Suspense,
	useCallback,
	useDeferredValue,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError, RequestAbortedError } from '../api/client'
import type { InputRef } from 'antd'
import type { Bucket, JobCreateRequest, ListObjectsResponse, ObjectItem } from '../api/types'
import { useTransfers } from '../components/useTransfers'
import { getDevicePickerSupport, pickDirectory } from '../lib/deviceFs'
import { withJobQueueRetry } from '../lib/jobQueue'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { useIsOffline } from '../lib/useIsOffline'
import { formatBytes } from '../lib/transfer'
import styles from './objects/objects.module.css'
import type { UIActionOrDivider } from './objects/objectsActions'
import {
	actionToMenuItem,
	buildActionMenu,
	compactMenuItems,
	trimActionDividers,
} from './objects/objectsActions'
import type { ObjectSort, ObjectTypeFilter } from './objects/objectsTypes'
import { ObjectsLayout } from './objects/ObjectsLayout'
import { ObjectsListHeader } from './objects/ObjectsListHeader'
import { ObjectsObjectRowItem, ObjectsPrefixRowItem } from './objects/ObjectsListRowItems'
import { ObjectsListSectionContainer } from './objects/ObjectsListSectionContainer'
import { ObjectThumbnail } from './objects/ObjectThumbnail'
import { ObjectsSelectionBarSection } from './objects/ObjectsSelectionBarSection'
import type { ObjectRow } from './objects/objectsListUtils'
import {
	buildObjectRows,
	displayNameForKey,
	guessPreviewKind,
	normalizeForSearch,
	normalizePrefix,
	parentPrefixFromKey,
	splitLines,
	splitSearchTokens,
} from './objects/objectsListUtils'
import {
	OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
	OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MAX_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MIN_HOURS,
} from '../lib/objectIndexing'
import {
	createThumbnailCache,
	THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	THUMBNAIL_CACHE_MAX_ENTRIES,
	THUMBNAIL_CACHE_MIN_ENTRIES,
} from '../lib/thumbnailCache'
import { useObjectsListKeydownHandler } from './objects/useObjectsListKeydownHandler'
import { useObjectsCommandPalette } from './objects/useObjectsCommandPalette'
import { useObjectPreview } from './objects/useObjectPreview'
import { useObjectDownloads } from './objects/useObjectDownloads'
import { useObjectsAutoScan } from './objects/useObjectsAutoScan'
import { useSearchHighlight } from './objects/useSearchHighlight'
import { useObjectsTree } from './objects/useObjectsTree'
import { useObjectsLayout } from './objects/useObjectsLayout'
import { useObjectsActionCatalog } from './objects/useObjectsActionCatalog'
import { useObjectsClipboard } from './objects/useObjectsClipboard'
import { useObjectsDnd } from './objects/useObjectsDnd'
import { useObjectsSelection } from './objects/useObjectsSelection'
import { useObjectsContextMenu } from './objects/useObjectsContextMenu'
import { useObjectsSelectionHandlers } from './objects/useObjectsSelectionHandlers'
import { useObjectsSelectionBulk } from './objects/useObjectsSelectionBulk'
import { useObjectsSelectionEffects } from './objects/useObjectsSelectionEffects'
import { useObjectsFavorites } from './objects/useObjectsFavorites'
import { useObjectsDetailsActions } from './objects/useObjectsDetailsActions'
import { useObjectsSelectionBarActions } from './objects/useObjectsSelectionBarActions'
import { useObjectsPresign } from './objects/useObjectsPresign'
import { useObjectsRename } from './objects/useObjectsRename'
import { useObjectsUploadFolder } from './objects/useObjectsUploadFolder'
import { useObjectsCopyMove } from './objects/useObjectsCopyMove'
import { useObjectsDelete } from './objects/useObjectsDelete'
import { useObjectsNewFolder } from './objects/useObjectsNewFolder'
import { useObjectsZipJobs } from './objects/useObjectsZipJobs'
import { useObjectsIndexing } from './objects/useObjectsIndexing'
import { useObjectsDownloadPrefix } from './objects/useObjectsDownloadPrefix'
import { useObjectsUploadDrop } from './objects/useObjectsUploadDrop'
import { useObjectsDeleteConfirm } from './objects/useObjectsDeleteConfirm'
import { useObjectsPrefixSummary } from './objects/useObjectsPrefixSummary'

const ObjectsCommandPaletteModal = lazy(async () => {
	const m = await import('./objects/ObjectsCommandPaletteModal')
	return { default: m.ObjectsCommandPaletteModal }
})
const ObjectsCopyMoveModal = lazy(async () => {
	const m = await import('./objects/ObjectsCopyMoveModal')
	return { default: m.ObjectsCopyMoveModal }
})
const ObjectsCopyPrefixModal = lazy(async () => {
	const m = await import('./objects/ObjectsCopyPrefixModal')
	return { default: m.ObjectsCopyPrefixModal }
})
const ObjectsDeletePrefixConfirmModal = lazy(async () => {
	const m = await import('./objects/ObjectsDeletePrefixConfirmModal')
	return { default: m.ObjectsDeletePrefixConfirmModal }
})
const ObjectsDownloadPrefixModal = lazy(async () => {
	const m = await import('./objects/ObjectsDownloadPrefixModal')
	return { default: m.ObjectsDownloadPrefixModal }
})
const ObjectsUploadFolderModal = lazy(async () => {
	const m = await import('./objects/ObjectsUploadFolderModal')
	return { default: m.ObjectsUploadFolderModal }
})
const ObjectsFiltersDrawer = lazy(async () => {
	const m = await import('./objects/ObjectsFiltersDrawer')
	return { default: m.ObjectsFiltersDrawer }
})
const ObjectsGlobalSearchDrawer = lazy(async () => {
	const m = await import('./objects/ObjectsGlobalSearchDrawer')
	return { default: m.ObjectsGlobalSearchDrawer }
})
const ObjectsGoToPathModal = lazy(async () => {
	const m = await import('./objects/ObjectsGoToPathModal')
	return { default: m.ObjectsGoToPathModal }
})
const ObjectsNewFolderModal = lazy(async () => {
	const m = await import('./objects/ObjectsNewFolderModal')
	return { default: m.ObjectsNewFolderModal }
})
const ObjectsPresignModal = lazy(async () => {
	const m = await import('./objects/ObjectsPresignModal')
	return { default: m.ObjectsPresignModal }
})
const ObjectsRenameModal = lazy(async () => {
	const m = await import('./objects/ObjectsRenameModal')
	return { default: m.ObjectsRenameModal }
})
const ObjectsToolbarSection = lazy(async () => {
	const m = await import('./objects/ObjectsToolbarSection')
	return { default: m.ObjectsToolbarSection }
})
const ObjectsTreeSection = lazy(async () => {
	const m = await import('./objects/ObjectsTreeSection')
	return { default: m.ObjectsTreeSection }
})
const ObjectsListControls = lazy(async () => {
	const m = await import('./objects/ObjectsListControls')
	return { default: m.ObjectsListControls }
})
const ObjectsListContent = lazy(async () => {
	const m = await import('./objects/ObjectsListContent')
	return { default: m.ObjectsListContent }
})
const ObjectsDetailsPanelSection = lazy(async () => {
	const m = await import('./objects/ObjectsDetailsPanelSection')
	return { default: m.ObjectsDetailsPanelSection }
})

type Props = {
	apiToken: string
	profileId: string | null
}

type Location = { bucket: string; prefix: string }

type LocationTab = {
	id: string
	bucket: string
	prefix: string
	history: Location[]
	historyIndex: number
}

type ObjectsUIMode = 'simple' | 'advanced'

const OBJECTS_LIST_PAGE_SIZE = 200
const AUTO_INDEX_COOLDOWN_MS = 5 * 60 * 1000
const COMPACT_ROW_HEIGHT_PX = 52
const WIDE_ROW_HEIGHT_PX = 40

export function ObjectsPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const transfers = useTransfers()
	const navigate = useNavigate()
	const screens = Grid.useBreakpoint()
	const isOffline = useIsOffline()
	const debugObjectsList = isObjectsListDebugEnabled()
	const debugContextMenu = isContextMenuDebugEnabled()

	const createJobWithRetry = useCallback(
		(req: JobCreateRequest) => {
			if (!props.profileId) throw new Error('profile is required')
			return withJobQueueRetry(() => api.createJob(props.profileId!, req))
		},
		[api, props.profileId],
	)

	const isDesktop = !!screens.lg
	const handleJobsLinkClick = useCallback(
		(event: ReactMouseEvent<HTMLElement>) => {
			event.preventDefault()
			navigate('/jobs')
		},
		[navigate],
	)
	const isWideDesktop = !!screens.xl
	const canDragDrop = !!screens.lg && !isOffline

	const [bucket, setBucket] = useLocalStorageState<string>('bucket', '')
	const [prefix, setPrefix] = useLocalStorageState<string>('prefix', '')
	const [tabs, setTabs] = useLocalStorageState<LocationTab[]>('objectsTabs', [])
	const [activeTabId, setActiveTabId] = useLocalStorageState<string>('objectsActiveTabId', '')
	const [recentPrefixesByBucket, setRecentPrefixesByBucket] = useLocalStorageState<Record<string, string[]>>('objectsRecentPrefixesByBucket', {})
	const [bookmarksByBucket, setBookmarksByBucket] = useLocalStorageState<Record<string, string[]>>('objectsBookmarksByBucket', {})
	const [uiMode, setUiMode] = useLocalStorageState<ObjectsUIMode>('objectsUIMode', 'simple')
	const isAdvanced = uiMode === 'advanced'

	const [pathDraft, setPathDraft] = useState(prefix)
	const [pathModalOpen, setPathModalOpen] = useState(false)
	const pathInputRef = useRef<InputRef | null>(null)
	const openPathModal = useCallback(() => {
		if (!props.profileId) {
			message.info('Select a profile first')
			return
		}
		if (!bucket) {
			message.info('Select a bucket first')
			return
		}
		setPathDraft(prefix)
		setPathModalOpen(true)
		window.setTimeout(() => {
			pathInputRef.current?.focus()
			pathInputRef.current?.select?.()
		}, 0)
	}, [bucket, prefix, props.profileId])

	const [prefixByBucket, setPrefixByBucket] = useLocalStorageState<Record<string, string>>('objectsPrefixByBucket', {})
	const prefixByBucketRef = useRef<Record<string, string>>(prefixByBucket)
	const [search, setSearch] = useLocalStorageState<string>('objectsSearch', '')
	const [searchDraft, setSearchDraft] = useState(search)
	const deferredSearch = useDeferredValue(search)
	const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
	const [globalSearch, setGlobalSearch] = useLocalStorageState<string>('objectsGlobalSearch', '')
	const [globalSearchDraft, setGlobalSearchDraft] = useState(globalSearch)
	const deferredGlobalSearch = useDeferredValue(globalSearch)
	const [globalSearchPrefix, setGlobalSearchPrefix] = useLocalStorageState<string>('objectsGlobalSearchPrefix', '')
	const [globalSearchLimit, setGlobalSearchLimit] = useLocalStorageState<number>('objectsGlobalSearchLimit', 100)
	const [globalSearchExt, setGlobalSearchExt] = useLocalStorageState<string>('objectsGlobalSearchExt', '')
	const [globalSearchMinSize, setGlobalSearchMinSize] = useLocalStorageState<number | null>('objectsGlobalSearchMinSize', null)
	const [globalSearchMaxSize, setGlobalSearchMaxSize] = useLocalStorageState<number | null>('objectsGlobalSearchMaxSize', null)
	const [globalSearchMinModifiedMs, setGlobalSearchMinModifiedMs] = useLocalStorageState<number | null>(
		'objectsGlobalSearchMinModifiedMs',
		null,
	)
	const [globalSearchMaxModifiedMs, setGlobalSearchMaxModifiedMs] = useLocalStorageState<number | null>(
		'objectsGlobalSearchMaxModifiedMs',
		null,
	)
	const [indexPrefix, setIndexPrefix] = useState('')
	const [indexFullReindex, setIndexFullReindex] = useState(true)
	const resetGlobalSearch = useCallback(() => {
		setGlobalSearch('')
		setGlobalSearchDraft('')
		setGlobalSearchPrefix('')
		setGlobalSearchLimit(100)
		setGlobalSearchExt('')
		setGlobalSearchMinSize(null)
		setGlobalSearchMaxSize(null)
		setGlobalSearchMinModifiedMs(null)
		setGlobalSearchMaxModifiedMs(null)
		setIndexPrefix('')
		setIndexFullReindex(true)
	}, [
		setGlobalSearch,
		setGlobalSearchDraft,
		setGlobalSearchPrefix,
		setGlobalSearchLimit,
		setGlobalSearchExt,
		setGlobalSearchMinSize,
		setGlobalSearchMaxSize,
		setGlobalSearchMinModifiedMs,
		setGlobalSearchMaxModifiedMs,
		setIndexPrefix,
		setIndexFullReindex,
	])
	const [typeFilter, setTypeFilter] = useLocalStorageState<ObjectTypeFilter>('objectsTypeFilter', 'all')
	const [favoritesOnly, setFavoritesOnly] = useLocalStorageState<boolean>('objectsFavoritesOnly', false)
	const [favoritesFirst, setFavoritesFirst] = useLocalStorageState<boolean>('objectsFavoritesFirst', false)
	const [favoritesSearch, setFavoritesSearch] = useLocalStorageState<string>('objectsFavoritesSearch', '')
	const [favoritesOpenDetails, setFavoritesOpenDetails] = useLocalStorageState<boolean>('objectsFavoritesOpenDetails', false)
	const [extFilter, setExtFilter] = useLocalStorageState<string>('objectsExtFilter', '')
	const [minSize, setMinSize] = useLocalStorageState<number | null>('objectsMinSize', null)
	const [maxSize, setMaxSize] = useLocalStorageState<number | null>('objectsMaxSize', null)
	const [minModifiedMs, setMinModifiedMs] = useLocalStorageState<number | null>('objectsMinModifiedMs', null)
	const [maxModifiedMs, setMaxModifiedMs] = useLocalStorageState<number | null>('objectsMaxModifiedMs', null)
	const [sort, setSort] = useLocalStorageState<ObjectSort>('objectsSort', 'name_asc')
	const [showThumbnails] = useLocalStorageState<boolean>('objectsShowThumbnails', true)
	const [thumbnailCacheSize] = useLocalStorageState<number>(
		'objectsThumbnailCacheSize',
		THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	)
	const [autoIndexEnabled] = useLocalStorageState<boolean>(
		'objectsAutoIndexEnabled',
		OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
	)
	const [autoIndexTtlHours] = useLocalStorageState<number>(
		'objectsAutoIndexTtlHours',
		OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
	)
	const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false)
	const [detailsOpen, setDetailsOpen] = useLocalStorageState<boolean>('objectsDetailsOpen', true)
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
	const layoutRef = useRef<HTMLDivElement | null>(null)
	const [layoutWidthPx, setLayoutWidthPx] = useState(0)
	const [listScrollerEl, setListScrollerEl] = useState<HTMLDivElement | null>(null)
	const scrollContainerRef = useRef<HTMLDivElement | null>(null)
	const [scrollMargin, setScrollMargin] = useState(0)
	const [autoScanReady, setAutoScanReady] = useState(false)
	const normalizedThumbnailCacheSize = useMemo(() => {
		if (typeof thumbnailCacheSize !== 'number' || !Number.isFinite(thumbnailCacheSize)) {
			return THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES
		}
		return Math.min(
			THUMBNAIL_CACHE_MAX_ENTRIES,
			Math.max(THUMBNAIL_CACHE_MIN_ENTRIES, Math.round(thumbnailCacheSize)),
		)
	}, [thumbnailCacheSize])
	const thumbnailCache = useMemo(() => createThumbnailCache({ maxEntries: normalizedThumbnailCacheSize }), [normalizedThumbnailCacheSize])
	const autoIndexTtlMs = useMemo(() => {
		if (typeof autoIndexTtlHours !== 'number' || !Number.isFinite(autoIndexTtlHours)) {
			return OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS * 60 * 60 * 1000
		}
		const clamped = Math.min(
			OBJECTS_AUTO_INDEX_TTL_MAX_HOURS,
			Math.max(OBJECTS_AUTO_INDEX_TTL_MIN_HOURS, Math.round(autoIndexTtlHours)),
		)
		return clamped * 60 * 60 * 1000
	}, [autoIndexTtlHours])
	const { selectedKeys, setSelectedKeys, selectedCount, lastSelectedObjectKey, setLastSelectedObjectKey, clearSelection } = useObjectsSelection()
	const {
		treeData,
		treeExpandedKeys,
		setTreeExpandedKeys,
		treeSelectedKeys,
		setTreeSelectedKeys,
		onTreeLoadData,
		refreshTreeNode,
		treeDrawerOpen,
		setTreeDrawerOpen,
	} = useObjectsTree({
		api,
		profileId: props.profileId,
		bucket,
		prefix,
		debugEnabled: debugObjectsList,
		log: logObjectsDebug,
	})
	const {
		dockTree,
		dockDetails,
		detailsVisible,
		treeWidthUsed,
		detailsWidthUsed,
		isCompactList,
		treeResizeHandleWidth,
		detailsResizeHandleWidth,
		onTreeResizePointerDown,
		onTreeResizePointerMove,
		onTreeResizePointerUp,
		onDetailsResizePointerDown,
		onDetailsResizePointerMove,
		onDetailsResizePointerUp,
	} = useObjectsLayout({
		layoutWidthPx,
		isDesktop,
		isWideDesktop,
		isAdvanced,
		detailsOpen,
		detailsDrawerOpen,
		setDetailsDrawerOpen,
		setTreeDrawerOpen,
	})
	const uploadFilesInputRef = useRef<HTMLInputElement | null>(null)
	const uploadFolderInputRef = useRef<HTMLInputElement | null>(null)
	useEffect(() => {
		const el = uploadFolderInputRef.current
		if (!el) return
		el.setAttribute('webkitdirectory', '')
		el.setAttribute('directory', '')
	}, [uploadFolderInputRef])


	const [moveAfterUploadDefault, setMoveAfterUploadDefault] = useLocalStorageState<boolean>('moveAfterUploadDefault', false)
	const [cleanupEmptyDirsDefault, setCleanupEmptyDirsDefault] = useLocalStorageState<boolean>('cleanupEmptyDirsDefault', false)
	const [downloadLinkProxyEnabled] = useLocalStorageState<boolean>('downloadLinkProxyEnabled', false)

	const bucketsQuery = useQuery({
		queryKey: ['buckets', props.profileId, props.apiToken],
		queryFn: () => api.listBuckets(props.profileId!),
		enabled: !!props.profileId,
	})

	const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null, [activeTabId, tabs])

	useEffect(() => {
		prefixByBucketRef.current = prefixByBucket
	}, [prefixByBucket])

	useEffect(() => {
		const el = layoutRef.current
		if (!el) return
		const ro = new ResizeObserver((entries) => {
			const next = entries[0]?.contentRect?.width ?? 0
			setLayoutWidthPx(Math.max(0, Math.round(next)))
		})
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	useEffect(() => {
		if (tabs.length > 0) return
		const id = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
		setTabs([{ id, bucket, prefix, history: [{ bucket, prefix }], historyIndex: 0 }])
		setActiveTabId(id)
	}, [bucket, prefix, setActiveTabId, setTabs, tabs.length])

	useEffect(() => {
		if (tabs.length === 0) return
		if (activeTabId && tabs.some((t) => t.id === activeTabId)) return
		setActiveTabId(tabs[0].id)
	}, [activeTabId, setActiveTabId, tabs])

	useEffect(() => {
		if (!activeTab) return
		if (bucket === activeTab.bucket && prefix === activeTab.prefix) return
		setBucket(activeTab.bucket)
		setPrefix(activeTab.prefix)
	}, [activeTab, bucket, prefix, setBucket, setPrefix])

	useEffect(() => {
		if (!bucket) return
		setPrefixByBucket((prev) => ({ ...prev, [bucket]: prefix }))
	}, [bucket, prefix, setPrefixByBucket])

	useEffect(() => {
		if (pathModalOpen) return
		setPathDraft(prefix)
	}, [pathModalOpen, prefix])

	useEffect(() => {
		setSearchDraft(search)
	}, [search])

	useEffect(() => {
		if (searchDraft === search) return
		const id = window.setTimeout(() => {
			setSearch(searchDraft)
		}, 250)
		return () => window.clearTimeout(id)
	}, [search, searchDraft, setSearch])

	useEffect(() => {
		setGlobalSearchDraft(globalSearch)
	}, [globalSearch])

	useEffect(() => {
		if (globalSearchDraft === globalSearch) return
		const id = window.setTimeout(() => {
			setGlobalSearch(globalSearchDraft)
		}, 250)
		return () => window.clearTimeout(id)
	}, [globalSearch, globalSearchDraft, setGlobalSearch])

	useEffect(() => {
		if (uiMode !== 'simple') return
		setExtFilter('')
		setMinSize(null)
		setMaxSize(null)
	}, [setExtFilter, setMaxSize, setMinSize, uiMode])

	useEffect(() => {
		if (uiMode !== 'simple') return
		setDetailsOpen(false)
		setDetailsDrawerOpen(false)
	}, [setDetailsDrawerOpen, setDetailsOpen, uiMode])

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
				e.preventDefault()
				openPathModal()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [openPathModal])


const objectsQuery = useInfiniteQuery({
		queryKey: ['objects', props.profileId, bucket, prefix, props.apiToken],
		enabled: !!props.profileId && !!bucket,
		initialPageParam: undefined as string | undefined,
		staleTime: 15_000,
		queryFn: async ({ pageParam }) => {
			return api.listObjects({
				profileId: props.profileId!,
				bucket,
				prefix,
				delimiter: '/',
				maxKeys: OBJECTS_LIST_PAGE_SIZE,
				continuationToken: pageParam,
			})
		},
		getNextPageParam: (lastPage, _allPages, lastPageParam, allPageParams) => {
			if (!lastPage.isTruncated) return undefined
			const nextToken = lastPage.nextContinuationToken ?? undefined
			if (!nextToken) {
				logObjectsDebug(debugObjectsList, 'warn', 'List objects missing continuation token; stopping pagination', {
					bucket,
					prefix,
				})
				return undefined
			}

			const lastCommonPrefixes = Array.isArray(lastPage.commonPrefixes) ? lastPage.commonPrefixes : []
			const pageEmpty = lastPage.items.length === 0 && lastCommonPrefixes.length === 0
			if (pageEmpty) {
				logObjectsDebug(debugObjectsList, 'warn', 'List objects returned empty page; stopping pagination', {
					bucket,
					prefix,
					nextToken,
				})
				return undefined
			}

			if (typeof lastPageParam === 'string' && lastPageParam && nextToken === lastPageParam) {
				logObjectsDebug(debugObjectsList, 'warn', 'List objects repeated continuation token; stopping pagination', {
					bucket,
					prefix,
					nextToken,
				})
				return undefined
			}

			const seen = new Set<string>()
			for (const param of allPageParams) {
				if (typeof param === 'string' && param) seen.add(param)
			}
			if (seen.has(nextToken)) {
				logObjectsDebug(debugObjectsList, 'warn', 'List objects hit previously seen continuation token; stopping pagination', {
					bucket,
					prefix,
					nextToken,
				})
				return undefined
			}
			return nextToken
		},
	})

	const { favoritesQuery, favoriteItems, favoriteKeys, favoritePendingKeys, toggleFavorite } = useObjectsFavorites({
		api,
		profileId: props.profileId,
		bucket,
		apiToken: props.apiToken,
		objectsPages: objectsQuery.data?.pages ?? [],
	})

	const globalSearchQueryText = deferredGlobalSearch.trim()
	const globalSearchPrefixNormalized = normalizePrefix(globalSearchPrefix)
	const globalSearchLimitClamped = Math.max(1, Math.min(200, globalSearchLimit))
	const globalSearchExtNormalized = globalSearchExt.trim().replace(/^\./, '').toLowerCase()
	let globalSearchMinSizeBytes =
		typeof globalSearchMinSize === 'number' && Number.isFinite(globalSearchMinSize) ? globalSearchMinSize : null
	let globalSearchMaxSizeBytes =
		typeof globalSearchMaxSize === 'number' && Number.isFinite(globalSearchMaxSize) ? globalSearchMaxSize : null
	if (globalSearchMinSizeBytes != null && globalSearchMaxSizeBytes != null && globalSearchMinSizeBytes > globalSearchMaxSizeBytes) {
		;[globalSearchMinSizeBytes, globalSearchMaxSizeBytes] = [globalSearchMaxSizeBytes, globalSearchMinSizeBytes]
	}
	let globalSearchMinTimeMs =
		typeof globalSearchMinModifiedMs === 'number' && Number.isFinite(globalSearchMinModifiedMs) ? globalSearchMinModifiedMs : null
	let globalSearchMaxTimeMs =
		typeof globalSearchMaxModifiedMs === 'number' && Number.isFinite(globalSearchMaxModifiedMs) ? globalSearchMaxModifiedMs : null
	if (globalSearchMinTimeMs != null && globalSearchMaxTimeMs != null && globalSearchMinTimeMs > globalSearchMaxTimeMs) {
		;[globalSearchMinTimeMs, globalSearchMaxTimeMs] = [globalSearchMaxTimeMs, globalSearchMinTimeMs]
	}
	const globalSearchModifiedAfter = globalSearchMinTimeMs != null ? new Date(globalSearchMinTimeMs).toISOString() : undefined
	const globalSearchModifiedBefore = globalSearchMaxTimeMs != null ? new Date(globalSearchMaxTimeMs).toISOString() : undefined

	const indexedSearchQuery = useInfiniteQuery({
		queryKey: [
			'objectsIndexSearch',
			props.profileId,
			bucket,
			globalSearchQueryText,
			globalSearchPrefixNormalized,
			globalSearchLimitClamped,
			globalSearchExtNormalized,
			globalSearchMinSizeBytes,
			globalSearchMaxSizeBytes,
			globalSearchModifiedAfter,
			globalSearchModifiedBefore,
			props.apiToken,
		],
		enabled: globalSearchOpen && !!props.profileId && !!bucket && !!globalSearchQueryText,
		initialPageParam: undefined as string | undefined,
		queryFn: async ({ pageParam }) =>
			api.searchObjectsIndex({
				profileId: props.profileId!,
				bucket,
				q: globalSearchQueryText,
				prefix: globalSearchPrefixNormalized || undefined,
				limit: globalSearchLimitClamped,
				cursor: pageParam,
				ext: globalSearchExtNormalized || undefined,
				minSize: globalSearchMinSizeBytes ?? undefined,
				maxSize: globalSearchMaxSizeBytes ?? undefined,
				modifiedAfter: globalSearchModifiedAfter,
				modifiedBefore: globalSearchModifiedBefore,
		}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	})

	const { zipPrefixJobMutation, zipObjectsJobMutation } = useObjectsZipJobs({
		profileId: props.profileId,
		bucket,
		prefix,
		transfers,
		createJobWithRetry,
		onJobsLinkClick: handleJobsLinkClick,
	})
	const { indexObjectsJobMutation } = useObjectsIndexing({
		api,
		profileId: props.profileId,
		bucket,
		prefix,
		globalSearchOpen,
		globalSearchQueryText,
		globalSearchPrefixNormalized,
		autoIndexEnabled,
		autoIndexTtlMs,
		autoIndexCooldownMs: AUTO_INDEX_COOLDOWN_MS,
		setIndexPrefix,
		createJobWithRetry,
		onJobsLinkClick: handleJobsLinkClick,
	})

	const searchTokens = useMemo(() => splitSearchTokens(deferredSearch), [deferredSearch])
	const searchTokensNormalized = useMemo(() => searchTokens.map((token) => normalizeForSearch(token)), [searchTokens])
	const { highlightText } = useSearchHighlight(searchTokens)

	const rows: ObjectRow[] = useMemo(
		() =>
			buildObjectRows({
				pages: objectsQuery.data?.pages ?? [],
				favoriteItems,
				favoritesOnly,
				favoriteKeys,
				prefix,
				searchTokens,
				searchTokensNormalized,
				extFilter,
				minSize,
				maxSize,
				minModifiedMs,
				maxModifiedMs,
				typeFilter,
				sort,
				favoritesFirst,
			}),
		[
			extFilter,
			favoriteKeys,
			favoriteItems,
			favoritesFirst,
			favoritesOnly,
			maxModifiedMs,
			maxSize,
			minModifiedMs,
			minSize,
			objectsQuery.data,
			prefix,
			searchTokens,
			searchTokensNormalized,
			sort,
			typeFilter,
		],
	)

	const rowIndexByObjectKey = useMemo(() => {
		const out = new Map<string, number>()
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i]
			if (row && row.kind === 'object') {
				out.set(row.object.key, i)
			}
		}
		return out
	}, [rows])

	const { rawPrefixCount, rawFileCount } = useMemo(() => {
		if (favoritesOnly) {
			const activePrefix = normalizePrefix(prefix)
			const items = activePrefix ? favoriteItems.filter((item) => item.key.startsWith(activePrefix)) : favoriteItems
			return { rawPrefixCount: 0, rawFileCount: items.length }
		}
		const pages = objectsQuery.data?.pages ?? []
		return {
			rawPrefixCount: uniquePrefixes(pages).length,
			rawFileCount: pages.reduce((sum, p) => sum + p.items.length, 0),
		}
	}, [favoriteItems, favoritesOnly, objectsQuery.data, prefix])
	const rawTotalCount = rawPrefixCount + rawFileCount
	const emptyKind = rawTotalCount === 0 ? 'empty' : rows.length === 0 ? 'noresults' : null

	const visibleObjectKeys = useMemo(() => {
		const set = new Set<string>()
		for (const row of rows) {
			if (row.kind === 'object') set.add(row.object.key)
		}
		return Array.from(set)
	}, [rows])

	const orderedVisibleObjectKeys = useMemo(() => {
		const out: string[] = []
		for (const row of rows) {
			if (row.kind === 'object') out.push(row.object.key)
		}
		return out
	}, [rows])

	const {
		selectObjectFromPointerEvent,
		selectObjectFromCheckboxEvent,
		ensureObjectSelectedForContextMenu,
	} = useObjectsSelectionHandlers({
		orderedVisibleObjectKeys,
		lastSelectedObjectKey,
		setSelectedKeys,
		setLastSelectedObjectKey,
	})
	const { handleToggleSelectAll, selectRange, selectAllLoaded } = useObjectsSelectionBulk({
		visibleObjectKeys,
		orderedVisibleObjectKeys,
		setSelectedKeys,
		setLastSelectedObjectKey,
	})

	const { visiblePrefixCount, visibleFileCount } = useMemo(() => {
		let prefixCount = 0
		let fileCount = 0
		for (const row of rows) {
			if (row.kind === 'prefix') prefixCount++
			if (row.kind === 'object') fileCount++
		}
		return { visiblePrefixCount: prefixCount, visibleFileCount: fileCount }
	}, [rows])

	const loadedSelectedCount = useMemo(() => {
		if (visibleObjectKeys.length === 0 || selectedKeys.size === 0) return 0
		let count = 0
		for (const k of visibleObjectKeys) {
			if (selectedKeys.has(k)) count++
		}
		return count
	}, [visibleObjectKeys, selectedKeys])
	const allLoadedSelected = visibleObjectKeys.length > 0 && loadedSelectedCount === visibleObjectKeys.length
	const someLoadedSelected = loadedSelectedCount > 0 && loadedSelectedCount < visibleObjectKeys.length

	useLayoutEffect(() => {
		const container = scrollContainerRef.current
		const listEl = listScrollerEl
		if (!container || !listEl) return
		const listRect = listEl.getBoundingClientRect()
		const containerRect = container.getBoundingClientRect()
		const next = Math.max(0, Math.round(listRect.top - containerRect.top + container.scrollTop))
		setScrollMargin((prev) => (prev === next ? prev : next))
	}, [listScrollerEl])

	const bucketOptions = (bucketsQuery.data ?? []).map((b: Bucket) => ({ label: b.name, value: b.name }))
	const prefetchObjectsPage = useCallback(
		async (bucketName: string) => {
			if (!props.profileId || !bucketName) return
			const savedPrefix = prefixByBucketRef.current[bucketName] ?? ''
			const queryKey = ['objects', props.profileId, bucketName, savedPrefix, props.apiToken]
			const existing = queryClient.getQueryState(queryKey)
			if (existing?.status === 'success' || existing?.fetchStatus === 'fetching') return
			try {
				await queryClient.prefetchInfiniteQuery({
					queryKey,
					initialPageParam: undefined as string | undefined,
					staleTime: 15_000,
					queryFn: ({ pageParam }) =>
						api.listObjects({
							profileId: props.profileId!,
							bucket: bucketName,
							prefix: savedPrefix || undefined,
							delimiter: '/',
							maxKeys: OBJECTS_LIST_PAGE_SIZE,
							continuationToken: pageParam,
						}),
					getNextPageParam: (lastPage: ListObjectsResponse) =>
						lastPage.isTruncated ? lastPage.nextContinuationToken ?? undefined : undefined,
				})
			} catch {
				// ignore prefetch failures
			}
		},
		[api, props.apiToken, props.profileId, queryClient],
	)
	const handleBucketDropdownVisibleChange = useCallback(
		(open: boolean) => {
			if (!open) return
			if (!props.profileId || bucketOptions.length === 0) return
			const recent = new Set<string>()
			if (bucket) recent.add(bucket)
			for (const tab of tabs) {
				if (tab.bucket) recent.add(tab.bucket)
			}
			const recentBuckets = Array.from(recent).filter((name) => name && name !== bucket).slice(0, 3)
			const fallbackBuckets = bucketOptions
				.map((option) => String(option.value))
				.filter((name) => name && !recent.has(name))
				.slice(0, Math.max(0, 3 - recentBuckets.length))
			for (const name of [...recentBuckets, ...fallbackBuckets]) {
				prefetchObjectsPage(name)
			}
		},
		[bucket, bucketOptions, prefetchObjectsPage, props.profileId, tabs],
	)
	const prefetchQueueRef = useRef<string[]>([])
	const prefetchInFlightRef = useRef(0)
	const prefetchStartedRef = useRef(false)
	const pumpPrefetchQueue = useCallback(() => {
		const maxConcurrent = 2
		if (prefetchInFlightRef.current >= maxConcurrent) return
		const next = prefetchQueueRef.current.shift()
		if (!next) return
		prefetchInFlightRef.current += 1
		void prefetchObjectsPage(next).finally(() => {
			prefetchInFlightRef.current -= 1
			pumpPrefetchQueue()
		})
	}, [prefetchObjectsPage])
	useEffect(() => {
		if (prefetchStartedRef.current) return
		if (!props.profileId) return
		const names = bucketOptions.map((option) => String(option.value)).filter(Boolean)
		if (names.length === 0) return
		prefetchStartedRef.current = true
		const queue = names.filter((name) => name !== bucket).slice(0, 12)
		if (queue.length === 0) return
		prefetchQueueRef.current = queue
		const schedule = (cb: () => void) => {
			const idleCallback = (window as typeof window & {
				requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
			}).requestIdleCallback
			if (idleCallback) {
				idleCallback(cb, { timeout: 1500 })
				return
			}
			window.setTimeout(cb, 300)
		}
		schedule(() => pumpPrefetchQueue())
	}, [bucket, bucketOptions, props.profileId, pumpPrefetchQueue])
	const extOptions = useMemo(() => {
		const counts = new Map<string, number>()
		for (const page of objectsQuery.data?.pages ?? []) {
			for (const obj of page.items) {
				const ext = fileExtensionFromKey(obj.key)
				if (!ext) continue
				counts.set(ext, (counts.get(ext) ?? 0) + 1)
			}
		}
		return Array.from(counts.entries())
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, 20)
			.map(([ext, count]) => ({ label: `.${ext} (${count})`, value: ext }))
	}, [objectsQuery.data])

	const normalizePathInput = (raw: string): string => {
		const cleaned = raw.trim().replace(/^\/+/, '')
		if (!cleaned || cleaned === '/') return ''
		return normalizePrefix(cleaned)
	}

	const navigateToLocation = useCallback(
		(nextBucket: string, nextPrefix: string, options?: { recordHistory?: boolean }) => {
			const b = nextBucket.trim()
			const p = b ? normalizePathInput(nextPrefix) : ''
			const loc: Location = { bucket: b, prefix: p }
			const recordHistory = options?.recordHistory ?? true

			setTabs((prev) => {
				if (prev.length === 0) return prev
				const idx = prev.findIndex((t) => t.id === activeTabId)
				if (idx === -1) return prev
				const tab = prev[idx]
				const current = tab.history[tab.historyIndex] ?? { bucket: tab.bucket, prefix: tab.prefix }
				const same = current.bucket === loc.bucket && current.prefix === loc.prefix

				let nextHistory = tab.history
				let nextHistoryIndex = tab.historyIndex
				if (recordHistory && !same) {
					nextHistory = tab.history.slice(0, tab.historyIndex + 1)
					nextHistory.push(loc)
					nextHistoryIndex = nextHistory.length - 1
				}

				const nextTab: LocationTab = { ...tab, bucket: loc.bucket, prefix: loc.prefix, history: nextHistory, historyIndex: nextHistoryIndex }
				const out = [...prev]
				out[idx] = nextTab
				return out
			})

			if (recordHistory && b) {
				const storedPrefix = p || '/'
				setRecentPrefixesByBucket((prev) => {
					const existing = prev[b] ?? []
					const next = [storedPrefix, ...existing.filter((v) => v !== storedPrefix)].slice(0, 30)
					return { ...prev, [b]: next }
				})
			}

			setBucket(b)
			setPrefix(p)
		},
		[activeTabId, setBucket, setPrefix, setRecentPrefixesByBucket, setTabs],
	)

	const handleTreeSelect = useCallback(
		(key: string, closeDrawer: boolean) => {
			setTreeSelectedKeys([key])
			if (!bucket) return
			navigateToLocation(bucket, key === '/' ? '' : key, { recordHistory: true })
			if (closeDrawer) setTreeDrawerOpen(false)
		},
		[bucket, navigateToLocation],
	)

	const canGoBack = !!activeTab && activeTab.historyIndex > 0
	const canGoForward = !!activeTab && activeTab.historyIndex < activeTab.history.length - 1

	const goBack = () => {
		setTabs((prev) => {
			const idx = prev.findIndex((t) => t.id === activeTabId)
			if (idx === -1) return prev
			const tab = prev[idx]
			if (tab.historyIndex <= 0) return prev
			const nextIndex = tab.historyIndex - 1
			const loc = tab.history[nextIndex]
			if (!loc) return prev
			const out = [...prev]
			out[idx] = { ...tab, bucket: loc.bucket, prefix: loc.prefix, historyIndex: nextIndex }
			return out
		})
	}

	const goForward = () => {
		setTabs((prev) => {
			const idx = prev.findIndex((t) => t.id === activeTabId)
			if (idx === -1) return prev
			const tab = prev[idx]
			if (tab.historyIndex >= tab.history.length - 1) return prev
			const nextIndex = tab.historyIndex + 1
			const loc = tab.history[nextIndex]
			if (!loc) return prev
			const out = [...prev]
			out[idx] = { ...tab, bucket: loc.bucket, prefix: loc.prefix, historyIndex: nextIndex }
			return out
		})
	}

	const addTab = () => {
		const id = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
		const tab: LocationTab = { id, bucket, prefix, history: [{ bucket, prefix }], historyIndex: 0 }
		setTabs((prev) => [...prev, tab])
		setActiveTabId(id)
	}

	const closeTab = (id: string) => {
		setTabs((prev) => {
			if (prev.length <= 1) return prev
			const idx = prev.findIndex((t) => t.id === id)
			if (idx === -1) return prev
			const next = prev.filter((t) => t.id !== id)
			if (activeTabId === id) {
				const nextActive = next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? ''
				setActiveTabId(nextActive)
			}
			return next
		})
	}

	const pathOptions = useMemo(() => {
		if (!bucket) return []
		const bookmarks = bookmarksByBucket[bucket] ?? []
		const recent = recentPrefixesByBucket[bucket] ?? []
		const all = [...bookmarks, ...recent.filter((p) => !bookmarks.includes(p))]
		const q = pathDraft.trim().toLowerCase()
		const filtered = q ? all.filter((p) => p.toLowerCase().includes(q)) : all
		return filtered.slice(0, 30).map((p) => ({ value: p }))
	}, [bookmarksByBucket, bucket, pathDraft, recentPrefixesByBucket])

	const normalizedCurrentPrefix = normalizePathInput(prefix)
	const storedCurrentPrefix = normalizedCurrentPrefix || '/'
	const isBookmarked = !!bucket && (bookmarksByBucket[bucket] ?? []).includes(storedCurrentPrefix)
	const toggleBookmark = () => {
		if (!bucket) return
		const p = storedCurrentPrefix
		setBookmarksByBucket((prev) => {
			const existing = prev[bucket] ?? []
			const next = existing.includes(p) ? existing.filter((v) => v !== p) : [p, ...existing].slice(0, 50)
			return { ...prev, [bucket]: next }
		})
	}

	const canGoUp = !!bucket && !!prefix && prefix.includes('/')
	const onUp = () => {
		if (!bucket) return
		const p = prefix.replace(/\/+$/, '')
		const idx = p.lastIndexOf('/')
		const next = idx === -1 ? '' : p.slice(0, idx + 1)
		navigateToLocation(bucket, next, { recordHistory: true })
	}

	const onOpenPrefix = (p: string) => {
		if (!bucket) return
		navigateToLocation(bucket, p, { recordHistory: true })
	}

	const commitPathDraft = () => {
		if (!bucket) {
			message.info('Select a bucket first')
			return
		}
		navigateToLocation(bucket, pathDraft, { recordHistory: true })
		setPathModalOpen(false)
	}

	const refresh = async () => {
		if (favoritesOnly) {
			await favoritesQuery.refetch()
			return
		}
		await Promise.all([objectsQuery.refetch(), favoritesQuery.refetch()])
	}

	const toggleSortColumn = (col: 'name' | 'size' | 'time') => {
		if (col === 'name') {
			setSort(sort === 'name_asc' ? 'name_desc' : 'name_asc')
			return
		}
		if (col === 'size') {
			setSort(sort === 'size_asc' ? 'size_desc' : 'size_asc')
			return
		}
		if (col === 'time') {
			setSort(sort === 'time_asc' ? 'time_desc' : 'time_asc')
			return
		}
	}

	const sortDirForColumn = (col: 'name' | 'size' | 'time'): 'asc' | 'desc' | null => {
		if (col === 'name') {
			if (sort === 'name_asc') return 'asc'
			if (sort === 'name_desc') return 'desc'
			return null
		}
		if (col === 'size') {
			if (sort === 'size_asc') return 'asc'
			if (sort === 'size_desc') return 'desc'
			return null
		}
		if (col === 'time') {
			if (sort === 'time_asc') return 'asc'
			if (sort === 'time_desc') return 'desc'
			return null
		}
		return null
	}

	const { handleFavoriteSelect } = useObjectsSelectionEffects({
		bucket,
		prefix,
		profileId: props.profileId,
		favoritesOpenDetails,
		navigateToLocation,
		setDetailsOpen,
		setDetailsDrawerOpen,
		setTreeDrawerOpen,
		setSelectedKeys,
		setLastSelectedObjectKey,
	})
	const { openDetails, openDetailsForKey, toggleDetails } = useObjectsDetailsActions({
		dockDetails,
		setDetailsOpen,
		setDetailsDrawerOpen,
		setSelectedKeys,
		setLastSelectedObjectKey,
	})
	const {
		renameOpen,
		renameKind,
		renameSource,
		renameForm,
		renameSubmitting,
		openRenameObject,
		openRenamePrefix,
		handleRenameSubmit,
		handleRenameCancel,
	} = useObjectsRename({
		profileId: props.profileId,
		bucket,
		createJobWithRetry,
		onJobsLinkClick: handleJobsLinkClick,
	})
	const { presignOpen, presign, presignKey, presignMutation, closePresign } = useObjectsPresign({
		api,
		profileId: props.profileId,
		bucket,
		downloadLinkProxyEnabled,
	})
	const {
		copyMoveOpen,
		copyMoveMode,
		copyMoveSrcKey,
		copyMoveForm,
		copyMoveSubmitting,
		openCopyMove,
		handleCopyMoveSubmit,
		handleCopyMoveCancel,
		copyPrefixOpen,
		copyPrefixMode,
		copyPrefixSrcPrefix,
		copyPrefixForm,
		copyPrefixSubmitting,
		openCopyPrefix,
		handleCopyPrefixSubmit,
		handleCopyPrefixCancel,
	} = useObjectsCopyMove({
		profileId: props.profileId,
		bucket,
		prefix,
		createJobWithRetry,
		splitLines,
	})
	const { deletingKey, deleteMutation, deletePrefixJobMutation } = useObjectsDelete({
		api,
		profileId: props.profileId,
		bucket,
		createJobWithRetry,
		setSelectedKeys,
	})
	const {
		newFolderOpen,
		newFolderForm,
		newFolderSubmitting,
		openNewFolder,
		handleNewFolderSubmit,
		handleNewFolderCancel,
	} = useObjectsNewFolder({
		api,
		profileId: props.profileId,
		bucket,
		prefix,
		refreshTreeNode,
	})
	const {
		downloadPrefixOpen,
		downloadPrefixForm,
		downloadPrefixSubmitting,
		downloadPrefixCanSubmit,
		openDownloadPrefix,
		handleDownloadPrefixSubmit,
		handleDownloadPrefixCancel,
		handleDownloadPrefixPick,
	} = useObjectsDownloadPrefix({
		api,
		profileId: props.profileId,
		bucket,
		prefix,
		transfers,
	})
	const {
		uploadDropActive,
		startUploadFromFiles,
		onUploadDragEnter,
		onUploadDragLeave,
		onUploadDragOver,
		onUploadDrop,
	} = useObjectsUploadDrop({
		profileId: props.profileId,
		bucket,
		prefix,
		isOffline,
		transfers,
	})
	const {
		deletePrefixConfirmOpen,
		deletePrefixConfirmDryRun,
		deletePrefixConfirmPrefix,
		deletePrefixConfirmText,
		setDeletePrefixConfirmText,
		confirmDeleteObjects,
		confirmDeleteSelected,
		confirmDeletePrefixAsJob,
		handleDeletePrefixConfirm,
		handleDeletePrefixCancel,
	} = useObjectsDeleteConfirm({
		profileId: props.profileId,
		bucket,
		prefix,
		selectedKeys,
		deleteMutation,
		deletePrefixJobMutation,
	})
	const {
		summaryQuery: deletePrefixSummaryQuery,
		summary: deletePrefixSummary,
		summaryNotIndexed: deletePrefixSummaryNotIndexed,
		summaryError: deletePrefixSummaryError,
	} = useObjectsPrefixSummary({
		api,
		profileId: props.profileId,
		bucket,
		prefix: deletePrefixConfirmPrefix,
		apiToken: props.apiToken,
		enabled: deletePrefixConfirmOpen,
	})
	const {
		summaryQuery: copyPrefixSummaryQuery,
		summary: copyPrefixSummary,
		summaryNotIndexed: copyPrefixSummaryNotIndexed,
		summaryError: copyPrefixSummaryError,
	} = useObjectsPrefixSummary({
		api,
		profileId: props.profileId,
		bucket,
		prefix: copyPrefixSrcPrefix,
		apiToken: props.apiToken,
		enabled: copyPrefixOpen,
	})
	const {
		uploadFolderOpen,
		uploadFolderForm,
		uploadFolderSubmitting,
		uploadFolderCanSubmit,
		openUploadFolderModal,
		handleUploadFolderSubmit,
		handleUploadFolderCancel,
		handleUploadFolderPick,
	} = useObjectsUploadFolder({
		profileId: props.profileId,
		bucket,
		prefix,
		transfers,
	})

	useEffect(() => {
		return () => {
			thumbnailCache.clear()
		}
	}, [bucket, props.profileId, thumbnailCache])

	useEffect(() => {
		if (!showThumbnails) {
			thumbnailCache.clear()
		}
	}, [showThumbnails, thumbnailCache])

	const indexedSearchItems = indexedSearchQuery.data?.pages.flatMap((p) => p.items) ?? []
	const indexedSearchNotIndexed = indexedSearchQuery.error instanceof APIError && indexedSearchQuery.error.code === 'not_indexed'
	const indexedSearchErrorMessage = indexedSearchQuery.isError ? formatErr(indexedSearchQuery.error) : ''

	const objectByKey = useMemo(() => {
		const out = new Map<string, ObjectItem>()
		if (favoritesOnly) {
			for (const obj of favoriteItems) out.set(obj.key, obj)
			return out
		}
		for (const p of objectsQuery.data?.pages ?? []) {
			for (const obj of p.items) out.set(obj.key, obj)
		}
		return out
	}, [favoriteItems, favoritesOnly, objectsQuery.data])
	const singleSelectedKey = selectedCount === 1 ? Array.from(selectedKeys)[0] : null
	const singleSelectedItem = singleSelectedKey ? objectByKey.get(singleSelectedKey) : undefined
	const detailsKey = detailsVisible ? singleSelectedKey : null
	const detailsMetaQuery = useQuery({
		queryKey: ['objectMeta', props.profileId, bucket, detailsKey, props.apiToken],
		enabled: !!props.profileId && !!bucket && !!detailsKey && detailsVisible,
		queryFn: () => api.getObjectMeta({ profileId: props.profileId!, bucket, key: detailsKey! }),
		retry: false,
	})
	const detailsMeta = detailsMetaQuery.data ?? null

	const { preview, loadPreview, cancelPreview, canCancelPreview } = useObjectPreview({
		api,
		profileId: props.profileId,
		bucket,
		detailsKey,
		detailsVisible,
		detailsMeta,
		downloadLinkProxyEnabled,
	})

	const rowVirtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollContainerRef.current,
		estimateSize: () => (isCompactList ? COMPACT_ROW_HEIGHT_PX : WIDE_ROW_HEIGHT_PX),
		overscan: 10,
		scrollMargin,
	})

	const virtualItems = rowVirtualizer.getVirtualItems()
	const virtualItemsForRender = useMemo(
		() => virtualItems.map((vi) => ({ index: vi.index, start: vi.start - scrollMargin })),
		[scrollMargin, virtualItems],
	)
	const totalSize = rowVirtualizer.getTotalSize()

	useEffect(() => {
		scrollContainerRef.current?.scrollTo({ top: 0 })
	}, [bucket, extFilter, favoritesFirst, favoritesOnly, maxModifiedMs, maxSize, minModifiedMs, minSize, prefix, search, sort, typeFilter])

	useEffect(() => {
		if (!bucket) {
			setAutoScanReady(false)
			return
		}
		setAutoScanReady(false)
		const id = window.setTimeout(() => setAutoScanReady(true), 400)
		return () => window.clearTimeout(id)
	}, [bucket, prefix])

	useEffect(() => {
		if (!bucket) return
		if (!objectsQuery.data) return
		if (objectsQuery.isFetching) return
		setAutoScanReady(true)
	}, [bucket, objectsQuery.data, objectsQuery.isFetching])

	const hasActiveFilters =
		typeFilter !== 'all' ||
		favoritesOnly ||
		!!extFilter.trim() ||
		minSize != null ||
		maxSize != null ||
		minModifiedMs != null ||
		maxModifiedMs != null
	const hasNonDefaultSort = sort !== 'name_asc' || favoritesFirst
	const hasActiveView = hasActiveFilters || hasNonDefaultSort
	const resetFilters = () => {
		setTypeFilter('all')
		setFavoritesOnly(false)
		setFavoritesFirst(false)
		setExtFilter('')
		setMinSize(null)
		setMaxSize(null)
		setMinModifiedMs(null)
		setMaxModifiedMs(null)
		setSort('name_asc')
	}

	const openUploadFilesPicker = () => {
		if (isOffline) {
			message.warning('Offline: uploads are disabled.')
			return
		}
		uploadFilesInputRef.current?.click()
	}
	const openUploadFolderPicker = () => {
		if (isOffline) {
			message.warning('Offline: uploads are disabled.')
			return
		}
		const support = getDevicePickerSupport()
		if (support.ok) {
			openUploadFolderModal()
			return
		}
		uploadFolderInputRef.current?.click()
	}

	const breadcrumbItems: { title: ReactNode }[] = (() => {
				const parts = prefix.split('/').filter(Boolean)
				const items: { title: ReactNode }[] = []
				const canNavigate = !!bucket

				const wrap = (targetPrefixRaw: string, node: ReactNode) => {
					const target = normalizeDropTargetPrefix(targetPrefixRaw)
					const active = canDragDrop && dndHoverPrefix === target
					return (
						<span
							onDragOver={(e) => onDndTargetDragOver(e, targetPrefixRaw)}
							onDragLeave={(e) => onDndTargetDragLeave(e, targetPrefixRaw)}
							onDrop={(e) => onDndTargetDrop(e, targetPrefixRaw)}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								paddingInline: 4,
								borderRadius: 4,
								background: active ? 'rgba(22, 119, 255, 0.12)' : undefined,
							}}
						>
							{node}
						</span>
					)
				}

				const linkToPrefix = (targetPrefix: string, label: string) => (
					<Button
						type="link"
						size="small"
						onClick={() => (canNavigate ? navigateToLocation(bucket, targetPrefix, { recordHistory: true }) : undefined)}
						disabled={!canNavigate}
						style={{ padding: 0, height: 'auto', whiteSpace: 'nowrap' }}
					>
						{label}
					</Button>
				)

				items.push({
					title: wrap('', linkToPrefix('', '(root)')),
				})

				if (!parts.length) return items

				if (!screens.md && parts.length > 2) {
					const collapsedParts = parts.slice(0, -1)
					const collapsedPrefix = normalizePrefix(collapsedParts.join('/'))
					const menuItems = collapsedParts.map((part, index) => {
						const targetPrefix = normalizePrefix(collapsedParts.slice(0, index + 1).join('/'))
						return {
							key: targetPrefix || part,
							label: targetPrefix,
							disabled: !canNavigate,
							onClick: () => (canNavigate ? navigateToLocation(bucket, targetPrefix, { recordHistory: true }) : undefined),
						}
					})

					items.push({
						title: wrap(
							collapsedPrefix,
							<Dropdown trigger={['click']} menu={{ items: menuItems }} disabled={!canNavigate}>
								<Button type="link" size="small" disabled={!canNavigate} style={{ padding: 0, height: 'auto', whiteSpace: 'nowrap' }}>
									.../
								</Button>
							</Dropdown>,
						),
					})

					const lastPart = parts[parts.length - 1]
					const lastPrefix = normalizePrefix(`${collapsedPrefix}${lastPart}`)
					items.push({
						title: wrap(lastPrefix, linkToPrefix(lastPrefix, `${lastPart}/`)),
					})

					return items
				}

				let current = ''
				for (const part of parts) {
					current += part + '/'
					items.push({
						title: wrap(current, linkToPrefix(current, `${part}/`)),
					})
				}

				return items
			})()

	/*
	 * Transfers were refactored into a global provider (`frontend/src/components/Transfers.tsx`).
	 * The old local queue implementation is kept temporarily for reference.
	 */
	/*
	const downloadConcurrency = isWideDesktop ? 3 : 2
	const uploadConcurrency = 1
	
	const updateDownloadTask = useCallback((taskId: string, updater: (task: DownloadTask) => DownloadTask) => {
	setDownloadTasks((prev) => prev.map((t) => (t.id === taskId ? updater(t) : t)))
	}, [])
	
	const cancelDownloadTask = useCallback(
	(taskId: string) => {
	const abort = downloadAbortByTaskIdRef.current[taskId]
	if (abort) abort()
	updateDownloadTask(taskId, (t) => ({ ...t, status: 'canceled', finishedAtMs: Date.now() }))
	},
	[updateDownloadTask],
	)
	
	const retryDownloadTask = useCallback(
	(taskId: string) => {
	updateDownloadTask(taskId, (t) => ({
		...t,
		status: 'queued',
		startedAtMs: undefined,
		finishedAtMs: undefined,
		loadedBytes: 0,
		speedBps: 0,
		etaSeconds: 0,
		error: undefined,
	}))
	},
	[updateDownloadTask],
	)
	
	const removeDownloadTask = useCallback(
	(taskId: string) => {
	const abort = downloadAbortByTaskIdRef.current[taskId]
	if (abort) abort()
	delete downloadAbortByTaskIdRef.current[taskId]
	delete downloadEstimatorByTaskIdRef.current[taskId]
	setDownloadTasks((prev) => prev.filter((t) => t.id !== taskId))
	},
	[],
	)
	
	const clearCompletedDownloads = useCallback(() => {
	setDownloadTasks((prev) => prev.filter((t) => t.status !== 'succeeded'))
	}, [])
	
	const startDownloadTask = useCallback(
	async (taskId: string) => {
	const profileId = props.profileId
	if (!profileId) return
	
	const current = downloadTasksRef.current.find((t) => t.id === taskId)
	if (!current || current.status !== 'queued') return
	
	const estimator = new TransferEstimator({ totalBytes: current.totalBytes })
	downloadEstimatorByTaskIdRef.current[taskId] = estimator
	updateDownloadTask(taskId, (t) => ({
		...t,
		status: 'running',
		startedAtMs: estimator.getStartedAtMs(),
		finishedAtMs: undefined,
		loadedBytes: 0,
		speedBps: 0,
		etaSeconds: 0,
		error: undefined,
	}))
	
	const handle =
		current.kind === 'object'
			? api.downloadObject(
					{ profileId, bucket: current.bucket, key: current.key },
					{
						onProgress: (p) => {
							const e = downloadEstimatorByTaskIdRef.current[taskId]
							if (!e) return
							const stats = e.update(p.loadedBytes, p.totalBytes)
							updateDownloadTask(taskId, (t) => ({
								...t,
								loadedBytes: stats.loadedBytes,
								totalBytes: stats.totalBytes ?? t.totalBytes,
								speedBps: stats.speedBps,
								etaSeconds: stats.etaSeconds,
							}))
						},
					},
				)
			: api.downloadJobArtifact(
					{ profileId, jobId: current.jobId },
					{
						onProgress: (p) => {
							const e = downloadEstimatorByTaskIdRef.current[taskId]
							if (!e) return
							const stats = e.update(p.loadedBytes, p.totalBytes)
							updateDownloadTask(taskId, (t) => ({
								...t,
								loadedBytes: stats.loadedBytes,
								totalBytes: stats.totalBytes ?? t.totalBytes,
								speedBps: stats.speedBps,
								etaSeconds: stats.etaSeconds,
							}))
						},
					},
				)
	
	downloadAbortByTaskIdRef.current[taskId] = handle.abort
	
	try {
		const resp = await handle.promise
		const fallbackName =
			current.kind === 'object'
				? defaultFilenameFromKey(current.key)
				: current.filenameHint?.trim() || `job-${current.jobId}.zip`
		const filename = filenameFromContentDisposition(resp.contentDisposition) ?? (current.filenameHint?.trim() || fallbackName)
		saveBlob(resp.blob, filename)
		updateDownloadTask(taskId, (t) => ({
			...t,
			status: 'succeeded',
			finishedAtMs: Date.now(),
			loadedBytes: typeof t.totalBytes === 'number' ? t.totalBytes : t.loadedBytes,
			filenameHint: filename,
		}))
		message.success(`Downloaded ${filename}`)
	} catch (err) {
		if (err instanceof RequestAbortedError) {
			updateDownloadTask(taskId, (t) => ({ ...t, status: 'canceled', finishedAtMs: Date.now() }))
			return
		}
		const msg = formatErr(err)
		updateDownloadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: msg }))
		message.error(msg)
	} finally {
		delete downloadAbortByTaskIdRef.current[taskId]
		delete downloadEstimatorByTaskIdRef.current[taskId]
	}
	},
	[api, props.profileId, updateDownloadTask],
	)
	
	useEffect(() => {
	if (!props.profileId) return
	const running = downloadTasks.filter((t) => t.status === 'running').length
	const capacity = downloadConcurrency - running
	if (capacity <= 0) return
	const toStart = downloadTasks.filter((t) => t.status === 'queued').slice(0, capacity)
	for (const t of toStart) void startDownloadTask(t.id)
	}, [downloadConcurrency, downloadTasks, props.profileId, startDownloadTask])
	
	const hasWaitingJobArtifactDownloads = downloadTasks.some((t) => t.kind === 'job_artifact' && t.status === 'waiting')
	useEffect(() => {
	if (!props.profileId) return
	if (!hasWaitingJobArtifactDownloads) return
	
	let stopped = false
	const tick = async () => {
	const waiting = downloadTasksRef.current.filter(
		(t): t is JobArtifactDownloadTask => t.kind === 'job_artifact' && t.status === 'waiting',
	)
	for (const t of waiting) {
		if (stopped) return
		try {
			const job = await api.getJob(props.profileId!, t.jobId)
			if (stopped) return
	
			if (job.status === 'succeeded') {
				updateDownloadTask(t.id, (prev) => ({ ...prev, status: 'queued', error: undefined }))
				continue
			}
			if (job.status === 'failed') {
				updateDownloadTask(t.id, (prev) => ({
					...prev,
					status: 'failed',
					finishedAtMs: Date.now(),
					error: job.error ?? 'job failed',
				}))
				continue
			}
			if (job.status === 'canceled') {
				updateDownloadTask(t.id, (prev) => ({
					...prev,
					status: 'canceled',
					finishedAtMs: Date.now(),
					error: job.error ?? prev.error,
				}))
			}
		} catch (err) {
			updateDownloadTask(t.id, (prev) => ({ ...prev, error: formatErr(err) }))
		}
	}
	}
	
	void tick()
	const id = window.setInterval(() => void tick(), 1500)
	return () => {
		stopped = true
		window.clearInterval(id)
	}
	}, [api, hasWaitingJobArtifactDownloads, props.profileId, updateDownloadTask])
	
		const bucketName = bucket
	const existing = downloadTasksRef.current.find(
		(t) => t.kind === 'object' && t.bucket === bucketName && t.key === key && (t.status === 'queued' || t.status === 'running'),
	)
	if (existing) {
		setTransfersTab('downloads')
		setDownloadsOpen(true)
		message.info('Download already queued')
		return
	}
	
	const totalBytes = typeof expectedBytes === 'number' && expectedBytes >= 0 ? expectedBytes : undefined
	const taskId =
		typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `${Date.now()}_${Math.random().toString(16).slice(2)}`
	const task: ObjectDownloadTask = {
		id: taskId,
		kind: 'object',
		label: displayNameForKey(key, prefix),
		status: 'queued',
		createdAtMs: Date.now(),
		loadedBytes: 0,
		totalBytes,
		speedBps: 0,
		etaSeconds: 0,
		bucket: bucketName,
		key,
		filenameHint: defaultFilenameFromKey(key),
	}
	
	setDownloadTasks((prev) => [task, ...prev])
	setTransfersTab('downloads')
	setDownloadsOpen(true)
	}
	
	const updateUploadTask = useCallback((taskId: string, updater: (task: UploadTask) => UploadTask) => {
	setUploadTasks((prev) => prev.map((t) => (t.id === taskId ? updater(t) : t)))
	}, [])
	
	const cancelUploadTask = useCallback(
	(taskId: string) => {
		const abort = uploadAbortByTaskIdRef.current[taskId]
		if (abort) abort()
		updateUploadTask(taskId, (t) => {
			if (t.status === 'succeeded') return t
			return { ...t, status: 'canceled', finishedAtMs: Date.now() }
		})
	},
	[updateUploadTask],
	)
	
	const retryUploadTask = useCallback(
	(taskId: string) => {
		updateUploadTask(taskId, (t) => ({
			...t,
			status: 'queued',
			startedAtMs: undefined,
			finishedAtMs: undefined,
			loadedBytes: 0,
			speedBps: 0,
			etaSeconds: 0,
			error: undefined,
			jobId: undefined,
		}))
	},
	[updateUploadTask],
	)
	
	const removeUploadTask = useCallback((taskId: string) => {
	const abort = uploadAbortByTaskIdRef.current[taskId]
	if (abort) abort()
	delete uploadAbortByTaskIdRef.current[taskId]
	delete uploadEstimatorByTaskIdRef.current[taskId]
	delete uploadItemsByTaskIdRef.current[taskId]
	setUploadTasks((prev) => prev.filter((t) => t.id !== taskId))
	}, [])
	
	const clearCompletedUploads = useCallback(() => {
	setUploadTasks((prev) => {
		for (const t of prev) {
			if (t.status !== 'succeeded') continue
			delete uploadAbortByTaskIdRef.current[t.id]
			delete uploadEstimatorByTaskIdRef.current[t.id]
			delete uploadItemsByTaskIdRef.current[t.id]
		}
		return prev.filter((t) => t.status !== 'succeeded')
	})
	}, [])
	
	const clearAllTransfers = useCallback(() => {
	for (const abort of Object.values(downloadAbortByTaskIdRef.current)) abort()
	for (const abort of Object.values(uploadAbortByTaskIdRef.current)) abort()
	downloadAbortByTaskIdRef.current = {}
	downloadEstimatorByTaskIdRef.current = {}
	uploadAbortByTaskIdRef.current = {}
	uploadEstimatorByTaskIdRef.current = {}
	uploadItemsByTaskIdRef.current = {}
	setDownloadTasks([])
	setUploadTasks([])
	}, [])
	
	const startUploadTask = useCallback(
	async (taskId: string) => {
		const profileId = props.profileId
		if (!profileId) return
	
		const current = uploadTasksRef.current.find((t) => t.id === taskId)
		if (!current || current.status !== 'queued') return
	
		const items = uploadItemsByTaskIdRef.current[taskId]
		if (!items || items.length === 0) {
			updateUploadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: 'missing files (remove and re-add)' }))
			return
		}
	
		const estimator = new TransferEstimator({ totalBytes: current.totalBytes })
		uploadEstimatorByTaskIdRef.current[taskId] = estimator
		updateUploadTask(taskId, (t) => ({
			...t,
			status: 'staging',
			startedAtMs: estimator.getStartedAtMs(),
			finishedAtMs: undefined,
			loadedBytes: 0,
			speedBps: 0,
			etaSeconds: 0,
			error: undefined,
			jobId: undefined,
		}))
	
		let committed = false
		let uploadId = ''
		try {
			const session = await api.createUpload(profileId, { bucket: current.bucket, prefix: current.prefix })
			uploadId = session.uploadId
			if (session.maxBytes && current.totalBytes > session.maxBytes) {
				throw new Error(`selected files exceed maxBytes (${current.totalBytes} > ${session.maxBytes})`)
			}
	
			const handle = api.uploadFilesWithProgress(profileId, uploadId, items, {
				onProgress: (p) => {
					const e = uploadEstimatorByTaskIdRef.current[taskId]
					if (!e) return
					const stats = e.update(p.loadedBytes, p.totalBytes)
					updateUploadTask(taskId, (t) => ({
						...t,
						loadedBytes: stats.loadedBytes,
						totalBytes: stats.totalBytes ?? t.totalBytes,
						speedBps: stats.speedBps,
						etaSeconds: stats.etaSeconds,
					}))
				},
			})
			uploadAbortByTaskIdRef.current[taskId] = handle.abort
			await handle.promise
			delete uploadAbortByTaskIdRef.current[taskId]
	
			updateUploadTask(taskId, (t) => ({
				...t,
				status: 'commit',
				loadedBytes: t.totalBytes,
				speedBps: 0,
				etaSeconds: 0,
			}))
	
			const resp = await commitUploadWithRetry(profileId, uploadId)
			committed = true
			delete uploadItemsByTaskIdRef.current[taskId]
			updateUploadTask(taskId, (t) => ({
				...t,
				status: 'succeeded',
				finishedAtMs: Date.now(),
				jobId: resp.jobId,
			}))
	
			message.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>Upload committed (job {resp.jobId})</Typography.Text>
						<Button size="small" type="link" href="/jobs" onClick={handleJobsLinkClick}>
							Open Jobs
						</Button>
						<Button size="small" type="link" onClick={() => setDownloadsOpen(true)}>
							Open Transfers
						</Button>
					</Space>
				),
				duration: 6,
			})
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		} catch (err) {
			if (err instanceof RequestAbortedError) {
				updateUploadTask(taskId, (t) => ({ ...t, status: 'canceled', finishedAtMs: Date.now() }))
				message.info('Upload canceled')
				return
			}
			const msg = formatErr(err)
			updateUploadTask(taskId, (t) => ({ ...t, status: 'failed', finishedAtMs: Date.now(), error: msg }))
			message.error(msg)
		} finally {
			delete uploadAbortByTaskIdRef.current[taskId]
			delete uploadEstimatorByTaskIdRef.current[taskId]
			if (!committed && uploadId) {
				await api.deleteUpload(profileId, uploadId).catch(() => {})
			}
		}
	},
	[api, navigate, props.profileId, queryClient, updateUploadTask],
	)
	
	useEffect(() => {
	if (!props.profileId) return
	const running = uploadTasks.filter((t) => t.status === 'staging' || t.status === 'commit').length
	const capacity = uploadConcurrency - running
	if (capacity <= 0) return
	const toStart = uploadTasks.filter((t) => t.status === 'queued').slice(0, capacity)
	for (const t of toStart) void startUploadTask(t.id)
	}, [props.profileId, startUploadTask, uploadConcurrency, uploadTasks])
	
	const queueUploadFromFiles = useCallback(
	(files: File[]) => {
		if (!props.profileId) {
			message.info('Select a profile first')
			return
		}
		if (!bucket) {
			message.info('Select a bucket first')
			return
		}
		const cleanedFiles = files.filter((f) => !!f)
		if (cleanedFiles.length === 0) return
	
		const taskId =
			typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
				? crypto.randomUUID()
				: `${Date.now()}_${Math.random().toString(16).slice(2)}`
		const items: UploadFileItem[] = cleanedFiles.map((file) => {
			const relPath = ((file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '').trim()
			return { file, relPath: relPath || file.name }
		})
		const totalBytes = items.reduce((sum, i) => sum + (i.file.size ?? 0), 0)
		const label =
			items.length === 1 ? `Upload: ${items[0]?.file?.name ?? '1 file'}` : `Upload: ${items.length} file(s)`
	
		uploadItemsByTaskIdRef.current[taskId] = items
		const task: UploadTask = {
			id: taskId,
			bucket,
			prefix,
			fileCount: items.length,
			status: 'queued',
			createdAtMs: Date.now(),
			loadedBytes: 0,
			totalBytes,
			speedBps: 0,
			etaSeconds: 0,
			error: undefined,
			jobId: undefined,
			label,
		}
		setUploadTasks((prev) => [task, ...prev])
		setTransfersTab('uploads')
		setDownloadsOpen(true)
	},
	[bucket, prefix, props.profileId, setTransfersTab],
	)
	
	*/

	const { hasNextPage, isFetchingNextPage, fetchNextPage } = objectsQuery

	const { showLoadMore, loadMoreLabel, handleLoadMore } = useObjectsAutoScan({
		favoritesOnly,
		profileId: props.profileId,
		bucket,
		prefix,
		search,
		isAdvanced,
		extFilter,
		minSize,
		maxSize,
		minModifiedMs,
		maxModifiedMs,
		typeFilter,
		rawTotalCount,
		rowsLength: rows.length,
		virtualItems,
		autoScanReady,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
		debugEnabled: debugObjectsList,
		log: logObjectsDebug,
	})
	const { onDownload, onDownloadToDevice, handleDownloadSelected } = useObjectDownloads({
		profileId: props.profileId,
		bucket,
		prefix,
		selectedKeys,
		selectedCount,
		objectByKey,
		transfers,
		onZipObjects: (keys) => zipObjectsJobMutation.mutate({ keys }),
	})
	const { clipboardObjects, onCopy, copySelectionToClipboard, pasteClipboardObjects } = useObjectsClipboard({
		profileId: props.profileId,
		bucket,
		prefix,
		selectedKeys,
		createJobWithRetry,
		queryClient,
		onJobsLinkClick: handleJobsLinkClick,
	})
	const {
		dndHoverPrefix,
		normalizeDropTargetPrefix,
		onDndTargetDragOver,
		onDndTargetDragLeave,
		onDndTargetDrop,
		onRowDragStartObjects,
		onRowDragStartPrefix,
		clearDndHover,
	} = useObjectsDnd({
		profileId: props.profileId,
		bucket,
		prefix,
		canDragDrop,
		isDesktop,
		selectedKeys,
		setSelectedKeys,
		setLastSelectedObjectKey,
		createJobWithRetry,
		queryClient,
		onJobsLinkClick: handleJobsLinkClick,
	})

	const {
		getObjectActions,
		getPrefixActions,
		currentPrefixActionMap,
		selectionActionMap,
		selectionContextMenuActions,
		selectionMenuActions,
		globalActionMap,
		commandItems,
	} = useObjectsActionCatalog({
		isAdvanced,
		isOffline,
		profileId: props.profileId,
		bucket,
		prefix,
		selectedCount,
		clipboardObjects,
		singleSelectedKey,
		singleSelectedItemSize: singleSelectedItem?.size,
		canGoBack,
		canGoForward,
		canGoUp,
		detailsVisible,
		activeTabId,
		tabsCount: tabs.length,
		onGoBack: goBack,
		onGoForward: goForward,
		onGoUp: onUp,
		onDownload,
		onDownloadToDevice,
		onPresign: (key) => presignMutation.mutate(key),
		onCopy,
		onOpenDetailsForKey: openDetailsForKey,
		onOpenRenameObject: openRenameObject,
		onOpenCopyMove: openCopyMove,
		onConfirmDeleteObjects: confirmDeleteObjects,
		onOpenPrefix: onOpenPrefix,
		onOpenRenamePrefix: openRenamePrefix,
		onConfirmDeletePrefixAsJob: confirmDeletePrefixAsJob,
		onOpenCopyPrefix: openCopyPrefix,
		onOpenDownloadPrefix: openDownloadPrefix,
		onZipPrefix: (targetPrefix) => zipPrefixJobMutation.mutate({ prefix: targetPrefix }),
		onDownloadSelected: handleDownloadSelected,
		onCopySelectionToClipboard: (mode) => void copySelectionToClipboard(mode),
		onPasteClipboardObjects: () => void pasteClipboardObjects(),
		onClearSelection: clearSelection,
		onConfirmDeleteSelected: confirmDeleteSelected,
		onToggleDetails: toggleDetails,
		onOpenTreeDrawer: () => setTreeDrawerOpen(true),
		onRefresh: () => void refresh(),
		onOpenPathModal: openPathModal,
		onOpenUploadFiles: openUploadFilesPicker,
		onOpenUploadFolder: openUploadFolderPicker,
		onOpenNewFolder: openNewFolder,
		onOpenCommandPalette: () => setCommandPaletteOpen(true),
		onOpenTransfers: () => transfers.openTransfers(),
		onAddTab: addTab,
		onCloseTab: closeTab,
		onOpenGlobalSearch: () => setGlobalSearchOpen(true),
		onToggleUiMode: () => setUiMode(isAdvanced ? 'simple' : 'advanced'),
	})
	const {
		contextMenuClassName,
		contextMenuRef,
		contextMenuState,
		contextMenuVisible,
		contextMenuProps,
		contextMenuStyle,
		withContextMenuClassName,
		recordContextMenuPoint,
		openObjectContextMenu,
		openPrefixContextMenu,
		closeContextMenu,
		handleListScrollerContextMenu,
	} = useObjectsContextMenu({
		debugEnabled: debugContextMenu,
		log: logContextMenuDebug,
		listScrollerEl,
		scrollContainerRef,
		selectedCount,
		objectByKey,
		selectedKeys,
		getObjectActions,
		getPrefixActions,
		selectionContextMenuActions,
		globalActionMap,
		selectionActionMap,
		isAdvanced,
		ensureObjectSelected: ensureObjectSelectedForContextMenu,
	})
	const {
		open: commandPaletteOpen,
		setOpen: setCommandPaletteOpen,
		query: commandPaletteQuery,
		setQuery: setCommandPaletteQuery,
		activeIndex: commandPaletteActiveIndex,
		setActiveIndex: setCommandPaletteActiveIndex,
		filtered: commandPaletteItems,
		run: runCommandPaletteItem,
		onQueryChange: onCommandPaletteQueryChange,
		onKeyDown: onCommandPaletteKeyDown,
	} = useObjectsCommandPalette({ items: commandItems })

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault()
				setCommandPaletteOpen((prev) => !prev)
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [setCommandPaletteOpen])

	useEffect(() => {
		if (!commandPaletteOpen) return
		setCommandPaletteQuery('')
		setCommandPaletteActiveIndex(0)
		const id = window.setTimeout(() => {
			const el = document.getElementById('objectsCommandPaletteInput') as HTMLInputElement | null
			el?.focus()
		}, 0)
		return () => window.clearTimeout(id)
	}, [commandPaletteOpen, setCommandPaletteActiveIndex, setCommandPaletteQuery])

	const listGridClassName = isCompactList ? styles.listGridCompact : styles.listGridWide
	const { clearSelectionAction, deleteSelectionAction, downloadSelectionAction } = useObjectsSelectionBarActions({
		selectionActionMap,
	})
	const showUploadDropOverlay = uploadDropActive && !!props.profileId && !!bucket && !isOffline
	const uploadDropLabel = bucket ? `s3://${bucket}/${normalizePrefix(prefix)}` : '-'
	const listKeydownHandler = useObjectsListKeydownHandler({
		selectedCount,
		singleSelectedKey,
		lastSelectedObjectKey,
		orderedVisibleObjectKeys,
		visibleObjectKeys,
		rowIndexByObjectKey,
		canGoUp,
		clearSelection,
		openRenameObject,
		openNewFolder,
		copySelectionToClipboard,
		pasteClipboardObjects,
		openDetailsForKey,
		onUp,
		confirmDeleteSelected,
		setSelectedKeys,
		setLastSelectedObjectKey,
		selectRange,
		selectAllLoaded,
		scrollToIndex: (index) => rowVirtualizer.scrollToIndex(index),
	})
	const handleListScrollerScroll = () => {
		closeContextMenu(undefined, 'list_scroll')
	}
	const handleListScrollerWheel = () => {
		closeContextMenu(undefined, 'list_wheel')
	}
	const listScrollerRef = useCallback((node: HTMLDivElement | null) => {
		setListScrollerEl(node)
		scrollContainerRef.current = node?.closest('[data-scroll-container="app-content"]') as HTMLDivElement | null
	}, [])
	const getContextMenuPopupContainer = useCallback((triggerNode: HTMLElement) => {
		if (scrollContainerRef.current) return scrollContainerRef.current
		if (typeof document !== 'undefined') return document.body
		return triggerNode
	}, [])
	const handleClearSearch = () => {
		setSearchDraft('')
		setSearch('')
	}
	const canClearSearch = !!search.trim() || !!searchDraft.trim()
	const renderPrefixRow = useCallback(
		(p: string, offset: number) => {
			const prefixButtonMenuOpen =
				contextMenuState.open &&
				contextMenuState.kind === 'prefix' &&
				contextMenuState.key === p &&
				contextMenuState.source === 'button'
			return (
				<ObjectsPrefixRowItem
					key={p}
					prefixKey={p}
					currentPrefix={prefix}
					offset={offset}
					rowMinHeight={isCompactList ? COMPACT_ROW_HEIGHT_PX : WIDE_ROW_HEIGHT_PX}
					listGridClassName={listGridClassName}
					isCompact={isCompactList}
					canDragDrop={canDragDrop}
					highlightText={highlightText}
					isAdvanced={isAdvanced}
					getPrefixActions={getPrefixActions}
					withContextMenuClassName={withContextMenuClassName}
					buttonMenuOpen={prefixButtonMenuOpen}
					getPopupContainer={getContextMenuPopupContainer}
					recordContextMenuPoint={recordContextMenuPoint}
					openPrefixContextMenu={openPrefixContextMenu}
					closeContextMenu={closeContextMenu}
					onOpenPrefix={onOpenPrefix}
					onRowDragStartPrefix={onRowDragStartPrefix}
					onRowDragEnd={clearDndHover}
				/>
			)
		},
		[
			canDragDrop,
			clearDndHover,
			closeContextMenu,
			contextMenuState.key,
			contextMenuState.kind,
			contextMenuState.open,
			contextMenuState.source,
			getContextMenuPopupContainer,
			getPrefixActions,
			highlightText,
			isAdvanced,
			isCompactList,
			listGridClassName,
			onOpenPrefix,
			onRowDragStartPrefix,
			openPrefixContextMenu,
			prefix,
			recordContextMenuPoint,
			withContextMenuClassName,
		],
	)
	const renderObjectRow = useCallback(
		(object: ObjectItem, offset: number) => {
			const key = object.key
			const objectButtonMenuOpen =
				contextMenuState.open &&
				contextMenuState.kind === 'object' &&
				contextMenuState.key === key &&
				contextMenuState.source === 'button'
			const useSelectionMenu = selectedCount > 1 && selectedKeys.has(key)
			return (
				<ObjectsObjectRowItem
					key={key}
					object={object}
					currentPrefix={prefix}
					offset={offset}
					rowMinHeight={isCompactList ? COMPACT_ROW_HEIGHT_PX : WIDE_ROW_HEIGHT_PX}
					listGridClassName={listGridClassName}
					isCompact={isCompactList}
					canDragDrop={canDragDrop}
					highlightText={highlightText}
					isAdvanced={isAdvanced}
					getObjectActions={getObjectActions}
					selectionContextMenuActions={selectionContextMenuActions}
					useSelectionMenu={useSelectionMenu}
					isSelected={selectedKeys.has(key)}
					isFavorite={favoriteKeys.has(key)}
					favoriteDisabled={favoritePendingKeys.has(key) || isOffline || !props.profileId || !bucket}
					buttonMenuOpen={objectButtonMenuOpen}
					getPopupContainer={getContextMenuPopupContainer}
					recordContextMenuPoint={recordContextMenuPoint}
					openObjectContextMenu={openObjectContextMenu}
					closeContextMenu={closeContextMenu}
					onSelectObject={selectObjectFromPointerEvent}
					onSelectCheckbox={selectObjectFromCheckboxEvent}
					onRowDragStartObjects={onRowDragStartObjects}
					onRowDragEnd={clearDndHover}
					onToggleFavorite={toggleFavorite}
					api={api}
					profileId={props.profileId}
					bucket={bucket}
					showThumbnails={showThumbnails}
					thumbnailCache={thumbnailCache}
				/>
			)
		},
		[
			api,
			bucket,
			canDragDrop,
			clearDndHover,
			closeContextMenu,
			contextMenuState.key,
			contextMenuState.kind,
			contextMenuState.open,
			contextMenuState.source,
			favoriteKeys,
			favoritePendingKeys,
			getContextMenuPopupContainer,
			getObjectActions,
			highlightText,
			isAdvanced,
			isCompactList,
			isOffline,
			listGridClassName,
			onRowDragStartObjects,
			openObjectContextMenu,
			prefix,
			props.profileId,
			recordContextMenuPoint,
			selectedCount,
			selectedKeys,
			selectionContextMenuActions,
			selectObjectFromCheckboxEvent,
			selectObjectFromPointerEvent,
			showThumbnails,
			thumbnailCache,
			toggleFavorite,
			withContextMenuClassName,
		],
	)
	const listIsFetching = favoritesOnly ? favoritesQuery.isFetching : objectsQuery.isFetching
	const listIsFetchingNextPage = favoritesOnly ? false : objectsQuery.isFetchingNextPage
	const loadMoreDisabled = listIsFetching || listIsFetchingNextPage
	const canInteract = !!props.profileId && !!bucket && !isOffline
	const paneFallback = (
		<div className={styles.paneSkeleton}>
			<Typography.Text type="secondary">Loading...</Typography.Text>
		</div>
	)
	const listFallback = (
		<div className={styles.listSkeleton}>
			<Typography.Text type="secondary">Loading list...</Typography.Text>
		</div>
	)
	const controlsFallback = (
		<div className={styles.controlsSkeleton}>
			<Typography.Text type="secondary">Loading controls...</Typography.Text>
		</div>
	)
	const toolbarFallback = (
		<div className={styles.toolbarSkeleton}>
			<Typography.Text type="secondary">Loading toolbar...</Typography.Text>
		</div>
	)
	const listContent = (
		<Suspense fallback={listFallback}>
			<ObjectsListContent
				rows={rows}
				virtualItems={virtualItemsForRender}
				totalSize={totalSize}
				hasProfile={!!props.profileId}
				hasBucket={!!bucket}
				isFetching={listIsFetching}
				isFetchingNextPage={listIsFetchingNextPage}
				emptyKind={emptyKind}
				canClearSearch={canClearSearch}
				onClearSearch={handleClearSearch}
				renderPrefixRow={renderPrefixRow}
				renderObjectRow={renderObjectRow}
				showLoadMore={showLoadMore}
				loadMoreLabel={loadMoreLabel}
				loadMoreDisabled={loadMoreDisabled}
				onLoadMore={handleLoadMore}
			/>
		</Suspense>
	)

	const uploadMenuActions = trimActionDividers(
		[
			globalActionMap.get('upload_files'),
			globalActionMap.get('upload_folder'),
			{ type: 'divider' as const },
			globalActionMap.get('new_folder'),
		].filter(Boolean) as UIActionOrDivider[],
	)
	const uploadButtonMenu = buildActionMenu(uploadMenuActions, isAdvanced)
	const handleBucketChange = (value: string | null) => {
		const nextBucket = value ?? ''
		if (!nextBucket) {
			navigateToLocation('', '', { recordHistory: true })
			return
		}
		const saved = prefixByBucketRef.current[nextBucket]
		navigateToLocation(nextBucket, saved ?? '', { recordHistory: true })
	}

	const prefixMenuItems = compactMenuItems([
		actionToMenuItem(currentPrefixActionMap.get('copy'), undefined, isAdvanced),
		{ type: 'divider' as const },
		actionToMenuItem(currentPrefixActionMap.get('downloadZip'), undefined, isAdvanced),
		actionToMenuItem(currentPrefixActionMap.get('downloadToDevice'), undefined, isAdvanced),
		{ type: 'divider' as const },
		actionToMenuItem(currentPrefixActionMap.get('rename'), undefined, isAdvanced),
		actionToMenuItem(currentPrefixActionMap.get('copyJob'), undefined, isAdvanced),
		actionToMenuItem(currentPrefixActionMap.get('moveJob'), undefined, isAdvanced),
		{ type: 'divider' as const },
		actionToMenuItem(currentPrefixActionMap.get('delete'), undefined, isAdvanced),
		actionToMenuItem(currentPrefixActionMap.get('deleteDry'), undefined, isAdvanced),
	])

	const topMoreMenuItems = compactMenuItems([
		actionToMenuItem(globalActionMap.get('nav_back'), undefined, isAdvanced),
		actionToMenuItem(globalActionMap.get('nav_forward'), undefined, isAdvanced),
		actionToMenuItem(globalActionMap.get('nav_up'), undefined, isAdvanced),
		{ type: 'divider' as const },
		actionToMenuItem(globalActionMap.get('toggle_details'), undefined, isAdvanced),
		...(dockTree ? [] : [actionToMenuItem(globalActionMap.get('open_folders'), undefined, isAdvanced)]),
		{ type: 'divider' as const },
		actionToMenuItem(globalActionMap.get('refresh'), undefined, isAdvanced),
		actionToMenuItem(globalActionMap.get('go_to_path'), undefined, isAdvanced),
		...(isAdvanced
			? [
					actionToMenuItem(globalActionMap.get('upload_files'), undefined, isAdvanced),
					actionToMenuItem(globalActionMap.get('upload_folder'), undefined, isAdvanced),
					actionToMenuItem(globalActionMap.get('new_folder'), undefined, isAdvanced),
				]
			: []),
		{ type: 'divider' as const },
		actionToMenuItem(globalActionMap.get('commands'), undefined, isAdvanced),
		{ type: 'divider' as const },
		actionToMenuItem(globalActionMap.get('transfers'), undefined, isAdvanced),
		...(bucket && prefix.trim() && !isAdvanced
			? [
					{ type: 'divider' as const },
					actionToMenuItem(currentPrefixActionMap.get('downloadZip'), undefined, isAdvanced),
					actionToMenuItem(currentPrefixActionMap.get('delete'), undefined, isAdvanced),
				]
			: []),
		...(isAdvanced
			? [
					{ type: 'divider' as const },
					actionToMenuItem(globalActionMap.get('new_tab'), undefined, isAdvanced),
					actionToMenuItem(globalActionMap.get('global_search'), undefined, isAdvanced),
					...(
						prefixMenuItems.length > 0
							? [
									{
										key: 'prefix_actions',
										label: 'Folder actions',
										icon: <SnippetsOutlined />,
										disabled: !props.profileId || !bucket || !prefix.trim(),
										children: prefixMenuItems,
									},
								]
							: []
					),
				]
			: []),
		{ type: 'divider' as const },
		actionToMenuItem(globalActionMap.get('ui_mode'), undefined, isAdvanced),
	])

	const topMoreMenu = {
		items: topMoreMenuItems,
		onClick: ({ key }: { key: string }) => {
			const action = globalActionMap.get(key) ?? currentPrefixActionMap.get(key)
			if (!action || !action.enabled) return
			action.run()
		},
	}

	const openGlobalSearchPrefix = (key: string) => {
		setGlobalSearchOpen(false)
		if (!bucket) return
		navigateToLocation(bucket, parentPrefixFromKey(key), { recordHistory: true })
	}

	const openGlobalSearchDetails = (key: string) => {
		setGlobalSearchOpen(false)
		openDetailsForKey(key)
	}

	const detailsThumbnailSize = 160
	const detailsThumbnail =
		showThumbnails &&
		detailsMeta &&
		detailsKey &&
		props.profileId &&
		bucket &&
		guessPreviewKind(detailsMeta.contentType, detailsKey) === 'image' ? (
			<ObjectThumbnail
				api={api}
				profileId={props.profileId}
				bucket={bucket}
				objectKey={detailsKey}
				size={detailsThumbnailSize}
				cache={thumbnailCache}
				cacheKeySuffix={detailsMeta.etag || detailsMeta.lastModified || undefined}
				fit="contain"
			/>
		) : null

	const createIndexJob = () => {
		indexObjectsJobMutation.mutate({ prefix: indexPrefix, fullReindex: indexFullReindex })
	}

	return (
		<div className={styles.page}>
			<Typography.Title level={3} style={{ margin: 0 }}>
				Objects
			</Typography.Title>

			<input
				ref={uploadFilesInputRef}
				type="file"
				multiple
				aria-label="Select files to upload"
				style={{ display: 'none' }}
				onChange={(e) => {
					const files = Array.from(e.target.files ?? [])
					startUploadFromFiles(files)
					e.target.value = ''
				}}
			/>
			<input
				ref={uploadFolderInputRef}
				type="file"
				multiple
				aria-label="Select folder to upload"
				style={{ display: 'none' }}
				onChange={(e) => {
					const files = Array.from(e.target.files ?? [])
					startUploadFromFiles(files)
					e.target.value = ''
				}}
			/>

			<Suspense fallback={toolbarFallback}>
				<ObjectsToolbarSection
					apiToken={props.apiToken}
					profileId={props.profileId}
					bucketsErrorMessage={bucketsQuery.isError ? formatErr(bucketsQuery.error) : null}
					isAdvanced={isAdvanced}
					tabs={tabs}
					activeTabId={activeTabId}
					onTabChange={setActiveTabId}
					onTabAdd={addTab}
					onTabClose={closeTab}
					tabLabelMaxWidth={screens.md ? 320 : 220}
					toolbarProps={{
						isDesktop: !!screens.lg,
						showLabels: !!screens.sm,
						isAdvanced,
						isOffline,
						hasProfile: !!props.profileId,
						bucket,
						selectedCount,
						bucketOptions,
						bucketsLoading: bucketsQuery.isFetching,
						onBucketChange: handleBucketChange,
						onBucketDropdownVisibleChange: handleBucketDropdownVisibleChange,
						canGoBack,
						canGoForward,
						canGoUp,
						onGoBack: goBack,
						onGoForward: goForward,
						onGoUp: onUp,
						uploadMenu: uploadButtonMenu,
						onUploadFiles: openUploadFilesPicker,
						onRefresh: refresh,
						isRefreshing: listIsFetching,
						topMoreMenu,
						showPrimaryActions: !isAdvanced,
						primaryDownloadAction: downloadSelectionAction,
						primaryDeleteAction: deleteSelectionAction,
						activeTransferCount: transfers.activeTransferCount,
						onOpenTransfers: () => transfers.openTransfers(),
						dockTree,
						dockDetails,
						onOpenTree: () => setTreeDrawerOpen(true),
						onOpenDetails: () => setDetailsDrawerOpen(true),
					}}
				/>
			</Suspense>

			<ObjectsLayout
				ref={layoutRef}
				treeWidthPx={dockTree ? treeWidthUsed : 0}
				treeHandleWidthPx={treeResizeHandleWidth}
				detailsWidthPx={dockDetails ? detailsWidthUsed : 0}
				detailsHandleWidthPx={dockDetails && detailsOpen ? detailsResizeHandleWidth : 0}
				treeDocked={dockTree}
				detailsDocked={dockDetails}
				detailsOpen={detailsOpen}
			>
				<Suspense fallback={paneFallback}>
					<ObjectsTreeSection
						dockTree={dockTree}
						treeDrawerOpen={treeDrawerOpen}
						hasProfile={!!props.profileId}
						hasBucket={!!bucket}
						favorites={favoriteItems}
						favoritesSearch={favoritesSearch}
						onFavoritesSearchChange={setFavoritesSearch}
						favoritesOnly={favoritesOnly}
						onFavoritesOnlyChange={setFavoritesOnly}
						favoritesOpenDetails={favoritesOpenDetails}
						onFavoritesOpenDetailsChange={setFavoritesOpenDetails}
						onSelectFavorite={(key) => handleFavoriteSelect(key, false)}
						onSelectFavoriteFromDrawer={(key) => handleFavoriteSelect(key, true)}
						favoritesLoading={favoritesQuery.isFetching}
						favoritesError={favoritesQuery.isError ? formatErr(favoritesQuery.error) : null}
						treeData={treeData}
						onLoadData={onTreeLoadData}
						selectedKeys={treeSelectedKeys}
						expandedKeys={treeExpandedKeys}
						onExpandedKeysChange={setTreeExpandedKeys}
						onSelectKey={(key) => handleTreeSelect(key, false)}
						onSelectKeyFromDrawer={(key) => handleTreeSelect(key, true)}
						getDropTargetPrefix={normalizeDropTargetPrefix}
						canDragDrop={canDragDrop}
						dndHoverPrefix={dndHoverPrefix}
						onDndTargetDragOver={onDndTargetDragOver}
						onDndTargetDragLeave={onDndTargetDragLeave}
						onDndTargetDrop={onDndTargetDrop}
						onResizePointerDown={onTreeResizePointerDown}
						onResizePointerMove={onTreeResizePointerMove}
						onResizePointerUp={onTreeResizePointerUp}
						onCloseDrawer={() => setTreeDrawerOpen(false)}
					/>
				</Suspense>

				{contextMenuVisible && contextMenuProps && contextMenuStyle && typeof document !== 'undefined'
					? createPortal(
							<div
								ref={contextMenuRef}
								className={`${contextMenuClassName} ant-dropdown`}
								style={contextMenuStyle}
								onContextMenu={(event) => event.preventDefault()}
							>
								<Menu {...contextMenuProps} selectable={false} />
							</div>,
							document.body,
					  )
					: null}

				<ObjectsListSectionContainer
					controls={
						<Suspense fallback={controlsFallback}>
							<ObjectsListControls
								bucket={bucket}
								prefix={prefix}
								breadcrumbItems={breadcrumbItems}
								isBookmarked={isBookmarked}
								onToggleBookmark={toggleBookmark}
								onOpenPath={openPathModal}
								isCompact={isCompactList}
								searchDraft={searchDraft}
								onSearchDraftChange={setSearchDraft}
								hasActiveView={hasActiveView}
								onOpenFilters={() => setFiltersDrawerOpen(true)}
								isAdvanced={isAdvanced}
								visiblePrefixCount={visiblePrefixCount}
								visibleFileCount={visibleFileCount}
								search={search}
								hasNextPage={favoritesOnly ? false : objectsQuery.hasNextPage}
								isFetchingNextPage={favoritesOnly ? false : objectsQuery.isFetchingNextPage}
								rawTotalCount={rawTotalCount}
								searchAutoScanCap={searchAutoScanCap}
								onOpenGlobalSearch={() => {
									if (!isAdvanced) setUiMode('advanced')
									setGlobalSearchOpen(true)
								}}
								canInteract={canInteract}
								favoritesOnly={favoritesOnly}
								sort={sort}
								sortOptions={[
									{ label: 'Name (A -> Z)', value: 'name_asc' },
									{ label: 'Name (Z -> A)', value: 'name_desc' },
									{ label: 'Size (smallest)', value: 'size_asc' },
									{ label: 'Size (largest)', value: 'size_desc' },
									{ label: 'Last modified (oldest)', value: 'time_asc' },
									{ label: 'Last modified (newest)', value: 'time_desc' },
								]}
								onSortChange={(value) => setSort(value)}
								favoritesFirst={favoritesFirst}
								onFavoritesFirstChange={setFavoritesFirst}
							/>
						</Suspense>
					}
					alerts={
						<>
							{isOffline ? <Alert type="warning" showIcon message="Offline: object actions are disabled." /> : null}
							{favoritesOnly ? (
								favoritesQuery.isError ? (
									<Alert type="error" showIcon message="Failed to load favorites" description={formatErr(favoritesQuery.error)} />
								) : null
							) : objectsQuery.isError ? (
								<Alert type="error" showIcon message="Failed to list objects" description={formatErr(objectsQuery.error)} />
							) : null}
							{bucket ? null : <Alert type="info" showIcon message="Select a bucket to browse objects." />}
						</>
					}
					uploadDropActive={showUploadDropOverlay}
					uploadDropLabel={uploadDropLabel}
					onUploadDragEnter={onUploadDragEnter}
					onUploadDragLeave={onUploadDragLeave}
					onUploadDragOver={onUploadDragOver}
					onUploadDrop={onUploadDrop}
					selectionBar={
						<ObjectsSelectionBarSection
							selectedCount={selectedCount}
							singleSelectedKey={singleSelectedKey}
							singleSelectedSize={singleSelectedItem?.size}
							isAdvanced={isAdvanced}
							clearAction={clearSelectionAction}
							deleteAction={deleteSelectionAction}
							downloadAction={downloadSelectionAction}
							selectionMenuActions={selectionMenuActions}
							getObjectActions={getObjectActions}
							isDownloadLoading={zipObjectsJobMutation.isPending}
							isDeleteLoading={deleteMutation.isPending && deletingKey === null}
						/>
					}
					listHeader={
						<ObjectsListHeader
							isCompact={isCompactList}
							listGridClassName={listGridClassName}
							allLoadedSelected={allLoadedSelected}
							someLoadedSelected={someLoadedSelected}
							hasRows={visibleObjectKeys.length > 0}
							onToggleSelectAll={handleToggleSelectAll}
							sortDirForColumn={sortDirForColumn}
							onToggleSort={toggleSortColumn}
						/>
					}
					listScrollerRef={listScrollerRef}
					listScrollerTabIndex={0}
					onListScrollerClick={() => getListScrollerElement()?.focus()}
					onListScrollerKeyDown={listKeydownHandler}
					onListScrollerScroll={handleListScrollerScroll}
					onListScrollerWheel={handleListScrollerWheel}
					onListScrollerContextMenu={handleListScrollerContextMenu}
					listContent={listContent}
				/>
				<Suspense fallback={paneFallback}>
					<ObjectsDetailsPanelSection
						profileId={props.profileId}
						bucket={bucket}
						isAdvanced={isAdvanced}
						selectedCount={selectedCount}
						detailsKey={detailsKey}
						detailsMeta={detailsMeta}
						isMetaFetching={detailsMetaQuery.isFetching}
						isMetaError={detailsMetaQuery.isError}
						metaErrorMessage={detailsMetaQuery.isError ? formatErr(detailsMetaQuery.error) : ''}
						onRetryMeta={() => detailsMetaQuery.refetch()}
						onCopyKey={() => {
							if (!detailsKey) return
							onCopy(detailsKey)
						}}
						onDownload={() => {
							if (!detailsKey) return
							onDownload(detailsKey, detailsMeta?.size ?? singleSelectedItem?.size)
						}}
						onPresign={() => {
							if (!detailsKey) return
							presignMutation.mutate(detailsKey)
						}}
						isPresignLoading={presignMutation.isPending && presignKey === detailsKey}
						onCopyMove={(mode) => {
							if (!detailsKey) return
							openCopyMove(mode, detailsKey)
						}}
						onDelete={() => {
							if (!detailsKey) return
							confirmDeleteObjects([detailsKey])
						}}
						isDeleteLoading={deleteMutation.isPending && deletingKey === detailsKey}
						thumbnail={detailsThumbnail}
						preview={preview}
						onLoadPreview={loadPreview}
						onCancelPreview={cancelPreview}
						canCancelPreview={canCancelPreview}
						dockDetails={dockDetails}
						detailsOpen={detailsOpen}
						detailsDrawerOpen={detailsDrawerOpen}
						onOpenDetails={openDetails}
						onCloseDetails={() => setDetailsOpen(false)}
						onCloseDrawer={() => setDetailsDrawerOpen(false)}
						onResizePointerDown={onDetailsResizePointerDown}
						onResizePointerMove={onDetailsResizePointerMove}
						onResizePointerUp={onDetailsResizePointerUp}
					/>
				</Suspense>
			</ObjectsLayout>

			<Suspense fallback={null}>
				<ObjectsFiltersDrawer
					open={filtersDrawerOpen}
					onClose={() => setFiltersDrawerOpen(false)}
					isAdvanced={isAdvanced}
					typeFilter={typeFilter}
					onTypeFilterChange={(value) => setTypeFilter(value)}
					favoritesOnly={favoritesOnly}
					onFavoritesOnlyChange={setFavoritesOnly}
					favoritesFirst={favoritesFirst}
					onFavoritesFirstChange={setFavoritesFirst}
					extFilter={extFilter}
					extOptions={extOptions}
					onExtFilterChange={(value) => setExtFilter(value)}
					minSizeBytes={minSize}
					maxSizeBytes={maxSize}
					onMinSizeBytesChange={(value) => setMinSize(value)}
					onMaxSizeBytesChange={(value) => setMaxSize(value)}
					modifiedAfterMs={minModifiedMs}
					modifiedBeforeMs={maxModifiedMs}
					onModifiedRangeChange={(startMs, endMs) => {
						setMinModifiedMs(startMs)
						setMaxModifiedMs(endMs)
					}}
					sort={sort}
					onSortChange={(value) => setSort(value)}
					onResetView={resetFilters}
					hasActiveView={hasActiveView}
				/>

				{/* <Drawer
					open={downloadsOpen}
					onClose={() => setDownloadsOpen(false)}
					title={
					<Space size="small">
						<Typography.Text strong>Transfers</Typography.Text>
						{activeTransferCount > 0 ? <Tag color="processing">{activeTransferCount} active</Tag> : null}
					</Space>
				}
				placement="bottom"
				height={440}
				extra={
					<Space>
						<Button
							size="small"
							onClick={transfersTab === 'downloads' ? clearCompletedDownloads : clearCompletedUploads}
							disabled={transfersTab === 'downloads' ? !hasCompletedDownloads : !hasCompletedUploads}
						>
							Clear done
						</Button>
						<Button
							size="small"
							danger
							onClick={clearAllTransfers}
							disabled={downloadTasks.length + uploadTasks.length === 0}
						>
							Clear all
						</Button>
					</Space>
				}
			>
				<Tabs
					size="small"
					activeKey={transfersTab}
					onChange={(key) => setTransfersTab(key as 'downloads' | 'uploads')}
					items={[
						{
							key: 'downloads',
							label: (
								<Space size={8}>
									<Badge count={activeDownloadCount} size="small" showZero={false}>
										<DownloadOutlined />
									</Badge>
									Downloads
								</Space>
							),
							children: (
								<div style={{ paddingTop: 8 }}>
									{downloadTasks.length === 0 ? (
										<Empty description="No downloads yet" />
									) : (
										<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
											{downloadTasks.map((t) => {
												const percent = t.totalBytes && t.totalBytes > 0 ? Math.floor((t.loadedBytes / t.totalBytes) * 100) : 0
												const status =
													t.status === 'failed' ? 'exception' : t.status === 'succeeded' ? 'success' : t.status === 'running' ? 'active' : 'normal'
												const tagColor =
													t.status === 'running'
														? 'processing'
														: t.status === 'queued'
															? 'default'
															: t.status === 'waiting'
																? 'processing'
																: t.status === 'succeeded'
																	? 'success'
																	: t.status === 'failed'
																		? 'error'
																		: 'default'
												const tagText =
													t.status === 'queued'
														? 'Queued'
														: t.status === 'waiting'
															? 'Waiting'
															: t.status === 'running'
																? 'Downloading'
																: t.status === 'succeeded'
																	? 'Done'
																	: t.status === 'failed'
																		? 'Failed'
																		: 'Canceled'
												const progressText =
													t.status === 'queued' || t.status === 'waiting'
														? null
														: `${formatBytes(t.loadedBytes)}${t.totalBytes != null ? `/${formatBytes(t.totalBytes)}` : ''} · ${
																t.speedBps ? `${formatBytes(t.speedBps)}/s` : '-'
															} · ${t.etaSeconds ? `${formatDurationSeconds(t.etaSeconds)} eta` : '-'}`
												const subtitle = t.kind === 'object' ? `s3://${t.bucket}/${t.key}` : `job ${t.jobId} artifact`
												return (
													<div key={t.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, background: '#fff' }}>
														<div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
															<div style={{ minWidth: 0 }}>
																<Space size="small" wrap>
																	<Typography.Text strong ellipsis={{ tooltip: t.label }} style={{ maxWidth: 520 }}>
																		{t.label}
																	</Typography.Text>
																	<Tag color={tagColor}>{tagText}</Tag>
																</Space>
																<div style={{ marginTop: 4 }}>
																	<Typography.Text type="secondary" code ellipsis={{ tooltip: subtitle }}>
																		{subtitle}
																	</Typography.Text>
																</div>
																{t.error ? (
																	<div style={{ marginTop: 6 }}>
																		<Typography.Text type="danger">{t.error}</Typography.Text>
																	</div>
																) : null}
															</div>

															<Space size="small" wrap>
																{t.status === 'running' || t.status === 'queued' || t.status === 'waiting' ? (
																	<Button size="small" onClick={() => cancelDownloadTask(t.id)}>
																		Cancel
																	</Button>
																) : null}
																{t.status === 'failed' || t.status === 'canceled' ? (
																	<Button size="small" icon={<ReloadOutlined />} onClick={() => retryDownloadTask(t.id)}>
																		Retry
																	</Button>
																) : null}
																<Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeDownloadTask(t.id)}>
																	Remove
																</Button>
															</Space>
														</div>

														<div style={{ marginTop: 10 }}>
															<Progress
																percent={t.status === 'succeeded' ? 100 : percent}
																status={status}
																showInfo={t.status !== 'queued' && t.status !== 'waiting'}
															/>
															{progressText ? <Typography.Text type="secondary">{progressText}</Typography.Text> : null}
														</div>
													</div>
												)
											})}
										</div>
									)}
								</div>
							),
						},
						{
							key: 'uploads',
							label: (
								<Space size={8}>
									<Badge count={activeUploadCount} size="small" showZero={false}>
										<CloudUploadOutlined />
									</Badge>
									Uploads
								</Space>
							),
							children: (
								<div style={{ paddingTop: 8 }}>
									{uploadTasks.length === 0 ? (
										<Empty
											description={
												<Space direction="vertical" size={4} align="center">
													<span>No uploads yet</span>
													<Typography.Text type="secondary">Tip: drag & drop files into the object list to queue uploads.</Typography.Text>
												</Space>
											}
										/>
									) : (
										<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
											{uploadTasks.map((t) => {
												const percent = t.totalBytes > 0 ? Math.floor((t.loadedBytes / t.totalBytes) * 100) : 0
												const status =
													t.status === 'failed'
														? 'exception'
														: t.status === 'succeeded'
															? 'success'
															: t.status === 'staging' || t.status === 'commit'
																? 'active'
																: 'normal'
												const tagColor =
													t.status === 'staging' || t.status === 'commit'
														? 'processing'
														: t.status === 'queued'
															? 'default'
															: t.status === 'succeeded'
																? 'success'
																: t.status === 'failed'
																	? 'error'
																	: 'default'
												const tagText =
													t.status === 'queued'
														? 'Queued'
														: t.status === 'staging'
															? 'Uploading'
															: t.status === 'commit'
																? 'Committing'
																: t.status === 'succeeded'
																	? 'Done'
																	: t.status === 'failed'
																		? 'Failed'
																		: 'Canceled'
												const progressText =
													t.status === 'staging'
														? `${formatBytes(t.loadedBytes)}/${formatBytes(t.totalBytes)} · ${t.speedBps ? `${formatBytes(t.speedBps)}/s` : '-'} · ${
																t.etaSeconds ? `${formatDurationSeconds(t.etaSeconds)} eta` : '-'
															}`
														: t.status === 'commit'
															? 'Committing…'
															: null
												const subtitle = `s3://${t.bucket}/${normalizePrefix(t.prefix)}`
												return (
													<div key={t.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, background: '#fff' }}>
														<div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
															<div style={{ minWidth: 0 }}>
																<Space size="small" wrap>
																	<Typography.Text strong ellipsis={{ tooltip: t.label }} style={{ maxWidth: 520 }}>
																		{t.label}
																	</Typography.Text>
																	<Tag color={tagColor}>{tagText}</Tag>
																	{t.jobId ? <Tag>{t.jobId}</Tag> : null}
																</Space>
																<div style={{ marginTop: 4 }}>
																	<Typography.Text type="secondary" code ellipsis={{ tooltip: subtitle }}>
																		{subtitle}
																	</Typography.Text>
																</div>
																{t.error ? (
																	<div style={{ marginTop: 6 }}>
																		<Typography.Text type="danger">{t.error}</Typography.Text>
																	</div>
																) : null}
															</div>

															<Space size="small" wrap>
																{t.jobId ? (
																	<Button size="small" type="link" href="/jobs" onClick={handleJobsLinkClick}>
																		Jobs
																	</Button>
																) : null}
																{t.status === 'queued' || t.status === 'staging' ? (
																	<Button size="small" onClick={() => cancelUploadTask(t.id)}>
																		Cancel
																	</Button>
																) : null}
																{t.status === 'failed' || t.status === 'canceled' ? (
																	<Button size="small" icon={<ReloadOutlined />} onClick={() => retryUploadTask(t.id)}>
																		Retry
																	</Button>
																) : null}
																<Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeUploadTask(t.id)}>
																	Remove
																</Button>
															</Space>
														</div>

														<div style={{ marginTop: 10 }}>
															<Progress percent={t.status === 'queued' ? 0 : percent} status={status} showInfo={t.status !== 'queued'} />
															{progressText ? <Typography.Text type="secondary">{progressText}</Typography.Text> : null}
														</div>
													</div>
												)
											})}
										</div>
									)}
								</div>
							),
						},
					]}
				/>
			</Drawer> */}

				<ObjectsPresignModal
					open={presignOpen}
					presign={presign}
					onClose={closePresign}
				/>

				<ObjectsGoToPathModal
					open={pathModalOpen}
					bucket={bucket}
					hasProfile={!!props.profileId}
					pathDraft={pathDraft}
					options={pathOptions}
					inputRef={pathInputRef}
					onChangeDraft={setPathDraft}
					onSelectPath={(v) => {
						if (!bucket) return
						setPathDraft(v)
						navigateToLocation(bucket, v, { recordHistory: true })
						setPathModalOpen(false)
					}}
					onCommit={commitPathDraft}
					onClose={() => setPathModalOpen(false)}
				/>

				<ObjectsCommandPaletteModal
					open={commandPaletteOpen}
					query={commandPaletteQuery}
					commands={commandPaletteItems}
					activeIndex={commandPaletteActiveIndex}
					onQueryChange={onCommandPaletteQueryChange}
					onActiveIndexChange={setCommandPaletteActiveIndex}
					onRunCommand={runCommandPaletteItem}
					onCancel={() => setCommandPaletteOpen(false)}
					onKeyDown={onCommandPaletteKeyDown}
				/>

				<ObjectsDeletePrefixConfirmModal
					open={deletePrefixConfirmOpen}
					dryRun={deletePrefixConfirmDryRun}
					bucket={bucket}
					prefix={deletePrefixConfirmPrefix}
					confirmText={deletePrefixConfirmText}
					onConfirmTextChange={setDeletePrefixConfirmText}
					hasProfile={!!props.profileId}
					hasBucket={!!bucket}
					isConfirming={deletePrefixJobMutation.isPending}
					onConfirm={handleDeletePrefixConfirm}
					onCancel={handleDeletePrefixCancel}
					isSummaryFetching={deletePrefixSummaryQuery.isFetching}
					summary={deletePrefixSummary}
					summaryNotIndexed={deletePrefixSummaryNotIndexed}
					isSummaryError={deletePrefixSummaryQuery.isError}
					summaryErrorMessage={deletePrefixSummaryError}
					onIndexPrefix={() => {
						if (!deletePrefixConfirmPrefix) return
						indexObjectsJobMutation.mutate({ prefix: deletePrefixConfirmPrefix, fullReindex: false })
					}}
				/>

				<ObjectsDownloadPrefixModal
					open={downloadPrefixOpen}
					sourceLabel={bucket ? `s3://${bucket}/${normalizePrefix(prefix)}*` : '-'}
					form={downloadPrefixForm}
					isSubmitting={downloadPrefixSubmitting}
					onCancel={handleDownloadPrefixCancel}
					onFinish={handleDownloadPrefixSubmit}
					onPickFolder={handleDownloadPrefixPick}
					canSubmit={downloadPrefixCanSubmit}
				/>

				<ObjectsUploadFolderModal
					open={uploadFolderOpen}
					destinationLabel={bucket ? `s3://${bucket}/${normalizePrefix(prefix)}` : '-'}
					form={uploadFolderForm}
					defaultMoveAfterUpload={moveAfterUploadDefault}
					defaultCleanupEmptyDirs={cleanupEmptyDirsDefault}
					isSubmitting={uploadFolderSubmitting}
					onCancel={handleUploadFolderCancel}
					onDefaultsChange={(values) => {
						setMoveAfterUploadDefault(values.moveAfterUpload)
						setCleanupEmptyDirsDefault(values.cleanupEmptyDirs)
					}}
					onFinish={handleUploadFolderSubmit}
					onPickFolder={handleUploadFolderPick}
					canSubmit={uploadFolderCanSubmit}
				/>

				<ObjectsCopyPrefixModal
					open={copyPrefixOpen}
					mode={copyPrefixMode}
					bucket={bucket}
					srcPrefix={copyPrefixSrcPrefix}
					sourceLabel={copyPrefixSrcPrefix ? `s3://${bucket}/${copyPrefixSrcPrefix}*` : '-'}
					form={copyPrefixForm}
					bucketOptions={bucketOptions}
					isBucketsLoading={bucketsQuery.isFetching}
					isSubmitting={copyPrefixSubmitting}
					onCancel={handleCopyPrefixCancel}
					onFinish={handleCopyPrefixSubmit}
					isSummaryFetching={copyPrefixSummaryQuery.isFetching}
					summary={copyPrefixSummary}
					summaryNotIndexed={copyPrefixSummaryNotIndexed}
					isSummaryError={copyPrefixSummaryQuery.isError}
					summaryErrorMessage={copyPrefixSummaryError}
					onIndexPrefix={() => {
						if (!copyPrefixSrcPrefix) return
						indexObjectsJobMutation.mutate({ prefix: copyPrefixSrcPrefix, fullReindex: false })
					}}
					normalizePrefix={normalizePrefix}
				/>

				<ObjectsCopyMoveModal
					open={copyMoveOpen}
					mode={copyMoveMode}
					bucket={bucket}
					srcKey={copyMoveSrcKey}
					form={copyMoveForm}
					bucketOptions={bucketOptions}
					isBucketsLoading={bucketsQuery.isFetching}
					isSubmitting={copyMoveSubmitting}
					onCancel={handleCopyMoveCancel}
					onFinish={handleCopyMoveSubmit}
				/>

			<ObjectsNewFolderModal
				open={newFolderOpen}
				parentLabel={bucket ? `s3://${bucket}/${normalizePrefix(prefix)}` : '-'}
				form={newFolderForm}
				isSubmitting={newFolderSubmitting}
				onCancel={handleNewFolderCancel}
				onFinish={handleNewFolderSubmit}
			/>

				<ObjectsRenameModal
					open={renameOpen}
					kind={renameKind}
					source={renameSource}
					bucket={bucket}
					form={renameForm}
					isSubmitting={renameSubmitting}
					onCancel={handleRenameCancel}
					onFinish={handleRenameSubmit}
				/>

			<ObjectsGlobalSearchDrawer
				open={globalSearchOpen}
				onClose={() => setGlobalSearchOpen(false)}
				hasProfile={!!props.profileId}
				hasBucket={!!bucket}
				bucket={bucket}
				currentPrefix={prefix}
				isMd={!!screens.md}
				queryDraft={globalSearchDraft}
				onQueryDraftChange={setGlobalSearchDraft}
				prefixFilter={globalSearchPrefix}
				onPrefixFilterChange={setGlobalSearchPrefix}
				limit={globalSearchLimitClamped}
				onLimitChange={setGlobalSearchLimit}
				extFilter={globalSearchExt}
				onExtFilterChange={setGlobalSearchExt}
				minSizeBytes={globalSearchMinSize}
				maxSizeBytes={globalSearchMaxSize}
				onMinSizeBytesChange={setGlobalSearchMinSize}
				onMaxSizeBytesChange={setGlobalSearchMaxSize}
				modifiedAfterMs={globalSearchMinModifiedMs}
				modifiedBeforeMs={globalSearchMaxModifiedMs}
				onModifiedRangeChange={(startMs, endMs) => {
					setGlobalSearchMinModifiedMs(startMs)
					setGlobalSearchMaxModifiedMs(endMs)
				}}
				onReset={resetGlobalSearch}
				onRefresh={() => indexedSearchQuery.refetch()}
				isRefreshing={indexedSearchQuery.isFetching}
				isError={indexedSearchQuery.isError}
				isNotIndexed={indexedSearchNotIndexed}
				errorMessage={indexedSearchErrorMessage}
				onCreateIndexJob={createIndexJob}
				isCreatingIndexJob={indexObjectsJobMutation.isPending}
				indexPrefix={indexPrefix}
				onIndexPrefixChange={setIndexPrefix}
				indexFullReindex={indexFullReindex}
				onIndexFullReindexChange={setIndexFullReindex}
				searchQueryText={globalSearchQueryText}
				isFetching={indexedSearchQuery.isFetching}
				hasNextPage={indexedSearchQuery.hasNextPage}
				isFetchingNextPage={indexedSearchQuery.isFetchingNextPage}
				items={indexedSearchItems}
				onLoadMore={() => indexedSearchQuery.fetchNextPage()}
				onUseCurrentPrefix={() => setIndexPrefix(prefix)}
				onOpenPrefixForKey={openGlobalSearchPrefix}
				onCopyKey={onCopy}
				onDownloadKey={onDownload}
				onOpenDetails={openGlobalSearchDetails}
			/>
			</Suspense>
		</div>
	)
}

const DEBUG_OBJECTS_LIST_KEY = 'debugObjectsList'
const DEBUG_CONTEXT_MENU_KEY = 'debugObjectsContextMenu'

function isObjectsListDebugEnabled(): boolean {
	if (typeof window === 'undefined') return false
	try {
		return window.localStorage.getItem(DEBUG_OBJECTS_LIST_KEY) === 'true'
	} catch {
		return false
	}
}

function isContextMenuDebugEnabled(): boolean {
	if (typeof window === 'undefined') return false
	try {
		return window.localStorage.getItem(DEBUG_CONTEXT_MENU_KEY) === 'true'
	} catch {
		return false
	}
}

function logObjectsDebug(
	enabled: boolean,
	level: 'debug' | 'warn',
	message: string,
	context?: Record<string, unknown>,
): void {
	if (!enabled) return
	const prefix = `[objects] ${message}`
	if (level === 'warn') {
		if (context) console.warn(prefix, context)
		else console.warn(prefix)
		return
	}
	if (context) console.debug(prefix, context)
	else console.debug(prefix)
}

function logContextMenuDebug(
	enabled: boolean,
	message: string,
	context?: Record<string, unknown>,
): void {
	if (!enabled) return
	const prefix = `[objects][context-menu] ${message}`
	if (context) console.debug(prefix, context)
	else console.debug(prefix)
}
