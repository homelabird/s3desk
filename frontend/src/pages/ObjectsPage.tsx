import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Dropdown, Form, Grid, Modal, Space, Typography, message } from 'antd'
import { FolderOutlined, SnippetsOutlined } from '@ant-design/icons'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError, RequestAbortedError } from '../api/client'
import type { InputRef } from 'antd'
import type { DataNode, EventDataNode } from 'antd/es/tree'
import type { Bucket, Job, JobCreateRequest, ListObjectsResponse, ObjectItem } from '../api/types'
import { useTransfers } from '../components/useTransfers'
import { LocalPathBrowseModal } from '../components/LocalPathBrowseModal'
import { clipboardFailureHint, copyToClipboard } from '../lib/clipboard'
import { withJobQueueRetry } from '../lib/jobQueue'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { formatBytes } from '../lib/transfer'
import styles from './objects/objects.module.css'
import type { CommandItem, UIAction, UIActionOrDivider } from './objects/objectsActions'
import {
	actionToMenuItem,
	buildActionMenu,
	commandItemsFromActions,
	compactMenuItems,
	filterActionItems,
	filterActions,
	trimActionDividers,
} from './objects/objectsActions'
import type { ClipboardObjects } from './objects/objectsActionCatalog'
import { buildObjectsActionCatalog } from './objects/objectsActionCatalog'
import type { ObjectPreview, ObjectSort, ObjectTypeFilter } from './objects/objectsTypes'
import { ObjectsLayout } from './objects/ObjectsLayout'
import { ObjectsDetailsPanelSection } from './objects/ObjectsDetailsPanelSection'
import { ObjectsListControls } from './objects/ObjectsListControls'
import { ObjectsListContent } from './objects/ObjectsListContent'
import { ObjectsListHeader } from './objects/ObjectsListHeader'
import { ObjectsObjectRow, ObjectsPrefixRow } from './objects/ObjectsListRow'
import { ObjectsListSectionContainer } from './objects/ObjectsListSectionContainer'
import { ObjectsSelectionBarSection } from './objects/ObjectsSelectionBarSection'
import { ObjectsToolbarSection } from './objects/ObjectsToolbarSection'
import { ObjectsTreeSection } from './objects/ObjectsTreeSection'
import { useObjectsListKeydown } from './objects/useObjectsListKeydown'
import { useObjectsCommandPalette } from './objects/useObjectsCommandPalette'

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

type Props = {
	apiToken: string
	profileId: string | null
}

type Row =
	| { kind: 'prefix'; prefix: string }
	| { kind: 'object'; object: ObjectItem }

type Location = { bucket: string; prefix: string }

type LocationTab = {
	id: string
	bucket: string
	prefix: string
	history: Location[]
	historyIndex: number
}

type ObjectsUIMode = 'simple' | 'advanced'


const DND_MIME = 'application/x-object-storage-dnd'

type DndPayload =
	| { kind: 'objects'; bucket: string; keys: string[] }
	| { kind: 'prefix'; bucket: string; prefix: string }

