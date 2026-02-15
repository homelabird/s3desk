import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Grid, Menu, Typography, message } from 'antd'
import {
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'

import { APIClient, APIError } from '../api/client'
import type { Bucket, JobCreateRequest, ObjectItem, Profile } from '../api/types'
import { useTransfers } from '../components/useTransfers'
import { getDevicePickerSupport } from '../lib/deviceFs'
import { withJobQueueRetry } from '../lib/jobQueue'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { getProviderCapabilities, getProviderCapabilityReason, getUploadCapabilityDisabledReason } from '../lib/providerCapabilities'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { useIsOffline } from '../lib/useIsOffline'
import styles from './objects/objects.module.css'
import type { UIActionOrDivider } from './objects/objectsActions'
import {
	buildActionMenu,
	trimActionDividers,
} from './objects/objectsActions'
import { ObjectsLayout } from './objects/ObjectsLayout'
import { ObjectsListHeader } from './objects/ObjectsListHeader'
import { ObjectsListSectionContainer } from './objects/ObjectsListSectionContainer'
import { ObjectThumbnail } from './objects/ObjectThumbnail'
import { ObjectsSelectionBarSection } from './objects/ObjectsSelectionBarSection'
import type { ObjectRow } from './objects/objectsListUtils'
import {
	buildObjectRows,
	fileExtensionFromKey,
	guessPreviewKind,
	normalizeForSearch,
	normalizePrefix,
	parentPrefixFromKey,
	splitLines,
	splitSearchTokens,
	uniquePrefixes,
} from './objects/objectsListUtils'
import {
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
import { useObjectsGlobalSearchState } from './objects/useObjectsGlobalSearchState'
import { useObjectsFiltersState } from './objects/useObjectsFiltersState'
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
import { useObjectsPrefetch } from './objects/useObjectsPrefetch'
import { useObjectsLocationState } from './objects/useObjectsLocationState'
import { useObjectsBreadcrumbItems } from './objects/useObjectsBreadcrumbItems'
import { useObjectsTopMenus } from './objects/useObjectsTopMenus'
import { useObjectsRowRenderers } from './objects/useObjectsRowRenderers'
import { useObjectsSearchState } from './objects/useObjectsSearchState'
import {
	AUTO_INDEX_COOLDOWN_MS,
	COMPACT_ROW_HEIGHT_PX,
	OBJECTS_LIST_PAGE_SIZE,
	type ObjectsUIMode,
	WIDE_ROW_HEIGHT_PX,
} from './objects/objectsPageConstants'
import { isContextMenuDebugEnabled, isObjectsListDebugEnabled, logContextMenuDebug, logObjectsDebug } from './objects/objectsPageDebug'
import {
	ObjectsCommandPaletteModal,
	ObjectsCopyMoveModal,
	ObjectsCopyPrefixModal,
	ObjectsDeletePrefixConfirmModal,
	ObjectsDetailsPanelSection,
	ObjectsDownloadPrefixModal,
	ObjectsFiltersDrawer,
	ObjectsGlobalSearchDrawer,
	ObjectsGoToPathModal,
	ObjectsListContent,
	ObjectsListControls,
	ObjectsNewFolderModal,
	ObjectsPresignModal,
	ObjectsRenameModal,
	ObjectsToolbarSection,
	ObjectsTreeSection,
	ObjectsUploadFolderModal,
} from './objects/objectsPageLazy'

type Props = {
	apiToken: string
	profileId: string | null
}

export function ObjectsPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const transfers = useTransfers()
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
	const isWideDesktop = !!screens.xl
	const canDragDrop = !!screens.lg && !isOffline

	const {
		bucket,
		prefix,
		tabs,
		activeTabId,
		setActiveTabId,
		pathDraft,
		setPathDraft,
		pathModalOpen,
		setPathModalOpen,
		pathInputRef,
		openPathModal,
		prefixByBucketRef,
		navigateToLocation,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		addTab,
		closeTab,
		pathOptions,
		isBookmarked,
		toggleBookmark,
		canGoUp,
		onUp,
		onOpenPrefix,
		commitPathDraft,
	} = useObjectsLocationState({ profileId: props.profileId })
	const [uiMode, setUiMode] = useLocalStorageState<ObjectsUIMode>('objectsUIMode', 'simple')
	const isAdvanced = uiMode === 'advanced'
	const { search, searchDraft, setSearchDraft, clearSearch, deferredSearch } = useObjectsSearchState()
	const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

	const {
		globalSearch,
		setGlobalSearch,
		globalSearchDraft,
		setGlobalSearchDraft,
		deferredGlobalSearch,
		globalSearchPrefix,
		setGlobalSearchPrefix,
		globalSearchLimit,
		setGlobalSearchLimit,
		globalSearchExt,
		setGlobalSearchExt,
		globalSearchMinSize,
		setGlobalSearchMinSize,
		globalSearchMaxSize,
		setGlobalSearchMaxSize,
		globalSearchMinModifiedMs,
		setGlobalSearchMinModifiedMs,
		globalSearchMaxModifiedMs,
		setGlobalSearchMaxModifiedMs,
		indexPrefix,
		setIndexPrefix,
		indexFullReindex,
		setIndexFullReindex,
		resetGlobalSearch,
	} = useObjectsGlobalSearchState()

	const {
		typeFilter,
		setTypeFilter,
		favoritesOnly,
		setFavoritesOnly,
		favoritesFirst,
		setFavoritesFirst,
		favoritesSearch,
		setFavoritesSearch,
		favoritesOpenDetails,
		setFavoritesOpenDetails,
		extFilter,
		setExtFilter,
		minSize,
		setMinSize,
		maxSize,
		setMaxSize,
		minModifiedMs,
		setMinModifiedMs,
		maxModifiedMs,
		setMaxModifiedMs,
		sort,
		setSort,
		showThumbnails,
		thumbnailCacheSize,
		autoIndexEnabled,
		autoIndexTtlHours,
	} = useObjectsFiltersState()
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
		treeLoadingKeys,
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
	const metaQuery = useQuery({
		queryKey: ['meta', props.apiToken],
		queryFn: () => api.getMeta(),
		enabled: !!props.apiToken,
	})
	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: () => api.listProfiles(),
		enabled: !!props.apiToken,
	})
	const selectedProfile: Profile | null = useMemo(() => {
		if (!props.profileId) return null
		return profilesQuery.data?.find((profile) => profile.id === props.profileId) ?? null
	}, [profilesQuery.data, props.profileId])
	const profileCapabilities = selectedProfile?.provider
		? getProviderCapabilities(selectedProfile.provider, metaQuery.data?.capabilities?.providers)
		: null
	const objectCrudSupported = profileCapabilities ? profileCapabilities.objectCrud : true
	const uploadSupported = profileCapabilities ? profileCapabilities.objectCrud && profileCapabilities.jobTransfer : true
	const uploadDisabledReason = getUploadCapabilityDisabledReason(profileCapabilities)

	const bucketsQuery = useQuery({
		queryKey: ['buckets', props.profileId, props.apiToken],
		queryFn: () => api.listBuckets(props.profileId!),
		enabled: !!props.profileId,
	})

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
		setGlobalSearchDraft(globalSearch)
	}, [globalSearch, setGlobalSearchDraft])

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
	const { handleBucketDropdownVisibleChange } = useObjectsPrefetch({
		api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		queryClient,
		bucket,
		tabs,
		bucketOptions,
		prefixByBucketRef,
		pageSize: OBJECTS_LIST_PAGE_SIZE,
	})
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

	const handleTreeSelect = useCallback(
		(key: string, closeDrawer: boolean) => {
			setTreeSelectedKeys([key])
			if (!bucket) return
			navigateToLocation(bucket, key === '/' ? '' : key, { recordHistory: true })
			if (closeDrawer) setTreeDrawerOpen(false)
		},
		[bucket, navigateToLocation, setTreeDrawerOpen, setTreeSelectedKeys],
	)

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
		renameValues,
		setRenameValues,
		renameSubmitting,
		openRenameObject,
		openRenamePrefix,
		handleRenameSubmit,
		handleRenameCancel,
	} = useObjectsRename({
		profileId: props.profileId,
		bucket,
		createJobWithRetry,
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
		copyMoveValues,
		setCopyMoveValues,
		copyMoveSubmitting,
		openCopyMove,
		handleCopyMoveSubmit,
		handleCopyMoveCancel,
		copyPrefixOpen,
		copyPrefixMode,
		copyPrefixSrcPrefix,
		copyPrefixValues,
		setCopyPrefixValues,
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
		newFolderValues,
		setNewFolderValues,
		newFolderSubmitting,
		newFolderError,
		newFolderPartialKey,
		newFolderParentPrefix,
		openNewFolder,
		handleNewFolderSubmit,
		handleNewFolderCancel,
	} = useObjectsNewFolder({
		api,
		profileId: props.profileId,
		bucket,
		prefix,
		typeFilter,
		favoritesOnly,
		searchText: deferredSearch,
		onClearSearch: clearSearch,
		onDisableFavoritesOnly: () => setFavoritesOnly(false),
		onShowFolders: () => setTypeFilter('all'),
		refreshTreeNode,
		onOpenPrefix,
	})

	const {
		downloadPrefixOpen,
		downloadPrefixValues,
		setDownloadPrefixValues,
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
		uploadsEnabled: uploadSupported,
		uploadsDisabledReason: uploadDisabledReason,
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
		uploadFolderValues,
		setUploadFolderValues,
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
		uploadsEnabled: uploadSupported,
		uploadsDisabledReason: uploadDisabledReason,
		transfers,
		defaultMoveAfterUpload: moveAfterUploadDefault,
		defaultCleanupEmptyDirs: cleanupEmptyDirsDefault,
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
		if (!uploadSupported) {
			message.warning(uploadDisabledReason ?? 'Uploads are not supported by this provider.')
			return
		}
		uploadFilesInputRef.current?.click()
	}
	const openUploadFolderPicker = () => {
		if (isOffline) {
			message.warning('Offline: uploads are disabled.')
			return
		}
		if (!uploadSupported) {
			message.warning(uploadDisabledReason ?? 'Uploads are not supported by this provider.')
			return
		}
		const support = getDevicePickerSupport()
		if (support.ok) {
			openUploadFolderModal()
			return
		}
		uploadFolderInputRef.current?.click()
	}

	const { hasNextPage, isFetchingNextPage, fetchNextPage } = objectsQuery

	const { showLoadMore, loadMoreLabel, handleLoadMore, searchAutoScanCap } = useObjectsAutoScan({
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
		})

	const { breadcrumbItems } = useObjectsBreadcrumbItems({
		bucket,
		prefix,
		isMd: !!screens.md,
		canDragDrop,
		dndHoverPrefix,
		normalizeDropTargetPrefix,
		onDndTargetDragOver,
		onDndTargetDragLeave,
		onDndTargetDrop,
		navigateToLocation,
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
		objectCrudSupported,
		uploadSupported,
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
		getListScrollerElement,
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
	const handleTreePrefixContextMenu = useCallback(
		(event: ReactMouseEvent, nodeKey: string) => {
			const point = recordContextMenuPoint(event)
			openPrefixContextMenu(nodeKey, 'context', point)
		},
		[openPrefixContextMenu, recordContextMenuPoint],
	)
	const {
		query: commandPaletteQuery,
		setQuery: setCommandPaletteQuery,
		activeIndex: commandPaletteActiveIndex,
		setActiveIndex: setCommandPaletteActiveIndex,
		filtered: commandPaletteItems,
		run: runCommandPaletteItem,
		onQueryChange: onCommandPaletteQueryChange,
		onKeyDown: onCommandPaletteKeyDown,
	} = useObjectsCommandPalette({
		items: commandItems,
		open: commandPaletteOpen,
		setOpen: setCommandPaletteOpen,
	})

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
	const showUploadDropOverlay = uploadDropActive && !!props.profileId && !!bucket && !isOffline && uploadSupported
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
	const {
		handleListScrollerScroll,
		handleListScrollerWheel,
		listScrollerRef,
		renderPrefixRow,
		renderObjectRow,
	} = useObjectsRowRenderers({
		api,
		profileId: props.profileId,
		bucket,
		prefix,
		canDragDrop,
		isCompactList,
		isAdvanced,
		isOffline,
		listGridClassName,
		rowHeightCompactPx: COMPACT_ROW_HEIGHT_PX,
		rowHeightWidePx: WIDE_ROW_HEIGHT_PX,
		showThumbnails,
		thumbnailCache,
		highlightText,
		contextMenuState,
		withContextMenuClassName,
		getPrefixActions,
		getObjectActions,
		selectionContextMenuActions,
		recordContextMenuPoint,
		openPrefixContextMenu,
		openObjectContextMenu,
		closeContextMenu,
		onOpenPrefix,
		onRowDragStartPrefix,
		onRowDragStartObjects,
		clearDndHover,
		selectObjectFromPointerEvent,
		selectObjectFromCheckboxEvent,
		selectedCount,
		selectedKeys,
		favoriteKeys,
		favoritePendingKeys,
		toggleFavorite,
		setListScrollerEl,
		scrollContainerRef,
	})
	const handleClearSearch = clearSearch
	const canClearSearch = !!search.trim() || !!searchDraft.trim()
	const listIsFetching = favoritesOnly ? favoritesQuery.isFetching : objectsQuery.isFetching
	const listIsFetchingNextPage = favoritesOnly ? false : objectsQuery.isFetchingNextPage
	const loadMoreDisabled = listIsFetching || listIsFetchingNextPage
	const canInteract = !!props.profileId && !!bucket && !isOffline
		const paneFallback = (
			<div className={styles.paneSkeleton}>
				<Typography.Text type="secondary">Loading…</Typography.Text>
			</div>
		)
		const listFallback = (
			<div className={styles.listSkeleton}>
				<Typography.Text type="secondary">Loading list…</Typography.Text>
			</div>
		)
		const controlsFallback = (
			<div className={styles.controlsSkeleton}>
				<Typography.Text type="secondary">Loading controls…</Typography.Text>
			</div>
		)
		const toolbarFallback = (
			<div className={styles.toolbarSkeleton}>
				<Typography.Text type="secondary">Loading toolbar…</Typography.Text>
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

		const uploadMenuActions = trimActionDividers([globalActionMap.get('upload_files'), globalActionMap.get('upload_folder')].filter(Boolean) as UIActionOrDivider[])
		const uploadButtonMenu = buildActionMenu(uploadMenuActions, isAdvanced)
		const canCreateFolder = !!props.profileId && !!bucket && !isOffline && objectCrudSupported
		const createFolderTooltipText = !props.profileId
			? 'Select a profile first'
			: isOffline
				? 'Offline: check your network connection'
				: !bucket
					? 'Select a bucket first'
					: !objectCrudSupported
						? getProviderCapabilityReason(profileCapabilities, 'objectCrud', 'Selected provider does not support object APIs.') ??
							'Selected provider does not support object APIs.'
						: 'Create a new folder marker object'
	const handleBucketChange = (value: string | null) => {
		const nextBucket = value ?? ''
		if (!nextBucket) {
			navigateToLocation('', '', { recordHistory: true })
			return
		}
		const saved = prefixByBucketRef.current[nextBucket]
		navigateToLocation(nextBucket, saved ?? '', { recordHistory: true })
	}

	const { topMoreMenu } = useObjectsTopMenus({
		isAdvanced,
		profileId: props.profileId,
		bucket,
		prefix,
		dockTree,
		globalActionMap,
		currentPrefixActionMap,
	})

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
				{!uploadSupported ? (
					<Alert
						type="info"
						showIcon
						title="Uploads are disabled for this provider"
						description={uploadDisabledReason ?? 'Object uploads are not supported by the selected provider.'}
					/>
				) : null}

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
							uploadEnabled: uploadSupported,
							uploadDisabledReason: uploadDisabledReason,
							onUploadFiles: openUploadFilesPicker,
							canCreateFolder: canCreateFolder,
							createFolderTooltipText: createFolderTooltipText,
							onNewFolder: () => openNewFolder(),
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
						loadingKeys={treeLoadingKeys}
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
						canCreateFolder={canCreateFolder}
						createFolderTooltipText={createFolderTooltipText}
						onNewFolderAtPrefix={openNewFolder}
						onPrefixContextMenu={handleTreePrefixContextMenu}
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
							{isOffline ? <Alert type="warning" showIcon title="Offline: object actions are disabled." /> : null}
							{favoritesOnly ? (
								favoritesQuery.isError ? (
									<Alert type="error" showIcon title="Failed to load favorites" description={formatErr(favoritesQuery.error)} />
								) : null
							) : objectsQuery.isError ? (
								<Alert type="error" showIcon title="Failed to list objects" description={formatErr(objectsQuery.error)} />
							) : null}
							{bucket ? null : <Alert type="info" showIcon title="Select a bucket to browse objects." />}
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
				{filtersDrawerOpen ? (
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
				) : null}

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
												<Space orientation="vertical" size={4} align="center">
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
																		<LinkButton size="small" type="link" to="/jobs">
																			Jobs
																		</LinkButton>
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

				{presignOpen ? (
					<ObjectsPresignModal
						open={presignOpen}
						presign={presign}
						onClose={closePresign}
					/>
				) : null}

				{pathModalOpen ? (
					<ObjectsGoToPathModal
						open={pathModalOpen}
						bucket={bucket}
						hasProfile={!!props.profileId}
						pathDraft={pathDraft}
						options={pathOptions}
						inputRef={pathInputRef}
						onChangeDraft={setPathDraft}
						onCommit={commitPathDraft}
						onClose={() => setPathModalOpen(false)}
					/>
				) : null}

				{commandPaletteOpen ? (
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
				) : null}

				{deletePrefixConfirmOpen ? (
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
				) : null}

				{downloadPrefixOpen ? (
					<ObjectsDownloadPrefixModal
						open={downloadPrefixOpen}
						sourceLabel={bucket ? `s3://${bucket}/${normalizePrefix(prefix)}*` : '-'}
						values={downloadPrefixValues}
						onValuesChange={setDownloadPrefixValues}
						isSubmitting={downloadPrefixSubmitting}
						onCancel={handleDownloadPrefixCancel}
						onFinish={handleDownloadPrefixSubmit}
						onPickFolder={handleDownloadPrefixPick}
						canSubmit={downloadPrefixCanSubmit}
					/>
				) : null}

				{uploadFolderOpen ? (
					<ObjectsUploadFolderModal
						open={uploadFolderOpen}
						destinationLabel={bucket ? `s3://${bucket}/${normalizePrefix(prefix)}` : '-'}
						values={uploadFolderValues}
						onValuesChange={setUploadFolderValues}
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
				) : null}

				{copyPrefixOpen ? (
					<ObjectsCopyPrefixModal
						open={copyPrefixOpen}
						mode={copyPrefixMode}
						bucket={bucket}
						srcPrefix={copyPrefixSrcPrefix}
						sourceLabel={copyPrefixSrcPrefix ? `s3://${bucket}/${copyPrefixSrcPrefix}*` : '-'}
						values={copyPrefixValues}
						onValuesChange={setCopyPrefixValues}
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
				) : null}

				{copyMoveOpen ? (
					<ObjectsCopyMoveModal
						open={copyMoveOpen}
						mode={copyMoveMode}
						bucket={bucket}
						srcKey={copyMoveSrcKey}
						values={copyMoveValues}
						onValuesChange={setCopyMoveValues}
						bucketOptions={bucketOptions}
						isBucketsLoading={bucketsQuery.isFetching}
						isSubmitting={copyMoveSubmitting}
						onCancel={handleCopyMoveCancel}
						onFinish={handleCopyMoveSubmit}
					/>
				) : null}

				{newFolderOpen ? (
					<ObjectsNewFolderModal
						open={newFolderOpen}
						parentLabel={bucket ? `s3://${bucket}/${normalizePrefix(newFolderParentPrefix)}` : '-'}
						parentPrefix={newFolderParentPrefix}
						errorMessage={newFolderError}
						partialKey={newFolderPartialKey}
						onOpenPrefix={onOpenPrefix}
						values={newFolderValues}
						onValuesChange={setNewFolderValues}
						isSubmitting={newFolderSubmitting}
						onCancel={handleNewFolderCancel}
						onFinish={handleNewFolderSubmit}
					/>
				) : null}

				{renameOpen ? (
					<ObjectsRenameModal
						open={renameOpen}
						kind={renameKind}
						source={renameSource}
						bucket={bucket}
						values={renameValues}
						onValuesChange={setRenameValues}
						isSubmitting={renameSubmitting}
						onCancel={handleRenameCancel}
						onFinish={handleRenameSubmit}
					/>
				) : null}

				{globalSearchOpen ? (
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
				) : null}
			</Suspense>
		</div>
	)
}