export function ObjectsPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const transfers = useTransfers()
	const navigate = useNavigate()
	const screens = Grid.useBreakpoint()

	const createJobWithRetry = useCallback(
		(req: JobCreateRequest) => {
			if (!props.profileId) throw new Error('profile is required')
			return withJobQueueRetry(() => api.createJob(props.profileId!, req))
		},
		[api, props.profileId],
	)

	const isDesktop = !!screens.lg
	const isWideDesktop = !!screens.xl
	const canDragDrop = !!screens.lg

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
	const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
	const [globalSearch, setGlobalSearch] = useLocalStorageState<string>('objectsGlobalSearch', '')
	const [globalSearchDraft, setGlobalSearchDraft] = useState(globalSearch)
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
	const [typeFilter, setTypeFilter] = useLocalStorageState<ObjectTypeFilter>('objectsTypeFilter', 'all')
	const [extFilter, setExtFilter] = useLocalStorageState<string>('objectsExtFilter', '')
	const [minSize, setMinSize] = useLocalStorageState<number | null>('objectsMinSize', null)
	const [maxSize, setMaxSize] = useLocalStorageState<number | null>('objectsMaxSize', null)
	const [minModifiedMs, setMinModifiedMs] = useLocalStorageState<number | null>('objectsMinModifiedMs', null)
	const [maxModifiedMs, setMaxModifiedMs] = useLocalStorageState<number | null>('objectsMaxModifiedMs', null)
	const [sort, setSort] = useLocalStorageState<ObjectSort>('objectsSort', 'name_asc')
	const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false)
	const [treeWidth, setTreeWidth] = useLocalStorageState<number>('objectsTreeWidth', 300)
	const [treeExpandedByBucket, setTreeExpandedByBucket] = useLocalStorageState<Record<string, string[]>>('objectsTreeExpandedByBucket', {})
	const treeExpandedByBucketRef = useRef<Record<string, string[]>>(treeExpandedByBucket)
	const [treeData, setTreeData] = useState<DataNode[]>(() => [{ key: '/', title: '(root)', isLeaf: false, icon: <FolderOutlined style={{ color: '#1677ff' }} /> }])
	const [treeExpandedKeys, setTreeExpandedKeys] = useState<string[]>(['/'])
	const [treeSelectedKeys, setTreeSelectedKeys] = useState<string[]>(['/'])
	const treeLoadedKeysRef = useRef<Set<string>>(new Set())
	const treeLoadingKeysRef = useRef<Set<string>>(new Set())
	const treeEpochRef = useRef(0)
	const [treeDrawerOpen, setTreeDrawerOpen] = useState(false)
	const [detailsOpen, setDetailsOpen] = useLocalStorageState<boolean>('objectsDetailsOpen', true)
	const [detailsWidth, setDetailsWidth] = useLocalStorageState<number>('objectsDetailsWidth', 480)
	const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
	const layoutRef = useRef<HTMLDivElement | null>(null)
	const [layoutWidthPx, setLayoutWidthPx] = useState(0)
	const [preview, setPreview] = useState<ObjectPreview | null>(null)
	const previewAbortRef = useRef<(() => void) | null>(null)
	const previewURLRef = useRef<string | null>(null)
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
	const [lastSelectedObjectKey, setLastSelectedObjectKey] = useState<string | null>(null)
	const uploadDragCounterRef = useRef(0)
	const uploadFilesInputRef = useRef<HTMLInputElement | null>(null)
	const uploadFolderInputRef = useRef<HTMLInputElement | null>(null)
	useEffect(() => {
		const el = uploadFolderInputRef.current
		if (!el) return
		el.setAttribute('webkitdirectory', '')
		el.setAttribute('directory', '')
	}, [uploadFolderInputRef])
	const [uploadDropActive, setUploadDropActive] = useState(false)
	const [dndHoverPrefix, setDndHoverPrefix] = useState<string | null>(null)
	const [presignOpen, setPresignOpen] = useState(false)
	const [presign, setPresign] = useState<{ key: string; url: string; expiresAt: string } | null>(null)
	const [presignKey, setPresignKey] = useState<string | null>(null)
	const [deletingKey, setDeletingKey] = useState<string | null>(null)
	const [clipboardObjects, setClipboardObjects] = useState<ClipboardObjects | null>(null)
	const [copyMoveOpen, setCopyMoveOpen] = useState(false)
	const [copyMoveMode, setCopyMoveMode] = useState<'copy' | 'move'>('copy')
	const [copyMoveSrcKey, setCopyMoveSrcKey] = useState<string | null>(null)
	const [copyMoveForm] = Form.useForm<{ dstBucket: string; dstKey: string; dryRun: boolean }>()
	const [copyPrefixOpen, setCopyPrefixOpen] = useState(false)
	const [copyPrefixMode, setCopyPrefixMode] = useState<'copy' | 'move'>('copy')
	const [copyPrefixSrcPrefix, setCopyPrefixSrcPrefix] = useState('')
	const [copyPrefixForm] = Form.useForm<{
		dstBucket: string
		dstPrefix: string
		include: string
		exclude: string
		dryRun: boolean
		confirm: string
	}>()
	const [deletePrefixConfirmOpen, setDeletePrefixConfirmOpen] = useState(false)
	const [deletePrefixConfirmDryRun, setDeletePrefixConfirmDryRun] = useState(false)
	const [deletePrefixConfirmPrefix, setDeletePrefixConfirmPrefix] = useState('')
	const [deletePrefixConfirmText, setDeletePrefixConfirmText] = useState('')
	const [newFolderOpen, setNewFolderOpen] = useState(false)
	const [newFolderForm] = Form.useForm<{ name: string }>()
	const [renameOpen, setRenameOpen] = useState(false)
	const [renameKind, setRenameKind] = useState<'object' | 'prefix'>('object')
	const [renameSource, setRenameSource] = useState<string | null>(null)
	const [renameForm] = Form.useForm<{ name: string }>()
	const [downloadPrefixOpen, setDownloadPrefixOpen] = useState(false)
	const [downloadPrefixForm] = Form.useForm<{ localPath: string; deleteExtraneous: boolean; dryRun: boolean }>()
	const [downloadPrefixLocalPath, setDownloadPrefixLocalPath] = useLocalStorageState<string>('downloadPrefixLocalPath', '')
	const [localBrowseOpen, setLocalBrowseOpen] = useState(false)

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
		treeExpandedByBucketRef.current = treeExpandedByBucket
	}, [treeExpandedByBucket])

	useEffect(() => {
		setDndHoverPrefix(null)
	}, [isDesktop])

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
		setSort('name_asc')
	}, [setExtFilter, setMaxSize, setMinSize, setSort, uiMode])

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


	useEffect(() => {
		if (downloadPrefixOpen) return
		setLocalBrowseOpen(false)
	}, [downloadPrefixOpen])

	useEffect(() => {
		if (deletePrefixConfirmOpen) return
		setDeletePrefixConfirmText('')
		setDeletePrefixConfirmPrefix('')
	}, [deletePrefixConfirmOpen])

	const objectsQuery = useInfiniteQuery({
		queryKey: ['objects', props.profileId, bucket, prefix, props.apiToken],
		enabled: !!props.profileId && !!bucket,
		initialPageParam: undefined as string | undefined,
		queryFn: async ({ pageParam }) => {
			return api.listObjects({
				profileId: props.profileId!,
				bucket,
				prefix,
				delimiter: '/',
				maxKeys: 500,
				continuationToken: pageParam,
			})
		},
		getNextPageParam: (lastPage) => {
			if (!lastPage.isTruncated) return undefined
			return lastPage.nextContinuationToken ?? undefined
		},
	})

	const globalSearchQueryText = globalSearch.trim()
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

	const loadTreeChildren = useCallback(async (nodeKey: string): Promise<void> => {
		if (!props.profileId || !bucket) return
		if (treeLoadedKeysRef.current.has(nodeKey)) return
		if (treeLoadingKeysRef.current.has(nodeKey)) return
		treeLoadingKeysRef.current.add(nodeKey)

		const epoch = treeEpochRef.current
		const prefixesSet = new Set<string>()
		let token: string | undefined

		try {
			for (;;) {
				const resp = await api.listObjects({
					profileId: props.profileId,
					bucket,
					prefix: nodeKey === '/' ? undefined : nodeKey,
					delimiter: '/',
					maxKeys: 1000,
					continuationToken: token,
				})
				for (const p of resp.commonPrefixes) prefixesSet.add(p)
				if (!resp.isTruncated) break
				token = resp.nextContinuationToken ?? undefined
				if (!token) break
			}
		} catch (err) {
			message.error(formatErr(err))
			treeLoadingKeysRef.current.delete(nodeKey)
			return
		}

		if (treeEpochRef.current !== epoch) {
			treeLoadingKeysRef.current.delete(nodeKey)
			return
		}

		const children: DataNode[] = Array.from(prefixesSet)
			.sort((a, b) => a.localeCompare(b))
			.map((p) => ({
				key: p,
				title: folderLabelFromPrefix(p),
				isLeaf: false,
				icon: <FolderOutlined style={{ color: '#1677ff' }} />,
			}))

		setTreeData((prev) => upsertTreeChildren(prev, nodeKey, children))
		treeLoadedKeysRef.current.add(nodeKey)
		treeLoadingKeysRef.current.delete(nodeKey)
	}, [api, bucket, props.profileId])

	const onTreeLoadData = useCallback(async (node: EventDataNode<DataNode>) => {
		const key = String(node.key)
		await loadTreeChildren(key)
	}, [loadTreeChildren])

	const deleteMutation = useMutation({
		mutationFn: async (keys: string[]) => {
			if (keys.length < 1) throw new Error('select objects first')
			if (keys.length > 50_000) throw new Error('too many keys; use a prefix delete job instead')
			if (keys.length > 1000) {
				const job = await createJobWithRetry({
					type: 's3_delete_objects',
					payload: { bucket, keys },
				})
				return { kind: 'job' as const, job }
			}
			let deleted = 0
			for (let i = 0; i < keys.length; i += 1000) {
				const batch = keys.slice(i, i + 1000)
				const resp = await api.deleteObjects({ profileId: props.profileId!, bucket, keys: batch })
				deleted += resp.deleted
			}
			return { kind: 'direct' as const, deleted }
		},
		onMutate: (keys) => setDeletingKey(keys.length === 1 ? keys[0] : null),
		onSuccess: async (result, keys) => {
			if (result.kind === 'direct') {
				message.success(`Deleted ${result.deleted}`)
			} else {
				message.success(`Delete task started: ${result.job.id}`)
				await queryClient.invalidateQueries({ queryKey: ['jobs'] })
			}
			setSelectedKeys((prev) => {
				if (prev.size === 0) return prev
				const next = new Set(prev)
				for (const k of keys) next.delete(k)
				return next
			})
			await queryClient.invalidateQueries({ queryKey: ['objects'] })
		},
		onSettled: (_, __, keys) => setDeletingKey((prev) => (keys.length === 1 && prev === keys[0] ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const deletePrefixJobMutation = useMutation({
		mutationFn: (args: { prefix: string; dryRun: boolean }) =>
			createJobWithRetry({
				type: 's5cmd_rm_prefix',
				payload: {
					bucket,
					prefix: args.prefix,
					deleteAll: false,
					allowUnsafePrefix: false,
					include: [],
					exclude: [],
					dryRun: args.dryRun,
				},
			}),
		onSuccess: (job: Job) => message.success(`Delete task started: ${job.id}`),
		onError: (err) => message.error(formatErr(err)),
	})

	const downloadPrefixJobMutation = useMutation({
		mutationFn: (args: { prefix: string; localPath: string; deleteExtraneous: boolean; dryRun: boolean }) =>
			createJobWithRetry({
				type: 's5cmd_sync_s3_to_local',
				payload: {
					bucket,
					prefix: args.prefix,
					localPath: args.localPath,
					deleteExtraneous: args.deleteExtraneous,
					include: [],
					exclude: [],
					dryRun: args.dryRun,
				},
			}),
		onSuccess: async (job: Job) => {
			setDownloadPrefixOpen(false)
			message.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>Download task started: {job.id}</Typography.Text>
						<Button size="small" type="link" onClick={() => navigate('/jobs')}>
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const zipPrefixJobMutation = useMutation({
		mutationFn: async (args: { prefix: string }) => {
			if (!props.profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			return createJobWithRetry({
				type: 's3_zip_prefix',
				payload: { bucket, prefix: normalizePrefix(args.prefix) },
			})
		},
			onSuccess: async (job: Job, args) => {
				const normPrefix = normalizePrefix(args.prefix)
				const label = normPrefix ? `Folder zip: ${normPrefix}` : 'Folder zip: (root)'
				transfers.queueDownloadJobArtifact({
					profileId: props.profileId!,
					jobId: job.id,
					label,
				filenameHint: `job-${job.id}.zip`,
				waitForJob: job.status !== 'succeeded',
			})
			message.open({
				type: 'success',
					content: (
						<Space>
							<Typography.Text>Zip task started: {job.id}</Typography.Text>
							<Button size="small" type="link" onClick={() => transfers.openTransfers('downloads')}>
								Open Transfers
							</Button>
							<Button size="small" type="link" onClick={() => navigate('/jobs')}>
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const zipObjectsJobMutation = useMutation({
		mutationFn: async (args: { keys: string[] }) => {
			if (!props.profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			if (args.keys.length < 1) throw new Error('select objects first')
			if (args.keys.length > 10_000) throw new Error('too many keys (max 10000)')
			return createJobWithRetry({
				type: 's3_zip_objects',
				payload: {
					bucket,
					keys: args.keys,
					stripPrefix: normalizePrefix(prefix),
				},
			})
		},
		onSuccess: async (job: Job, args) => {
			const label = `Zip selection: ${args.keys.length} object(s)`
			transfers.queueDownloadJobArtifact({
				profileId: props.profileId!,
				jobId: job.id,
				label,
				filenameHint: `job-${job.id}.zip`,
				waitForJob: job.status !== 'succeeded',
			})
			message.open({
				type: 'success',
					content: (
						<Space>
							<Typography.Text>Zip task started: {job.id}</Typography.Text>
							<Button size="small" type="link" onClick={() => transfers.openTransfers('downloads')}>
								Open Transfers
							</Button>
							<Button size="small" type="link" onClick={() => navigate('/jobs')}>
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const copyPrefixJobMutation = useMutation({
		mutationFn: (args: { mode: 'copy' | 'move'; srcPrefix: string; dstBucket: string; dstPrefix: string; include: string[]; exclude: string[]; dryRun: boolean }) =>
			createJobWithRetry({
				type: args.mode === 'copy' ? 's5cmd_cp_s3_prefix_to_s3_prefix' : 's5cmd_mv_s3_prefix_to_s3_prefix',
				payload: {
					srcBucket: bucket,
					srcPrefix: args.srcPrefix,
					dstBucket: args.dstBucket,
					dstPrefix: args.dstPrefix,
					include: args.include,
					exclude: args.exclude,
					dryRun: args.dryRun,
				},
			}),
		onSuccess: (job: Job, args) => {
			message.success(`${args.mode === 'copy' ? 'Copy' : 'Move'} task started: ${job.id}`)
			setCopyPrefixOpen(false)
			setCopyPrefixSrcPrefix('')
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const indexObjectsJobMutation = useMutation({
		mutationFn: async (args: { prefix: string; fullReindex: boolean }) => {
			if (!props.profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			const p = normalizePrefix(args.prefix)
			if (p.includes('*')) throw new Error('wildcards are not allowed')

			return createJobWithRetry({
				type: 's3_index_objects',
				payload: {
					bucket,
					prefix: p,
					fullReindex: args.fullReindex,
				},
			})
		},
		onSuccess: async (job: Job) => {
			message.open({
				type: 'success',
					content: (
						<Space>
							<Typography.Text>Index task started: {job.id}</Typography.Text>
							<Button size="small" type="link" onClick={() => navigate('/jobs')}>
								Open Jobs
							</Button>
						</Space>
				),
				duration: 6,
			})
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const openCopyPrefix = (mode: 'copy' | 'move', srcPrefixOverride?: string) => {
		if (!props.profileId || !bucket) return
		const srcPrefix = normalizePrefix(srcPrefixOverride ?? prefix)
		if (!srcPrefix) return

		setCopyPrefixMode(mode)
		setCopyPrefixSrcPrefix(srcPrefix)
		setCopyPrefixOpen(true)
		copyPrefixForm.setFieldsValue({
			dstBucket: bucket,
			dstPrefix: suggestCopyPrefix(srcPrefix),
			include: '',
			exclude: '',
			dryRun: false,
			confirm: '',
		})
	}

		const openDownloadPrefix = (srcPrefixOverride?: string) => {
			if (!props.profileId || !bucket) return
			const srcPrefix = normalizePrefix(srcPrefixOverride ?? prefix)
			if (!srcPrefix) return

			setDownloadPrefixOpen(true)
			downloadPrefixForm.setFieldsValue({
				localPath: downloadPrefixLocalPath,
				deleteExtraneous: false,
				dryRun: false,
			})
		}

		const openNewFolder = () => {
			if (!props.profileId || !bucket) return
			setNewFolderOpen(true)
			newFolderForm.setFieldsValue({ name: '' })
			window.setTimeout(() => {
				const el = document.getElementById('objectsNewFolderInput') as HTMLInputElement | null
				el?.focus()
			}, 0)
		}

		const openRenameObject = (key: string) => {
			if (!props.profileId || !bucket) return
			setRenameKind('object')
			setRenameSource(key)
			renameForm.setFieldsValue({ name: fileNameFromKey(key) })
			setRenameOpen(true)
			window.setTimeout(() => {
				const el = document.getElementById('objectsRenameInput') as HTMLInputElement | null
				el?.focus()
			}, 0)
		}

		const openRenamePrefix = (srcPrefix: string) => {
			if (!props.profileId || !bucket) return
			setRenameKind('prefix')
			setRenameSource(srcPrefix)
			renameForm.setFieldsValue({ name: folderLabelFromPrefix(srcPrefix) })
			setRenameOpen(true)
			window.setTimeout(() => {
				const el = document.getElementById('objectsRenameInput') as HTMLInputElement | null
				el?.focus()
			}, 0)
		}

		const copyMoveMutation = useMutation({
			mutationFn: (args: { mode: 'copy' | 'move'; srcKey: string; dstBucket: string; dstKey: string; dryRun: boolean }) => {
				const type = args.mode === 'copy' ? 's5cmd_cp_s3_to_s3' : 's5cmd_mv_s3_to_s3'
				return createJobWithRetry({
					type,
					payload: {
						srcBucket: bucket,
						srcKey: args.srcKey,
						dstBucket: args.dstBucket,
						dstKey: args.dstKey,
						dryRun: args.dryRun,
					},
				})
			},
			onSuccess: (job, args) => {
				message.success(`${args.mode === 'copy' ? 'Copy' : 'Move'} task started: ${job.id}`)
				setCopyMoveOpen(false)
				setCopyMoveSrcKey(null)
			},
			onError: (err) => message.error(formatErr(err)),
		})

		const createFolderMutation = useMutation({
			mutationFn: async (args: { name: string }) => {
				if (!props.profileId) throw new Error('profile is required')
				if (!bucket) throw new Error('bucket is required')
				const raw = args.name.trim().replace(/\/+$/, '')
				if (!raw) throw new Error('folder name is required')
				if (raw === '.' || raw === '..') throw new Error('invalid folder name')
				if (raw.includes('/')) throw new Error("folder name must not contain '/'")
				if (raw.includes('\u0000')) throw new Error('invalid folder name')

				const key = `${normalizePrefix(prefix)}${raw}/`
				return api.createFolder({ profileId: props.profileId, bucket, key })
			},
			onSuccess: async (resp) => {
				message.success(`Folder created: ${resp.key}`)
				setNewFolderOpen(false)
				newFolderForm.resetFields()
				await queryClient.invalidateQueries({ queryKey: ['objects'] })
				const parentKey = normalizePrefix(prefix) || '/'
				treeLoadedKeysRef.current.delete(parentKey)
				void loadTreeChildren(parentKey)
			},
			onError: (err) => message.error(formatErr(err)),
		})

		const renameMutation = useMutation({
			mutationFn: async (args: { kind: 'object' | 'prefix'; src: string; name: string }) => {
				if (!props.profileId) throw new Error('profile is required')
				if (!bucket) throw new Error('bucket is required')
				const raw = args.name.trim().replace(/\/+$/, '')
				if (!raw) throw new Error('name is required')
				if (raw === '.' || raw === '..') throw new Error('invalid name')
				if (raw.includes('/')) throw new Error("name must not contain '/'")
				if (raw.includes('\u0000')) throw new Error('invalid name')

				if (args.kind === 'prefix') {
					const srcPrefix = normalizePrefix(args.src)
					const parent = parentPrefixFromKey(srcPrefix.replace(/\/+$/, ''))
					const dstPrefix = `${parent}${raw}/`
					if (dstPrefix === srcPrefix) throw new Error('already in destination')
					if (dstPrefix.startsWith(srcPrefix)) throw new Error('destination must not be under source prefix')
					return createJobWithRetry({
						type: 's5cmd_mv_s3_prefix_to_s3_prefix',
						payload: {
							srcBucket: bucket,
							srcPrefix,
							dstBucket: bucket,
							dstPrefix,
							include: [],
							exclude: [],
							dryRun: false,
						},
					})
				}

				const srcKey = args.src.trim().replace(/^\/+/, '')
				const parent = parentPrefixFromKey(srcKey)
				const dstKey = `${parent}${raw}`
				if (dstKey === srcKey) throw new Error('already in destination')
				return createJobWithRetry({
					type: 's5cmd_mv_s3_to_s3',
					payload: {
						srcBucket: bucket,
						srcKey,
						dstBucket: bucket,
						dstKey,
						dryRun: false,
					},
				})
			},
			onSuccess: async (job) => {
				message.open({
					type: 'success',
					content: (
						<Space>
							<Typography.Text>Rename task started: {job.id}</Typography.Text>
							<Button size="small" type="link" onClick={() => navigate('/jobs')}>
								Open Jobs
							</Button>
						</Space>
					),
					duration: 6,
				})
				setRenameOpen(false)
				setRenameSource(null)
				renameForm.resetFields()
				await queryClient.invalidateQueries({ queryKey: ['jobs'] })
			},
			onError: (err) => message.error(formatErr(err)),
		})

		const pasteObjectsMutation = useMutation({
			mutationFn: async (args: { mode: 'copy' | 'move'; srcBucket: string; srcPrefix: string; keys: string[]; dstBucket: string; dstPrefix: string }) => {
				if (!props.profileId) throw new Error('profile is required')
				if (!bucket) throw new Error('bucket is required')

				const srcBucket = args.srcBucket.trim()
				const dstBucket = args.dstBucket.trim()
				if (!srcBucket) throw new Error('source bucket is required')
				if (!dstBucket) throw new Error('destination bucket is required')

				const srcPrefix = normalizePrefix(args.srcPrefix)
				const dstPrefix = normalizePrefix(args.dstPrefix)

				const uniqueKeys = Array.from(new Set(args.keys.map((k) => k.trim()).filter(Boolean)))
				if (uniqueKeys.length === 0) throw new Error('no keys to paste')
				if (uniqueKeys.length > 50_000) throw new Error('too many keys to paste; use a prefix job instead')

				const items: { srcKey: string; dstKey: string }[] = []
				const dstSet = new Set<string>()

				for (const srcKeyRaw of uniqueKeys) {
					const srcKey = srcKeyRaw.replace(/^\/+/, '')
					if (!srcKey) continue

					let rel: string
					if (srcPrefix && srcKey.startsWith(srcPrefix)) {
						rel = srcKey.slice(srcPrefix.length)
					} else {
						rel = fileNameFromKey(srcKey)
					}
					rel = rel.replace(/^\/+/, '')
					if (!rel) rel = fileNameFromKey(srcKey)

					const dstKey = `${dstPrefix}${rel}`
					if (srcBucket === dstBucket && dstKey === srcKey) continue

					if (dstSet.has(dstKey)) {
						throw new Error(`multiple keys map to the same destination: ${dstKey}`)
					}
					dstSet.add(dstKey)
					items.push({ srcKey, dstKey })
				}

				if (items.length === 0) throw new Error('nothing to paste (already in destination)')

				const type = args.mode === 'copy' ? 's5cmd_cp_s3_to_s3_batch' : 's5cmd_mv_s3_to_s3_batch'
				return createJobWithRetry({
					type,
					payload: {
						srcBucket,
						dstBucket,
						items,
						dryRun: false,
					},
				})
			},
			onSuccess: async (job, args) => {
					message.open({
						type: 'success',
						content: (
							<Space>
								<Typography.Text>{args.mode === 'copy' ? 'Paste copy task' : 'Paste move task'} started: {job.id}</Typography.Text>
								<Button size="small" type="link" onClick={() => navigate('/jobs')}>
									Open Jobs
								</Button>
							</Space>
					),
					duration: 6,
				})
				if (args.mode === 'move') {
					setClipboardObjects(null)
				}
				await queryClient.invalidateQueries({ queryKey: ['jobs'] })
			},
			onError: (err) => message.error(formatErr(err)),
		})

		const openCopyMove = (mode: 'copy' | 'move', key: string) => {
			if (!props.profileId || !bucket) return
			setCopyMoveMode(mode)
			setCopyMoveSrcKey(key)
		setCopyMoveOpen(true)
		copyMoveForm.setFieldsValue({ dstBucket: bucket, dstKey: key, dryRun: false })
	}

	const presignMutation = useMutation({
		mutationFn: (key: string) => api.getObjectDownloadURL({ profileId: props.profileId!, bucket, key }),
		onMutate: (key) => setPresignKey(key),
		onSuccess: (resp, key) => {
			setPresign({ key, url: resp.url, expiresAt: resp.expiresAt })
			setPresignOpen(true)
		},
		onSettled: (_, __, key) => setPresignKey((prev) => (prev === key ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const searchTokens = useMemo(() => splitSearchTokens(search), [search])
	const searchTokensNormalized = useMemo(() => searchTokens.map((token) => normalizeForSearch(token)), [searchTokens])
	const highlightPattern = useMemo(() => {
		if (searchTokens.length === 0) return null
		const uniqueTokens = Array.from(new Set(searchTokens.filter(Boolean))).slice(0, 8)
		if (uniqueTokens.length === 0) return null

		const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const normalizedTokens = uniqueTokens.map((token) => normalizeForSearch(token)).filter(Boolean)
		const rawPatterns = uniqueTokens.map(escape)
		const loosePatterns = normalizedTokens.map((token) => token.split('').map(escape).join('[^\\p{L}\\p{N}]*'))
		const patterns = Array.from(new Set([...rawPatterns, ...loosePatterns])).filter(Boolean)
		if (patterns.length === 0) return null

		return new RegExp(`(${patterns.join('|')})`, 'giu')
	}, [searchTokens])
	const highlightText = useCallback(
		(value: string): ReactNode => {
			if (!value) return value
			if (!highlightPattern) return value

			const parts = value.split(highlightPattern)
			return (
				<span>
					{parts.map((part, idx) => {
						if (idx % 2 === 0) return <span key={idx}>{part}</span>
						return (
							<span key={idx} style={{ background: '#fff1b8', paddingInline: 2, borderRadius: 2 }}>
								{part}
							</span>
						)
					})}
				</span>
			)
		},
		[highlightPattern],
	)

	const rows = useMemo(() => {
		const pages = objectsQuery.data?.pages ?? []
		const prefixes = uniquePrefixes(pages)
		const items = pages.flatMap((p) => p.items)

		const match = (value: string) => matchesSearchTokens(value, searchTokens, searchTokensNormalized)

		const filteredPrefixes = prefixes.filter((p) => match(displayNameForPrefix(p, prefix)) || match(p))
		const ext = extFilter.trim().replace(/^\./, '').toLowerCase()
		let min = typeof minSize === 'number' && Number.isFinite(minSize) ? minSize : null
		let max = typeof maxSize === 'number' && Number.isFinite(maxSize) ? maxSize : null
		if (min != null && max != null && min > max) {
			;[min, max] = [max, min]
		}
		let minTime = typeof minModifiedMs === 'number' && Number.isFinite(minModifiedMs) ? minModifiedMs : null
		let maxTime = typeof maxModifiedMs === 'number' && Number.isFinite(maxModifiedMs) ? maxModifiedMs : null
		if (minTime != null && maxTime != null && minTime > maxTime) {
			;[minTime, maxTime] = [maxTime, minTime]
		}

		const filteredItems = items
			.filter((o) => match(displayNameForKey(o.key, prefix)) || match(o.key))
			.filter((o) => {
				if (ext) {
					if (fileExtensionFromKey(o.key) !== ext) return false
				}
				const size = o.size ?? 0
				if (min != null && size < min) return false
				if (max != null && size > max) return false
				if (minTime != null || maxTime != null) {
					const modified = parseTimeMs(o.lastModified)
					if (!modified) return false
					if (minTime != null && modified < minTime) return false
					if (maxTime != null && modified > maxTime) return false
				}
				return true
			})

		const visiblePrefixes = typeFilter === 'files' ? [] : filteredPrefixes
		const visibleItems = typeFilter === 'folders' ? [] : filteredItems

		const sortedPrefixes = [...visiblePrefixes].sort((a, b) => (sort === 'name_desc' ? b.localeCompare(a) : a.localeCompare(b)))
		const sortedItems = [...visibleItems].sort((a, b) => {
			switch (sort) {
				case 'name_asc':
					return a.key.localeCompare(b.key)
				case 'name_desc':
					return b.key.localeCompare(a.key)
				case 'size_asc':
					return (a.size ?? 0) - (b.size ?? 0) || a.key.localeCompare(b.key)
				case 'size_desc':
					return (b.size ?? 0) - (a.size ?? 0) || a.key.localeCompare(b.key)
				case 'time_asc':
					return parseTimeMs(a.lastModified) - parseTimeMs(b.lastModified) || a.key.localeCompare(b.key)
				case 'time_desc':
					return parseTimeMs(b.lastModified) - parseTimeMs(a.lastModified) || a.key.localeCompare(b.key)
				default:
					return a.key.localeCompare(b.key)
			}
		})

		const out: Row[] = []
		for (const p of sortedPrefixes) out.push({ kind: 'prefix', prefix: p })
		for (const obj of sortedItems) out.push({ kind: 'object', object: obj })
		return out
	}, [extFilter, maxModifiedMs, maxSize, minModifiedMs, minSize, objectsQuery.data, prefix, searchTokens, searchTokensNormalized, sort, typeFilter])

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
		const pages = objectsQuery.data?.pages ?? []
		return {
			rawPrefixCount: uniquePrefixes(pages).length,
			rawFileCount: pages.reduce((sum, p) => sum + p.items.length, 0),
		}
	}, [objectsQuery.data])
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

	const parentRef = useRef<HTMLDivElement | null>(null)
	const rowVirtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 40,
		overscan: 10,
	})

	const virtualItems = rowVirtualizer.getVirtualItems()
	const totalSize = rowVirtualizer.getTotalSize()

	useEffect(() => {
		parentRef.current?.scrollTo({ top: 0 })
	}, [bucket, extFilter, maxModifiedMs, maxSize, minModifiedMs, minSize, prefix, search, sort, typeFilter])

	const bucketOptions = (bucketsQuery.data ?? []).map((b: Bucket) => ({ label: b.name, value: b.name }))
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
		await objectsQuery.refetch()
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

	useEffect(() => {
		setSelectedKeys(new Set())
		setLastSelectedObjectKey(null)
	}, [bucket, prefix, props.profileId])

	const cleanupPreview = useCallback(() => {
		previewAbortRef.current?.()
		previewAbortRef.current = null
		if (previewURLRef.current) {
			URL.revokeObjectURL(previewURLRef.current)
			previewURLRef.current = null
		}
	}, [])

	useEffect(() => {
		treeEpochRef.current++
		treeLoadedKeysRef.current.clear()
		treeLoadingKeysRef.current.clear()
		const initialExpanded = (() => {
			if (!bucket) return ['/']
			const saved = treeExpandedByBucketRef.current[bucket]
			if (!saved || saved.length === 0) return ['/']
			const out = new Set<string>(['/'])
			for (const k of saved) out.add(String(k))
			return Array.from(out)
		})()
		setTreeExpandedKeys(initialExpanded)
		setTreeData([{ key: '/', title: bucket || '(root)', isLeaf: false, icon: <FolderOutlined style={{ color: '#1677ff' }} /> }])
		void loadTreeChildren('/')
	}, [bucket, loadTreeChildren])

	useEffect(() => {
		if (!bucket) return
		setTreeExpandedByBucket((prev) => ({ ...prev, [bucket]: treeExpandedKeys }))
	}, [bucket, setTreeExpandedByBucket, treeExpandedKeys])

	useEffect(() => {
		const key = treeKeyFromPrefix(prefix)
		setTreeSelectedKeys([key])
		const ancestors = treeAncestorKeys(key)
		setTreeExpandedKeys((prev) => {
			const next = new Set(prev)
			for (const k of ancestors) next.add(k)
			return Array.from(next)
		})
		void (async () => {
			for (const k of ancestors) {
				await loadTreeChildren(k)
			}
	})()
	}, [prefix, loadTreeChildren])

	const indexedSearchItems = indexedSearchQuery.data?.pages.flatMap((p) => p.items) ?? []
	const indexedSearchNotIndexed = indexedSearchQuery.error instanceof APIError && indexedSearchQuery.error.code === 'not_indexed'
	const indexedSearchErrorMessage = indexedSearchQuery.isError ? formatErr(indexedSearchQuery.error) : ''

	const selectedCount = selectedKeys.size
	const objectByKey = useMemo(() => {
		const out = new Map<string, ObjectItem>()
		for (const p of objectsQuery.data?.pages ?? []) {
			for (const obj of p.items) out.set(obj.key, obj)
		}
		return out
	}, [objectsQuery.data])
	const singleSelectedKey = selectedCount === 1 ? Array.from(selectedKeys)[0] : null
	const singleSelectedItem = singleSelectedKey ? objectByKey.get(singleSelectedKey) : undefined

	const minTreeWidth = 220
	const maxTreeWidth = 720
	const minDetailsWidth = 320
	const maxDetailsWidth = 920
	const minCenterWidth = 360
	const treeResizeHandleWidth = 12
	const detailsResizeHandleWidth = 12
	const collapsedDetailsWidth = 36
	const minDockedTreeWidth = minCenterWidth + minTreeWidth + treeResizeHandleWidth
	const minDockedDetailsWidth = minDockedTreeWidth + minDetailsWidth + detailsResizeHandleWidth
	const compactListMinWidth = 980

	const dockTree = isDesktop && (layoutWidthPx <= 0 || layoutWidthPx >= minDockedTreeWidth)
	const dockDetails = isWideDesktop && (layoutWidthPx <= 0 || layoutWidthPx >= minDockedDetailsWidth)
	const detailsDocked = dockDetails
	const detailsVisible = detailsDocked ? detailsOpen : detailsDrawerOpen
	const detailsKey = detailsVisible ? singleSelectedKey : null
	const detailsMetaQuery = useQuery({
		queryKey: ['objectMeta', props.profileId, bucket, detailsKey, props.apiToken],
		enabled: !!props.profileId && !!bucket && !!detailsKey && detailsVisible,
		queryFn: () => api.getObjectMeta({ profileId: props.profileId!, bucket, key: detailsKey! }),
		retry: false,
	})
	const detailsMeta = detailsMetaQuery.data ?? null

	const deletePrefixSummaryQuery = useQuery({
		queryKey: ['objectIndexSummary', props.profileId, bucket, deletePrefixConfirmPrefix, props.apiToken],
		enabled: deletePrefixConfirmOpen && !!props.profileId && !!bucket && !!deletePrefixConfirmPrefix,
		queryFn: () => api.getObjectIndexSummary({ profileId: props.profileId!, bucket, prefix: deletePrefixConfirmPrefix, sampleLimit: 5 }),
		retry: false,
	})
	const deletePrefixSummary = deletePrefixSummaryQuery.data ?? null
	const deletePrefixSummaryNotIndexed = deletePrefixSummaryQuery.error instanceof APIError && deletePrefixSummaryQuery.error.code === 'not_indexed'
	const deletePrefixSummaryError = deletePrefixSummaryQuery.isError ? formatErr(deletePrefixSummaryQuery.error) : ''

	const copyPrefixSummaryQuery = useQuery({
		queryKey: ['objectIndexSummary', props.profileId, bucket, copyPrefixSrcPrefix, props.apiToken],
		enabled: copyPrefixOpen && !!props.profileId && !!bucket && !!copyPrefixSrcPrefix,
		queryFn: () => api.getObjectIndexSummary({ profileId: props.profileId!, bucket, prefix: copyPrefixSrcPrefix, sampleLimit: 5 }),
		retry: false,
	})
	const copyPrefixSummary = copyPrefixSummaryQuery.data ?? null
	const copyPrefixSummaryNotIndexed = copyPrefixSummaryQuery.error instanceof APIError && copyPrefixSummaryQuery.error.code === 'not_indexed'
	const copyPrefixSummaryError = copyPrefixSummaryQuery.isError ? formatErr(copyPrefixSummaryQuery.error) : ''

	useEffect(() => {
		cleanupPreview()
		setPreview(null)
	}, [cleanupPreview, detailsKey, detailsVisible])

	const clearSelection = () => {
		setSelectedKeys(new Set())
		setLastSelectedObjectKey(null)
	}

	useEffect(() => {
		if (dockTree) setTreeDrawerOpen(false)
		if (dockDetails) setDetailsDrawerOpen(false)
	}, [dockDetails, dockTree])

	const { treeWidthUsed, detailsWidthUsed } = useMemo(() => {
		let tree = dockTree ? clampNumber(treeWidth, minTreeWidth, maxTreeWidth) : 0
		let details = 0
		if (dockDetails) {
			details = detailsOpen ? clampNumber(detailsWidth, minDetailsWidth, maxDetailsWidth) : collapsedDetailsWidth
		}

		if (!isDesktop || layoutWidthPx <= 0) {
			return { treeWidthUsed: tree, detailsWidthUsed: details }
		}

		if (!dockTree) {
			return { treeWidthUsed: 0, detailsWidthUsed: 0 }
		}

		if (!dockDetails) {
			const handles = treeResizeHandleWidth
			const available = Math.max(0, layoutWidthPx - handles)
			const maxTree = clampNumber(available - minCenterWidth, minTreeWidth, maxTreeWidth)
			tree = clampNumber(tree, minTreeWidth, maxTree)
			return { treeWidthUsed: tree, detailsWidthUsed: 0 }
		}

		const handles = treeResizeHandleWidth + (detailsOpen ? detailsResizeHandleWidth : 0)
		const available = Math.max(0, layoutWidthPx - handles)

		let overflow = tree + details + minCenterWidth - available
		if (overflow > 0 && detailsOpen) {
			const reducible = details - minDetailsWidth
			const reduce = Math.min(reducible, overflow)
			details -= reduce
			overflow -= reduce
		}
		if (overflow > 0) {
			const reducible = tree - minTreeWidth
			const reduce = Math.min(reducible, overflow)
			tree -= reduce
			overflow -= reduce
		}

		return { treeWidthUsed: tree, detailsWidthUsed: details }
	}, [collapsedDetailsWidth, detailsOpen, detailsWidth, dockDetails, dockTree, isDesktop, layoutWidthPx, treeWidth])

	const dynamicMaxTreeWidth = useMemo(() => {
		if (!dockTree || !isDesktop || layoutWidthPx <= 0) return maxTreeWidth
		const handles = treeResizeHandleWidth + (dockDetails && detailsOpen ? detailsResizeHandleWidth : 0)
		const available = Math.max(0, layoutWidthPx - handles)
		const details = dockDetails ? detailsWidthUsed : 0
		return clampNumber(available - minCenterWidth - details, minTreeWidth, maxTreeWidth)
	}, [detailsOpen, detailsWidthUsed, dockDetails, dockTree, isDesktop, layoutWidthPx])

	const dynamicMaxDetailsWidth = useMemo(() => {
		if (!dockDetails || !isDesktop || !detailsOpen || layoutWidthPx <= 0) return maxDetailsWidth
		const handles = treeResizeHandleWidth + detailsResizeHandleWidth
		const available = Math.max(0, layoutWidthPx - handles)
		return clampNumber(available - minCenterWidth - treeWidthUsed, minDetailsWidth, maxDetailsWidth)
	}, [detailsOpen, dockDetails, isDesktop, layoutWidthPx, treeWidthUsed])

	const listViewportWidthPx = useMemo(() => {
		if (layoutWidthPx <= 0) return 0
		if (!isDesktop) return layoutWidthPx
		const handles = (dockTree ? treeResizeHandleWidth : 0) + (dockDetails && detailsOpen ? detailsResizeHandleWidth : 0)
		const tree = dockTree ? treeWidthUsed : 0
		const details = dockDetails ? detailsWidthUsed : 0
		return Math.max(0, layoutWidthPx - handles - tree - details)
	}, [detailsOpen, detailsWidthUsed, dockDetails, dockTree, isDesktop, layoutWidthPx, treeWidthUsed])

	const isCompactList =
		!screens.lg || !isAdvanced || (isDesktop && (listViewportWidthPx <= 0 || listViewportWidthPx < compactListMinWidth))
	const hasActiveFilters =
		typeFilter !== 'all' || !!extFilter.trim() || minSize != null || maxSize != null || minModifiedMs != null || maxModifiedMs != null
	const hasNonDefaultSort = sort !== 'name_asc'
	const hasActiveView = hasActiveFilters || hasNonDefaultSort
	const resetFilters = () => {
		setTypeFilter('all')
		setExtFilter('')
		setMinSize(null)
		setMaxSize(null)
		setMinModifiedMs(null)
		setMaxModifiedMs(null)
		setSort('name_asc')
	}

	const treeResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
	const onTreeResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return
		treeResizeRef.current = { startX: e.clientX, startWidth: treeWidthUsed }
		e.currentTarget.setPointerCapture(e.pointerId)
		e.preventDefault()
	}
	const onTreeResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const state = treeResizeRef.current
		if (!state) return
		const dx = e.clientX - state.startX
		const raw = state.startWidth + dx
		const next = clampNumber(Math.round(raw), minTreeWidth, dynamicMaxTreeWidth)
		setTreeWidth(next)
		e.preventDefault()
	}
	const onTreeResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!treeResizeRef.current) return
		treeResizeRef.current = null
		try {
			e.currentTarget.releasePointerCapture(e.pointerId)
		} catch {
			// ignore
		}
	}

	const detailsResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
	const onDetailsResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return
		detailsResizeRef.current = { startX: e.clientX, startWidth: detailsWidthUsed }
		e.currentTarget.setPointerCapture(e.pointerId)
		e.preventDefault()
	}
	const onDetailsResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const state = detailsResizeRef.current
		if (!state) return
		const dx = state.startX - e.clientX
		const raw = state.startWidth + dx
		const next = clampNumber(Math.round(raw), minDetailsWidth, dynamicMaxDetailsWidth)
		setDetailsWidth(next)
		e.preventDefault()
	}
	const onDetailsResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!detailsResizeRef.current) return
		detailsResizeRef.current = null
		try {
			e.currentTarget.releasePointerCapture(e.pointerId)
		} catch {
			// ignore
		}
	}

		const startUploadFromFiles = (files: File[]) => {
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
			transfers.queueUploadFiles({ profileId: props.profileId, bucket, prefix, files: cleanedFiles })
		}

		const openUploadFilesPicker = () => uploadFilesInputRef.current?.click()
		const openUploadFolderPicker = () => uploadFolderInputRef.current?.click()

		const onUploadDragEnter = (e: React.DragEvent) => {
			if (!props.profileId || !bucket) return
			if (!e.dataTransfer.types.includes('Files')) return
			e.preventDefault()
			uploadDragCounterRef.current += 1
			setUploadDropActive(true)
		}

		const onUploadDragLeave = (e: React.DragEvent) => {
			if (!props.profileId || !bucket) return
			if (!e.dataTransfer.types.includes('Files')) return
			e.preventDefault()
			uploadDragCounterRef.current -= 1
			if (uploadDragCounterRef.current <= 0) {
				uploadDragCounterRef.current = 0
				setUploadDropActive(false)
			}
		}

			const onUploadDragOver = (e: React.DragEvent) => {
				if (!props.profileId || !bucket) return
				if (!e.dataTransfer.types.includes('Files')) return
				e.preventDefault()
				e.dataTransfer.dropEffect = 'copy'
			}

			type WebKitEntry = {
				isFile: boolean
				isDirectory: boolean
				fullPath?: string
				name: string
				file?: (success: (file: File) => void, error?: (err: unknown) => void) => void
				createReader?: () => { readEntries: (success: (entries: WebKitEntry[]) => void, error?: (err: unknown) => void) => void }
			}

			const collectDroppedUploadFiles = async (dt: DataTransfer): Promise<File[]> => {
				const items = Array.from(dt.items ?? [])
				const entries: WebKitEntry[] = []
				for (const item of items) {
					const withEntry = item as DataTransferItem & { webkitGetAsEntry?: () => WebKitEntry | null }
					if (typeof withEntry.webkitGetAsEntry !== 'function') continue
					const entry = withEntry.webkitGetAsEntry()
					if (entry) entries.push(entry)
				}

				if (entries.length === 0) return Array.from(dt.files ?? [])

				const out: (File & { relativePath?: string })[] = []

				const readAllDirEntries = async (dir: WebKitEntry): Promise<WebKitEntry[]> => {
					const reader = dir.createReader?.()
					if (!reader) return []

					const acc: WebKitEntry[] = []
					for (;;) {
						const batch = await new Promise<WebKitEntry[]>((resolve, reject) => {
							reader.readEntries(resolve, reject)
						})
						if (batch.length === 0) break
						acc.push(...batch)
					}
					return acc
				}

				const walk = async (entry: WebKitEntry): Promise<void> => {
					if (entry.isFile) {
						const fileFn = entry.file
						if (!fileFn) return
						const file = await new Promise<File>((resolve, reject) => {
							fileFn(resolve, reject)
						})
						const fullPath = typeof entry.fullPath === 'string' && entry.fullPath ? entry.fullPath : file.name
						const relPath = fullPath.replace(/^\/+/, '')
						const fileWithPath = file as File & { relativePath?: string }
						fileWithPath.relativePath = relPath
						out.push(fileWithPath)
						return
					}

					if (entry.isDirectory) {
						const children = await readAllDirEntries(entry)
						for (const child of children) await walk(child)
					}
				}

				for (const entry of entries) {
					await walk(entry)
				}
				return out
			}

			const onUploadDrop = (e: React.DragEvent) => {
				if (!props.profileId || !bucket) return
				if (!e.dataTransfer.types.includes('Files')) return
				e.preventDefault()
				setUploadDropActive(false)
				uploadDragCounterRef.current = 0

				const dt = e.dataTransfer
				const hasEntryAPI = Array.from(dt.items ?? []).some((item) => typeof (item as { webkitGetAsEntry?: unknown }).webkitGetAsEntry === 'function')
				if (!hasEntryAPI) {
					const files = Array.from(dt.files ?? [])
					startUploadFromFiles(files)
					return
				}

				const key = 'upload_prepare'
				message.open({ type: 'loading', content: 'Preparing folder upload…', duration: 0, key })
				void (async () => {
					try {
						const files = await collectDroppedUploadFiles(dt)
						if (files.length === 0) {
							message.open({ type: 'warning', content: 'No files found', key, duration: 2 })
							return
						}
						message.open({ type: 'success', content: `Queued ${files.length} file(s)`, key, duration: 2 })
						startUploadFromFiles(files)
					} catch (err) {
						message.open({ type: 'error', content: formatErr(err), key, duration: 4 })
					}
				})()
			}

				const normalizeDropTargetPrefix = (raw: string): string => {
					const trimmed = raw.trim()
					if (!trimmed || trimmed === '/') return ''
					return normalizePrefix(trimmed)
			}

			const hasDndPayload = (dt: DataTransfer | null): boolean => {
				if (!dt) return false
				const types = Array.from(dt.types ?? [])
				return types.includes(DND_MIME)
			}

			const parseDndPayload = (dt: DataTransfer): DndPayload | null => {
				const raw = dt.getData(DND_MIME)
				if (!raw) return null
				try {
					const parsed: unknown = JSON.parse(raw)
					if (!parsed || typeof parsed !== 'object') return null
					const rec = parsed as Record<string, unknown>

					const kind = typeof rec['kind'] === 'string' ? rec['kind'] : ''
					const bucket = typeof rec['bucket'] === 'string' ? rec['bucket'] : ''
					if (!bucket) return null

					if (kind === 'objects') {
						const keysRaw = rec['keys']
						const keys = Array.isArray(keysRaw) ? keysRaw.map(String).filter(Boolean) : []
						if (keys.length < 1) return null
						return { kind: 'objects', bucket, keys }
					}
					if (kind === 'prefix') {
						const prefix = typeof rec['prefix'] === 'string' ? rec['prefix'] : ''
						if (!prefix) return null
						return { kind: 'prefix', bucket, prefix }
					}
					return null
				} catch {
					return null
				}
			}

			const dropModeFromEvent = (e: React.DragEvent): 'copy' | 'move' => {
				const isCopy = e.ctrlKey || e.metaKey || e.altKey
				return isCopy ? 'copy' : 'move'
			}

			const createJobAndNotify = async (req: JobCreateRequest) => {
				if (!props.profileId) throw new Error('profile is required')
				const job = await createJobWithRetry(req)
					message.open({
						type: 'success',
						content: (
							<Space>
								<Typography.Text>Task started: {job.id}</Typography.Text>
								<Button size="small" type="link" onClick={() => navigate('/jobs')}>
									Open Jobs
								</Button>
							</Space>
					),
					duration: 6,
				})
				await queryClient.invalidateQueries({ queryKey: ['jobs'] })
				return job
			}

			const performDrop = async (payload: DndPayload, targetPrefixRaw: string, mode: 'copy' | 'move') => {
				if (!props.profileId || !bucket) return
				if (payload.bucket !== bucket) {
					message.warning('Drag & drop across buckets is not supported yet')
					return
				}

				const targetPrefix = normalizeDropTargetPrefix(targetPrefixRaw)

				if (payload.kind === 'prefix') {
					const srcPrefix = normalizePrefix(payload.prefix)
					const folderName = folderLabelFromPrefix(srcPrefix)
					const dstPrefix = `${targetPrefix}${folderName}/`

					if (dstPrefix === srcPrefix) {
						message.info('Already in destination')
						return
					}
					if (dstPrefix.startsWith(srcPrefix)) {
						message.error('Cannot move/copy a folder into itself')
						return
					}

					const doCreate = async () =>
						createJobAndNotify({
							type: mode === 'copy' ? 's5cmd_cp_s3_prefix_to_s3_prefix' : 's5cmd_mv_s3_prefix_to_s3_prefix',
							payload: {
								srcBucket: bucket,
								srcPrefix,
								dstBucket: bucket,
								dstPrefix,
								include: [],
								exclude: [],
								dryRun: false,
							},
						})

					if (mode === 'move') {
						Modal.confirm({
							title: `Move folder?`,
							content: (
								<Space direction="vertical" size="small">
									<Typography.Text>
										Move <Typography.Text code>{`s3://${bucket}/${srcPrefix}`}</Typography.Text> →{' '}
										<Typography.Text code>{`s3://${bucket}/${dstPrefix}`}</Typography.Text>
									</Typography.Text>
									<Typography.Text type="secondary">This will create a job and remove the source objects.</Typography.Text>
								</Space>
							),
								okText: 'Move',
								okType: 'danger',
								onOk: () => doCreate(),
							})
						return
					}

					await doCreate()
					return
				}

				const keys = payload.keys.filter(Boolean)
				if (keys.length < 1) return

				const pairs = keys
					.map((srcKey) => {
						const name = displayNameForKey(srcKey, prefix)
						const dstKey = `${targetPrefix}${name}`
						return { srcKey, dstKey }
					})
					.filter((p) => p.srcKey && p.dstKey)
					.filter((p) => !(p.srcKey === p.dstKey))

				if (pairs.length === 0) {
					message.info('Already in destination')
					return
				}

				const doCreate = async () => {
					if (pairs.length > 1) {
						return createJobAndNotify({
							type: mode === 'copy' ? 's5cmd_cp_s3_to_s3_batch' : 's5cmd_mv_s3_to_s3_batch',
							payload: {
								srcBucket: bucket,
								dstBucket: bucket,
								items: pairs,
								dryRun: false,
							},
						})
					}
					return createJobAndNotify({
						type: mode === 'copy' ? 's5cmd_cp_s3_to_s3' : 's5cmd_mv_s3_to_s3',
						payload: {
							srcBucket: bucket,
							srcKey: pairs[0].srcKey,
							dstBucket: bucket,
							dstKey: pairs[0].dstKey,
							dryRun: false,
						},
					})
				}

				if (mode === 'move') {
					Modal.confirm({
						title: `Move ${pairs.length} object(s)?`,
						content: (
							<Space direction="vertical" size="small">
								<Typography.Text>
									Move to <Typography.Text code>{`s3://${bucket}/${targetPrefix}`}</Typography.Text>
								</Typography.Text>
								<Typography.Text type="secondary">This will create a job and remove the source objects.</Typography.Text>
							</Space>
						),
							okText: 'Move',
							okType: 'danger',
							onOk: () => doCreate(),
						})
					return
				}

				await doCreate()
			}

			const onDndTargetDragOver = (e: React.DragEvent, targetPrefixRaw: string) => {
				if (!canDragDrop) return
				if (!hasDndPayload(e.dataTransfer)) return
				e.preventDefault()
				setDndHoverPrefix(normalizeDropTargetPrefix(targetPrefixRaw))
				e.dataTransfer.dropEffect = dropModeFromEvent(e) === 'copy' ? 'copy' : 'move'
			}

			const onDndTargetDragLeave = (_e: React.DragEvent, targetPrefixRaw: string) => {
				const target = normalizeDropTargetPrefix(targetPrefixRaw)
				setDndHoverPrefix((prev) => (prev === target ? null : prev))
			}

			const onDndTargetDrop = (e: React.DragEvent, targetPrefixRaw: string) => {
				if (!canDragDrop) return
				if (!hasDndPayload(e.dataTransfer)) return
				e.preventDefault()
				setDndHoverPrefix(null)

				const payload = parseDndPayload(e.dataTransfer)
				if (!payload) return
				const mode = dropModeFromEvent(e)
				void performDrop(payload, targetPrefixRaw, mode).catch((err) => message.error(formatErr(err)))
			}

			const onRowDragStartObjects = (e: React.DragEvent, key: string) => {
				if (!canDragDrop) return
				if (!props.profileId || !bucket) return
				const keysToDrag = selectedKeys.has(key) ? Array.from(selectedKeys) : [key]
				if (!selectedKeys.has(key)) {
					setSelectedKeys(new Set([key]))
					setLastSelectedObjectKey(key)
				}
				e.dataTransfer.setData(DND_MIME, JSON.stringify({ kind: 'objects', bucket, keys: keysToDrag }))
				e.dataTransfer.setData('text/plain', keysToDrag.join('\n'))
				e.dataTransfer.effectAllowed = 'copyMove'
			}

			const onRowDragStartPrefix = (e: React.DragEvent, p: string) => {
				if (!canDragDrop) return
				if (!props.profileId || !bucket) return
				const srcPrefix = normalizePrefix(p)
				e.dataTransfer.setData(DND_MIME, JSON.stringify({ kind: 'prefix', bucket, prefix: srcPrefix }))
				e.dataTransfer.setData('text/plain', srcPrefix)
				e.dataTransfer.effectAllowed = 'copyMove'
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
					<Typography.Link
						onClick={() => (canNavigate ? navigateToLocation(bucket, targetPrefix, { recordHistory: true }) : undefined)}
						style={{ whiteSpace: 'nowrap' }}
					>
						{label}
					</Typography.Link>
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
								<Typography.Link style={{ whiteSpace: 'nowrap' }}>.../</Typography.Link>
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

			const selectObjectFromPointerEvent = (e: React.MouseEvent, key: string) => {
				const isRange = e.shiftKey && !!lastSelectedObjectKey
				const isToggle = e.metaKey || e.ctrlKey

		if (isRange && lastSelectedObjectKey && orderedVisibleObjectKeys.length > 0) {
			const a = orderedVisibleObjectKeys.indexOf(lastSelectedObjectKey)
			const b = orderedVisibleObjectKeys.indexOf(key)
			if (a !== -1 && b !== -1) {
				const start = Math.min(a, b)
				const end = Math.max(a, b)
				const range = orderedVisibleObjectKeys.slice(start, end + 1)
				setSelectedKeys((prev) => {
					const next = isToggle ? new Set(prev) : new Set<string>()
					for (const k of range) next.add(k)
					return next
				})
				setLastSelectedObjectKey(key)
				return
			}
		}

		if (isToggle) {
			setSelectedKeys((prev) => {
				const next = new Set(prev)
				if (next.has(key)) next.delete(key)
				else next.add(key)
				return next
			})
			setLastSelectedObjectKey(key)
			return
		}

		setSelectedKeys(new Set([key]))
		setLastSelectedObjectKey(key)
	}

	const selectObjectFromCheckboxEvent = (e: React.MouseEvent, key: string) => {
		e.stopPropagation()

		const isRange = e.shiftKey && !!lastSelectedObjectKey
		const isAdd = e.metaKey || e.ctrlKey

		if (isRange && lastSelectedObjectKey && orderedVisibleObjectKeys.length > 0) {
			const a = orderedVisibleObjectKeys.indexOf(lastSelectedObjectKey)
			const b = orderedVisibleObjectKeys.indexOf(key)
			if (a !== -1 && b !== -1) {
				const start = Math.min(a, b)
				const end = Math.max(a, b)
				const range = orderedVisibleObjectKeys.slice(start, end + 1)
				setSelectedKeys((prev) => {
					const next = isAdd ? new Set(prev) : new Set<string>()
					for (const k of range) next.add(k)
					return next
				})
				setLastSelectedObjectKey(key)
				return
			}
		}

		setSelectedKeys((prev) => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
		setLastSelectedObjectKey(key)
	}

	const ensureObjectSelectedForContextMenu = (key: string) => {
		setSelectedKeys((prev) => {
			if (prev.has(key)) return prev
			return new Set([key])
		})
		setLastSelectedObjectKey(key)
	}

	const openDetails = () => {
		if (dockDetails) {
			setDetailsOpen(true)
			return
		}
		setDetailsDrawerOpen(true)
	}

	const openDetailsForKey = (key: string) => {
		setSelectedKeys(new Set([key]))
		setLastSelectedObjectKey(key)
		openDetails()
	}

	const confirmDeleteObjects = (keys: string[]) => {
		if (keys.length === 0) return

		Modal.confirm({
			title: `Delete ${keys.length} object(s)?`,
			content: 'This cannot be undone.',
			okText: 'Delete',
			okType: 'danger',
			onOk: async () => {
				await deleteMutation.mutateAsync(keys)
			},
		})
	}

	const confirmDeleteSelected = () => {
		confirmDeleteObjects(Array.from(selectedKeys))
	}

	const confirmDeletePrefixAsJob = (dryRun: boolean, prefixOverride?: string) => {
		if (!props.profileId || !bucket) return

		const rawPrefix = (prefixOverride ?? prefix).trim()
		if (!rawPrefix) return
		const effectivePrefix = rawPrefix && !rawPrefix.endsWith('/') ? `${rawPrefix}/` : rawPrefix
		setDeletePrefixConfirmDryRun(dryRun)
		setDeletePrefixConfirmPrefix(effectivePrefix)
		setDeletePrefixConfirmText('')
		setDeletePrefixConfirmOpen(true)
	}

	const handleDeletePrefixConfirm = async () => {
		if (!deletePrefixConfirmPrefix) return
		await deletePrefixJobMutation.mutateAsync({ prefix: deletePrefixConfirmPrefix, dryRun: deletePrefixConfirmDryRun })
		setDeletePrefixConfirmOpen(false)
	}

	const handleDownloadPrefixSubmit = (values: { localPath: string; deleteExtraneous: boolean; dryRun: boolean }) => {
		if (!props.profileId || !bucket) return
		const srcPrefix = normalizePrefix(prefix)
		if (!srcPrefix) return
		const localPath = values.localPath.trim()
		setDownloadPrefixLocalPath(localPath)
		downloadPrefixJobMutation.mutate({
			prefix: srcPrefix,
			localPath,
			deleteExtraneous: values.deleteExtraneous,
			dryRun: values.dryRun,
		})
	}

	const handleCopyPrefixSubmit = (values: {
		dstBucket: string
		dstPrefix: string
		include: string
		exclude: string
		dryRun: boolean
		confirm: string
	}) => {
		if (!props.profileId || !bucket || !copyPrefixSrcPrefix) return
		copyPrefixJobMutation.mutate({
			mode: copyPrefixMode,
			srcPrefix: copyPrefixSrcPrefix,
			dstBucket: values.dstBucket.trim(),
			dstPrefix: normalizePrefix(values.dstPrefix),
			include: splitLines(values.include),
			exclude: splitLines(values.exclude),
			dryRun: values.dryRun,
		})
	}

	const handleCopyMoveSubmit = (values: { dstBucket: string; dstKey: string; dryRun: boolean }) => {
		if (!props.profileId || !bucket || !copyMoveSrcKey) return
		copyMoveMutation.mutate({
			mode: copyMoveMode,
			srcKey: copyMoveSrcKey,
			dstBucket: values.dstBucket.trim(),
			dstKey: values.dstKey.trim(),
			dryRun: values.dryRun,
		})
	}

	const handleRenameSubmit = (values: { name: string }) => {
		if (!renameSource) return
		renameMutation.mutate({ kind: renameKind, src: renameSource, name: values.name })
	}

	const handleRenameCancel = () => {
		setRenameOpen(false)
		setRenameSource(null)
		renameForm.resetFields()
	}

	const onCopy = async (value: string) => {
		const res = await copyToClipboard(value)
		if (res.ok) {
			message.success('Copied')
			return
		}
		message.error(clipboardFailureHint())
	}

	const copySelectionToClipboard = async (mode: 'copy' | 'move') => {
		if (!bucket) return
		const keys = Array.from(selectedKeys)
		if (keys.length === 0) return

		setClipboardObjects({ mode, srcBucket: bucket, srcPrefix: normalizePrefix(prefix), keys })

		const res = await copyToClipboard(keys.join('\n'))
		if (res.ok) {
			message.success(mode === 'copy' ? `Copied ${keys.length} key(s)` : `Cut ${keys.length} key(s)`)
			return
		}
		message.warning(`Saved internally, but clipboard failed: ${clipboardFailureHint()}`)
	}

	const commonPrefixFromKeys = (keys: string[]): string => {
		const parts = keys
			.map((k) => k.replace(/^\/+/, '').split('/').filter(Boolean))
			.filter((p) => p.length > 0)
		if (parts.length === 0) return ''
		let prefixParts = parts[0]
		for (let i = 1; i < parts.length; i++) {
			const next = parts[i]
			let j = 0
			while (j < prefixParts.length && j < next.length && prefixParts[j] === next[j]) j++
			prefixParts = prefixParts.slice(0, j)
			if (prefixParts.length === 0) return ''
		}
		return prefixParts.length ? `${prefixParts.join('/')}/` : ''
	}

	const readClipboardObjectsFromSystemClipboard = async (): Promise<ClipboardObjects | null> => {
		if (!bucket) {
			message.info('Select a bucket first')
			return null
		}
		if (!navigator.clipboard?.readText) {
			message.error(clipboardFailureHint())
			return null
		}

		let text = ''
		try {
			text = await navigator.clipboard.readText()
		} catch {
			message.error(clipboardFailureHint())
			return null
		}
		const lines = text
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
		if (lines.length === 0) {
			message.info('Clipboard is empty')
			return null
		}

		const parsed: { bucket: string; key: string }[] = []
		for (const line of lines) {
			if (line.startsWith('s3://')) {
				const rest = line.slice('s3://'.length)
				const idx = rest.indexOf('/')
				if (idx <= 0) continue
				const b = rest.slice(0, idx)
				const k = rest.slice(idx + 1).replace(/^\/+/, '')
				if (!b || !k) continue
				parsed.push({ bucket: b, key: k })
				continue
			}
			const k = line.replace(/^\/+/, '')
			if (!k) continue
			parsed.push({ bucket, key: k })
		}

		if (parsed.length === 0) {
			message.info('Clipboard does not contain any object keys')
			return null
		}

		const buckets = Array.from(new Set(parsed.map((p) => p.bucket)))
		if (buckets.length !== 1) {
			message.error('Clipboard contains multiple buckets; copy from one bucket at a time')
			return null
		}

		const srcBucket = buckets[0]
		const keys = parsed.map((p) => p.key)
		return { mode: 'copy', srcBucket, srcPrefix: commonPrefixFromKeys(keys), keys }
	}

	const pasteClipboardObjects = async () => {
		if (!props.profileId) {
			message.info('Select a profile first')
			return
		}
		if (!bucket) {
			message.info('Select a bucket first')
			return
		}

		const src = clipboardObjects ?? (await readClipboardObjectsFromSystemClipboard())
		if (!src) return

		setClipboardObjects(src)

		const mode = src.mode
		const doPaste = async () => {
			await pasteObjectsMutation.mutateAsync({
				mode,
				srcBucket: src.srcBucket,
				srcPrefix: src.srcPrefix,
				keys: src.keys,
				dstBucket: bucket,
				dstPrefix: prefix,
			})
		}

		if (mode === 'move') {
			Modal.confirm({
				title: `Move ${src.keys.length} object(s) here?`,
				content: 'This creates an s5cmd mv job (copy then delete source).',
				okText: 'Move',
				okType: 'danger',
				onOk: async () => doPaste(),
			})
			return
		}

		await doPaste()
	}

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
	
	const onDownload = (key: string, expectedBytes?: number) => {
	if (!props.profileId) {
		message.info('Select a profile first')
		return
	}
	if (!bucket) {
		message.info('Select a bucket first')
		return
	}
	
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
						<Button size="small" type="link" onClick={() => navigate('/jobs')}>
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

	const onDownload = (key: string, expectedBytes?: number) => {
		if (!props.profileId) {
			message.info('Select a profile first')
			return
		}
		if (!bucket) {
			message.info('Select a bucket first')
			return
		}

		transfers.queueDownloadObject({
			profileId: props.profileId,
			bucket,
			key,
			expectedBytes,
			label: displayNameForKey(key, prefix),
		})
	}

	const loadPreview = async () => {
		if (!props.profileId || !bucket || !detailsMeta) return
		if (preview?.status === 'loading') return

		const key = detailsMeta.key
		const kind = guessPreviewKind(detailsMeta.contentType, key)
		const contentType = detailsMeta.contentType ?? null
		const size = typeof detailsMeta.size === 'number' && Number.isFinite(detailsMeta.size) ? detailsMeta.size : 0

		if (kind === 'unsupported') {
			setPreview({ key, status: 'unsupported', kind: 'unsupported', contentType, error: 'Preview not supported' })
			return
		}

		const maxBytes = kind === 'image' ? 10 * 1024 * 1024 : 2 * 1024 * 1024
		if (size > maxBytes) {
			message.info(`Preview is limited to ${formatBytes(maxBytes)} (object is ${formatBytes(size)})`)
			return
		}

		cleanupPreview()
		setPreview({ key, status: 'loading', kind, contentType })

		const handle = api.downloadObject({ profileId: props.profileId, bucket, key })
		previewAbortRef.current = handle.abort
		try {
			const resp = await handle.promise
			previewAbortRef.current = null

			if (kind === 'image') {
				const url = URL.createObjectURL(resp.blob)
				previewURLRef.current = url
				setPreview({ key, status: 'ready', kind: 'image', contentType, url })
				return
			}

			const rawText = await resp.blob.text()
			const maxChars = 200_000
			const truncated = rawText.length > maxChars
			let text = truncated ? rawText.slice(0, maxChars) : rawText

			if (kind === 'json') {
				try {
					text = JSON.stringify(JSON.parse(text), null, 2)
				} catch {
					// keep raw text
				}
			}

			setPreview({ key, status: 'ready', kind, contentType, text, truncated })
		} catch (err) {
			previewAbortRef.current = null
			if (err instanceof RequestAbortedError) {
				message.info('Preview canceled')
				setPreview(null)
				return
			}
			setPreview({ key, status: 'error', kind, contentType, error: formatErr(err) })
		}
	}

	const { hasNextPage, isFetchingNextPage, fetchNextPage } = objectsQuery
	const searchAutoScanCap = isAdvanced ? 20_000 : 5_000
	useEffect(() => {
		if (!props.profileId || !bucket) return
		const last = virtualItems[virtualItems.length - 1]
		if (!last) return
		if (last.index >= rows.length - 10 && hasNextPage && !isFetchingNextPage) {
			fetchNextPage().catch(() => {})
		}
	}, [bucket, fetchNextPage, hasNextPage, isFetchingNextPage, props.profileId, rows.length, virtualItems])

	useEffect(() => {
		if (!props.profileId || !bucket) return
		if (!search.trim()) return
		if (!hasNextPage || isFetchingNextPage) return
		if (rawTotalCount >= searchAutoScanCap) return
		fetchNextPage().catch(() => {})
	}, [bucket, fetchNextPage, hasNextPage, isFetchingNextPage, props.profileId, rawTotalCount, search, searchAutoScanCap])

	const handleDownloadSelected = () => {
		if (selectedCount <= 0) {
			message.info('Select objects first')
			return
		}
		const keys = Array.from(selectedKeys)
		if (keys.length === 1) {
			const key = keys[0]
			const item = objectByKey.get(key)
			onDownload(key, item?.size)
			return
		}
		zipObjectsJobMutation.mutate({ keys })
	}

	const commandPrefix = normalizePrefix(prefix)
	const { getObjectActions, getPrefixActions, selectionActionsAll, globalActionsAll } = buildObjectsActionCatalog({
		isAdvanced,
		profileId: props.profileId,
		bucket,
		prefix,
		selectedCount,
		clipboardObjects,
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
		onToggleDetails: () => {
			if (dockDetails) setDetailsOpen((prev) => !prev)
			else setDetailsDrawerOpen((prev) => !prev)
		},
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

	const currentPrefixActionsAll: UIActionOrDivider[] = commandPrefix ? getPrefixActions(commandPrefix) : []
	const currentPrefixActions = filterActionItems(currentPrefixActionsAll, isAdvanced)
	const currentPrefixActionMap = new Map<string, UIAction>()
	for (const item of currentPrefixActionsAll) {
		if ('type' in item) continue
		currentPrefixActionMap.set(item.id, item)
	}
	const selectionActions = filterActions(selectionActionsAll, isAdvanced)
	const selectionActionMap = new Map(selectionActions.map((action) => [action.id, action]))
	const selectionMenuActions = trimActionDividers(
		selectionActions.filter((action) => !['clear_selection', 'delete_selected', 'download_selected'].includes(action.id)),
	)
	const globalActions = filterActions(globalActionsAll, isAdvanced)
	const globalActionMap = new Map(globalActionsAll.map((action) => [action.id, action]))

	const selectedObjectCommandItems: CommandItem[] = singleSelectedKey
		? commandItemsFromActions(filterActionItems(getObjectActions(singleSelectedKey, singleSelectedItem?.size), isAdvanced), 'obj_')
		: []

	const currentFolderCommandItems: CommandItem[] = commandPrefix
		? commandItemsFromActions(currentPrefixActions, 'prefix_').filter((c) => c.id !== 'prefix_open')
		: []
	const commandItems: CommandItem[] = [
		...commandItemsFromActions(globalActions, 'global_'),
		...commandItemsFromActions(selectionActions, 'selection_'),
		...selectedObjectCommandItems,
		...currentFolderCommandItems,
	]
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
	const handleToggleSelectAll = (checked: boolean) => {
		setSelectedKeys((prev) => {
			const next = new Set(prev)
			if (checked) {
				for (const k of visibleObjectKeys) next.add(k)
			} else {
				for (const k of visibleObjectKeys) next.delete(k)
			}
			return next
		})
		setLastSelectedObjectKey(checked ? (orderedVisibleObjectKeys[orderedVisibleObjectKeys.length - 1] ?? null) : null)
	}
	const clearSelectionAction = selectionActionMap.get('clear_selection')
	const deleteSelectionAction = selectionActionMap.get('delete_selected')
	const downloadSelectionAction = selectionActionMap.get('download_selected')
	const showUploadDropOverlay = uploadDropActive && !!props.profileId && !!bucket
	const uploadDropLabel = bucket ? `s3://${bucket}/${normalizePrefix(prefix)}` : '-'
	const listKeydownHandler = useObjectsListKeydown({
		selectedCount,
		singleSelectedKey,
		lastSelectedObjectKey,
		orderedVisibleObjectKeys,
		visibleObjectKeys,
		rowIndexByObjectKey,
		canGoUp,
		onClearSelection: clearSelection,
		onOpenRename: openRenameObject,
		onNewFolder: openNewFolder,
		onCopySelection: (mode) => void copySelectionToClipboard(mode),
		onPasteSelection: () => void pasteClipboardObjects(),
		onOpenDetails: openDetailsForKey,
		onGoUp: onUp,
		onDeleteSelected: confirmDeleteSelected,
		onSelectKeys: (keys) => setSelectedKeys(new Set(keys)),
		onSetLastSelected: setLastSelectedObjectKey,
		onSelectRange: (startKey, endKey) => {
			const a = orderedVisibleObjectKeys.indexOf(startKey)
			const b = orderedVisibleObjectKeys.indexOf(endKey)
			if (a !== -1) {
				const start = Math.min(a, b)
				const end = Math.max(a, b)
				const range = orderedVisibleObjectKeys.slice(start, end + 1)
				setSelectedKeys(new Set(range))
				setLastSelectedObjectKey(endKey)
			} else {
				setSelectedKeys(new Set([endKey]))
				setLastSelectedObjectKey(endKey)
			}
		},
		onScrollToIndex: (index) => rowVirtualizer.scrollToIndex(index),
		onSelectAllLoaded: () => {
			setSelectedKeys((prev) => {
				const next = new Set(prev)
				for (const k of visibleObjectKeys) next.add(k)
				return next
			})
			setLastSelectedObjectKey(orderedVisibleObjectKeys[orderedVisibleObjectKeys.length - 1] ?? null)
		},
		onWarnRenameNoSelection: () => message.info('Select a single object to rename'),
	})
	const handleClearSearch = () => {
		setSearchDraft('')
		setSearch('')
	}
	const canClearSearch = !!search.trim() || !!searchDraft.trim()
	const renderPrefixRow = (p: string, offset: number) => {
		const prefixMenu = buildActionMenu(getPrefixActions(p), isAdvanced)
		return (
			<ObjectsPrefixRow
				key={p}
				offset={offset}
				displayName={displayNameForPrefix(p, prefix)}
				isCompact={isCompactList}
				listGridClassName={listGridClassName}
				canDragDrop={canDragDrop}
				highlightText={highlightText}
				menu={prefixMenu}
				onOpen={() => onOpenPrefix(p)}
				onDragStart={(e) => onRowDragStartPrefix(e, p)}
				onDragEnd={() => setDndHoverPrefix(null)}
			/>
		)
	}
	const renderObjectRow = (object: ObjectItem, offset: number) => {
		const key = object.key
		const isMultiSelectionContext = selectedCount > 1 && selectedKeys.has(key)
		const baseObjectActions = getObjectActions(key, object.size)
		const objectMenuActions = isMultiSelectionContext ? selectionActions : baseObjectActions
		const objectMenu = buildActionMenu(objectMenuActions, isAdvanced)
		const sizeLabel = formatBytes(object.size)
		const timeLabel = formatDateTime(object.lastModified)

		return (
			<ObjectsObjectRow
				key={key}
				offset={offset}
				objectKey={key}
				displayName={displayNameForKey(key, prefix)}
				sizeLabel={sizeLabel}
				timeLabel={timeLabel}
				isSelected={selectedKeys.has(key)}
				isCompact={isCompactList}
				listGridClassName={listGridClassName}
				canDragDrop={canDragDrop}
				highlightText={highlightText}
				menu={objectMenu}
				onClick={(e) => selectObjectFromPointerEvent(e, key)}
				onContextMenu={() => ensureObjectSelectedForContextMenu(key)}
				onCheckboxClick={(e) => selectObjectFromCheckboxEvent(e, key)}
				onDragStart={(e) => onRowDragStartObjects(e, key)}
				onDragEnd={() => setDndHoverPrefix(null)}
			/>
		)
	}
	const listContent = (
		<ObjectsListContent
			rows={rows}
			virtualItems={virtualItems}
			totalSize={totalSize}
			hasProfile={!!props.profileId}
			hasBucket={!!bucket}
			isFetching={objectsQuery.isFetching}
			isFetchingNextPage={objectsQuery.isFetchingNextPage}
			emptyKind={emptyKind}
			canClearSearch={canClearSearch}
			onClearSearch={handleClearSearch}
			renderPrefixRow={renderPrefixRow}
			renderObjectRow={renderObjectRow}
		/>
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
		actionToMenuItem(currentPrefixActionMap.get('copyJob'), undefined, isAdvanced),
		actionToMenuItem(currentPrefixActionMap.get('moveJob'), undefined, isAdvanced),
		actionToMenuItem(currentPrefixActionMap.get('rename'), undefined, isAdvanced),
		{ type: 'divider' as const },
		actionToMenuItem(currentPrefixActionMap.get('downloadZip'), undefined, isAdvanced),
		actionToMenuItem(currentPrefixActionMap.get('downloadToServer'), undefined, isAdvanced),
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
				style={{ display: 'none' }}
				onChange={(e) => {
					const files = Array.from(e.target.files ?? [])
					startUploadFromFiles(files)
					e.target.value = ''
				}}
			/>

			<ObjectsToolbarSection
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
					hasProfile: !!props.profileId,
					bucket,
					selectedCount,
					bucketOptions,
					bucketsLoading: bucketsQuery.isFetching,
					onBucketChange: handleBucketChange,
					canGoBack,
					canGoForward,
					canGoUp,
					onGoBack: goBack,
					onGoForward: goForward,
					onGoUp: onUp,
					uploadMenu: uploadButtonMenu,
					onUploadFiles: openUploadFilesPicker,
					onRefresh: refresh,
					isRefreshing: objectsQuery.isFetching,
					topMoreMenu,
					showPrimaryActions: !isAdvanced,
					primaryDownloadAction: downloadSelectionAction,
					primaryDeleteAction: deleteSelectionAction,
					dockTree,
					dockDetails,
					onOpenTree: () => setTreeDrawerOpen(true),
					onOpenDetails: () => setDetailsDrawerOpen(true),
				}}
			/>

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
				<ObjectsTreeSection
					dockTree={dockTree}
					treeDrawerOpen={treeDrawerOpen}
					hasProfile={!!props.profileId}
					hasBucket={!!bucket}
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

				<ObjectsListSectionContainer
					controls={
						<ObjectsListControls
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
							hasNextPage={objectsQuery.hasNextPage}
							isFetchingNextPage={objectsQuery.isFetchingNextPage}
							rawTotalCount={rawTotalCount}
							searchAutoScanCap={searchAutoScanCap}
							onOpenGlobalSearch={() => {
								if (!isAdvanced) setUiMode('advanced')
								setGlobalSearchOpen(true)
							}}
							canInteract={!!props.profileId && !!bucket}
						/>
					}
					alerts={
						<>
							{objectsQuery.isError ? (
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
					listScrollerRef={parentRef}
					listScrollerTabIndex={0}
					onListScrollerClick={() => parentRef.current?.focus()}
					onListScrollerKeyDown={listKeydownHandler}
					listContent={listContent}
				/>
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
						deleteMutation.mutate([detailsKey])
					}}
					isDeleteLoading={deleteMutation.isPending && deletingKey === detailsKey}
					preview={preview}
					onLoadPreview={loadPreview}
					onCancelPreview={() => previewAbortRef.current?.()}
					canCancelPreview={!!previewAbortRef.current}
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
			</ObjectsLayout>

			<Suspense fallback={null}>
				<ObjectsFiltersDrawer
					open={filtersDrawerOpen}
					onClose={() => setFiltersDrawerOpen(false)}
					isAdvanced={isAdvanced}
					typeFilter={typeFilter}
					onTypeFilterChange={(value) => setTypeFilter(value)}
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
																	<Button size="small" type="link" onClick={() => navigate('/jobs')}>
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
					onClose={() => {
						setPresignOpen(false)
						setPresign(null)
					}}
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
					onCancel={() => setDeletePrefixConfirmOpen(false)}
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
					api={api}
					profileId={props.profileId}
					hasProfile={!!props.profileId}
					sourceLabel={bucket ? `s3://${bucket}/${normalizePrefix(prefix)}*` : '-'}
					form={downloadPrefixForm}
					isSubmitting={downloadPrefixJobMutation.isPending}
					onCancel={() => setDownloadPrefixOpen(false)}
					onBrowse={() => setLocalBrowseOpen(true)}
					onFinish={handleDownloadPrefixSubmit}
				/>

				<LocalPathBrowseModal
					api={api}
					profileId={props.profileId}
					open={localBrowseOpen}
					onCancel={() => setLocalBrowseOpen(false)}
					onSelect={(path) => {
						downloadPrefixForm.setFieldsValue({ localPath: path })
						setLocalBrowseOpen(false)
					}}
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
					isSubmitting={copyPrefixJobMutation.isPending}
					onCancel={() => {
						setCopyPrefixOpen(false)
						setCopyPrefixSrcPrefix('')
					}}
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
					isSubmitting={copyMoveMutation.isPending}
					onCancel={() => setCopyMoveOpen(false)}
					onFinish={handleCopyMoveSubmit}
				/>

			<ObjectsNewFolderModal
				open={newFolderOpen}
				parentLabel={bucket ? `s3://${bucket}/${normalizePrefix(prefix)}` : '-'}
				form={newFolderForm}
				isSubmitting={createFolderMutation.isPending}
				onCancel={() => {
					setNewFolderOpen(false)
					newFolderForm.resetFields()
				}}
				onFinish={(values) => createFolderMutation.mutate({ name: values.name })}
			/>

				<ObjectsRenameModal
					open={renameOpen}
					kind={renameKind}
					source={renameSource}
					bucket={bucket}
					form={renameForm}
					isSubmitting={renameMutation.isPending}
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

function splitLines(v: string): string[] {
	return v
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
}

function splitSearchTokens(value: string): string[] {
	return value
		.trim()
		.split(/\s+/)
		.map((s) => s.trim())
		.filter(Boolean)
}

function normalizeForSearch(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, '')
}

function matchesSearchTokens(value: string, tokens: string[], normalizedTokens?: string[]): boolean {
	if (tokens.length === 0) return true
	const raw = value.toLowerCase()
	let normalizedRaw: string | null = null

	for (let i = 0; i < tokens.length; i++) {
		const rawToken = tokens[i]?.toLowerCase() ?? ''
		if (!rawToken) continue
		if (raw.includes(rawToken)) continue

		const normalizedToken = normalizedTokens?.[i] ?? normalizeForSearch(rawToken)
		if (!normalizedToken) return false

		if (normalizedRaw === null) normalizedRaw = normalizeForSearch(raw)
		if (!normalizedRaw.includes(normalizedToken)) return false
	}
	return true
}

function clampNumber(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min
	if (max < min) return min
	return Math.max(min, Math.min(max, value))
}

function treeKeyFromPrefix(prefix: string): string {
	const p = normalizePrefix(prefix)
	return p ? p : '/'
}

function treeAncestorKeys(prefixKey: string): string[] {
	if (!prefixKey || prefixKey === '/') return ['/']
	const normalized = normalizePrefix(prefixKey)
	const parts = normalized.split('/').filter(Boolean)
	const out: string[] = ['/']
	let current = ''
	for (const part of parts) {
		current += part + '/'
		out.push(current)
	}
	return out
}

function folderLabelFromPrefix(prefix: string): string {
	const trimmed = prefix.replace(/\/+$/, '')
	const parts = trimmed.split('/').filter(Boolean)
	return parts.length ? parts[parts.length - 1] : prefix
}

function fileNameFromKey(key: string): string {
	const trimmed = key.replace(/\/+$/, '')
	const parts = trimmed.split('/').filter(Boolean)
	return parts.length ? parts[parts.length - 1] : trimmed || key
}

function upsertTreeChildren(nodes: DataNode[], targetKey: string, children: DataNode[]): DataNode[] {
	return nodes.map((node) => {
		if (String(node.key) === targetKey) {
			return { ...node, children, isLeaf: children.length === 0 }
		}
		if (node.children && Array.isArray(node.children)) {
			return { ...node, children: upsertTreeChildren(node.children as DataNode[], targetKey, children) }
		}
		return node
	})
}

function displayNameForKey(key: string, currentPrefix: string): string {
	const p = normalizePrefix(currentPrefix)
	if (!p) return key
	if (!key.startsWith(p)) return key
	return key.slice(p.length) || key
}

function displayNameForPrefix(prefix: string, currentPrefix: string): string {
	const p = normalizePrefix(currentPrefix)
	if (!p) return prefix
	if (!prefix.startsWith(p)) return prefix
	return prefix.slice(p.length) || prefix
}

function normalizePrefix(p: string): string {
	const trimmed = p.trim()
	if (!trimmed) return ''
	return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function parentPrefixFromKey(key: string): string {
	const trimmed = key.replace(/\/+$/, '')
	const parts = trimmed.split('/').filter(Boolean)
	if (parts.length <= 1) return ''
	parts.pop()
	return parts.join('/') + '/'
}

function suggestCopyPrefix(srcPrefix: string): string {
	const base = srcPrefix.replace(/\/+$/, '')
	if (!base) return 'copy/'
	return `${base}-copy/`
}

	function uniquePrefixes(pages: ListObjectsResponse[]): string[] {
		const set = new Set<string>()
		for (const p of pages) {
			for (const cp of p.commonPrefixes) {
				set.add(cp)
			}
		}
		return Array.from(set).sort((a, b) => a.localeCompare(b))
	}

	function fileExtensionFromKey(key: string): string {
		const base = key.split('/').filter(Boolean).pop() ?? ''
		const idx = base.lastIndexOf('.')
		if (idx <= 0 || idx === base.length - 1) return ''
		return base.slice(idx + 1).toLowerCase()
	}

	function guessPreviewKind(contentType: string | null | undefined, key: string): 'image' | 'text' | 'json' | 'unsupported' {
		const ct = (contentType ?? '').toLowerCase()
		if (ct.startsWith('image/')) return 'image'
		if (ct.includes('json')) return 'json'
		if (ct.startsWith('text/') || ct.includes('xml') || ct.includes('yaml') || ct.includes('csv') || ct.includes('log')) return 'text'

		const ext = fileExtensionFromKey(key)
		if (ext === 'json') return 'json'
		if (ext === 'svg') return 'text'
		if (['txt', 'log', 'md', 'csv', 'tsv', 'yml', 'yaml', 'xml'].includes(ext)) return 'text'
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image'
		return 'unsupported'
	}

	function parseTimeMs(value: string | null | undefined): number {
		if (!value) return 0
		const d = new Date(value)
		const t = d.getTime()
	if (!Number.isFinite(t)) return 0
	return t
}

function formatDateTime(value: string | null | undefined): string {
	if (!value) return '-'
	const d = new Date(value)
	if (!Number.isFinite(d.getTime())) return value
	return new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		}).format(d)
	}

	function formatErr(err: unknown): string {
		if (err instanceof APIError) return `${err.code}: ${err.message}`
		if (err instanceof Error) return err.message
	return 'unknown error'
}
