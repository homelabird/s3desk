import { CloudUploadOutlined, CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FolderAddOutlined, FolderOutlined, InfoCircleOutlined, LeftOutlined, LinkOutlined, ReloadOutlined, RightOutlined, SearchOutlined, SnippetsOutlined, UpOutlined } from '@ant-design/icons'

import type { UIAction, UIActionOrDivider } from './objectsActions'

export type ClipboardObjects = {
	mode: 'copy' | 'move'
	srcBucket: string
	srcPrefix: string
	keys: string[]
}

type ObjectsActionDeps = {
	isAdvanced: boolean
	profileId: string | null
	bucket: string
	prefix: string
	selectedCount: number
	clipboardObjects: ClipboardObjects | null
	canGoBack: boolean
	canGoForward: boolean
	canGoUp: boolean
	detailsVisible: boolean
	activeTabId: string
	tabsCount: number
	onGoBack: () => void
	onGoForward: () => void
	onGoUp: () => void
	onDownload: (key: string, size?: number) => void
	onPresign: (key: string) => void
	onCopy: (value: string) => void
	onOpenDetailsForKey: (key: string) => void
	onOpenRenameObject: (key: string) => void
	onOpenCopyMove: (mode: 'copy' | 'move', key: string) => void
	onConfirmDeleteObjects: (keys: string[]) => void
	onOpenPrefix: (prefix: string) => void
	onOpenRenamePrefix: (prefix: string) => void
	onConfirmDeletePrefixAsJob: (dryRun: boolean, prefixOverride?: string) => void
	onOpenCopyPrefix: (mode: 'copy' | 'move', prefix: string) => void
	onOpenDownloadPrefix: (prefix: string) => void
	onZipPrefix: (prefix: string) => void
	onDownloadSelected: () => void
	onCopySelectionToClipboard: (mode: 'copy' | 'move') => void
	onPasteClipboardObjects: () => void
	onClearSelection: () => void
	onConfirmDeleteSelected: () => void
	onToggleDetails: () => void
	onOpenTreeDrawer: () => void
	onRefresh: () => void
	onOpenPathModal: () => void
	onOpenUploadFiles: () => void
	onOpenUploadFolder: () => void
	onOpenNewFolder: () => void
	onOpenCommandPalette: () => void
	onOpenTransfers: () => void
	onAddTab: () => void
	onCloseTab: (tabId: string) => void
	onOpenGlobalSearch: () => void
	onToggleUiMode: () => void
}

export type ObjectsActionCatalog = {
	getObjectActions: (objectKey: string, objectSize?: number) => UIActionOrDivider[]
	getPrefixActions: (targetPrefix: string) => UIActionOrDivider[]
	selectionActionsAll: UIAction[]
	globalActionsAll: UIAction[]
}

export function buildObjectsActionCatalog(deps: ObjectsActionDeps): ObjectsActionCatalog {
	const getObjectActions = (objectKey: string, objectSize?: number): UIActionOrDivider[] => {
		const canUseObjectActions = !!deps.profileId && !!deps.bucket
		const downloadAction: UIAction = {
			id: 'download',
			label: 'Download (client)',
			shortLabel: 'Download',
			icon: <DownloadOutlined />,
			keywords: 'download client save',
			enabled: canUseObjectActions,
			run: () => deps.onDownload(objectKey, objectSize),
		}
		const presignAction: UIAction = {
			id: 'presign',
			label: 'Link…',
			icon: <LinkOutlined />,
			keywords: 'url link download',
			enabled: canUseObjectActions,
			audience: 'advanced',
			run: () => deps.onPresign(objectKey),
		}
		const copyAction: UIAction = {
			id: 'copy',
			label: 'Copy key',
			icon: <CopyOutlined />,
			keywords: 'copy clipboard',
			enabled: true,
			audience: 'advanced',
			run: () => deps.onCopy(objectKey),
		}
		const detailsAction: UIAction = {
			id: 'details',
			label: 'Details',
			icon: <InfoCircleOutlined />,
			keywords: 'details metadata preview',
			enabled: canUseObjectActions,
			audience: 'advanced',
			run: () => deps.onOpenDetailsForKey(objectKey),
		}
		const renameAction: UIAction = {
			id: 'rename',
			label: 'Rename (F2)…',
			icon: <EditOutlined />,
			keywords: 'rename f2',
			enabled: canUseObjectActions,
			audience: 'advanced',
			run: () => deps.onOpenRenameObject(objectKey),
		}
		const deleteAction: UIAction = {
			id: 'delete',
			label: 'Delete',
			icon: <DeleteOutlined />,
			keywords: 'delete remove',
			danger: true,
			enabled: canUseObjectActions,
			run: () => deps.onConfirmDeleteObjects([objectKey]),
		}

		const jobActions: UIActionOrDivider[] = [
			{
				id: 'copyJob',
				label: 'Copy…',
				icon: <SnippetsOutlined />,
				keywords: 'copy duplicate job',
				enabled: canUseObjectActions,
				audience: 'advanced',
				run: () => deps.onOpenCopyMove('copy', objectKey),
			},
			{
				id: 'moveJob',
				label: 'Move/Rename…',
				icon: <EditOutlined />,
				keywords: 'move rename mv job',
				enabled: canUseObjectActions,
				audience: 'advanced',
				run: () => deps.onOpenCopyMove('move', objectKey),
			},
		]

		return [
			downloadAction,
			presignAction,
			copyAction,
			detailsAction,
			{ type: 'divider' },
			renameAction,
			...jobActions,
			{ type: 'divider' },
			deleteAction,
		]
	}

	const getPrefixActions = (targetPrefix: string): UIActionOrDivider[] => {
		const canUsePrefixActions = !!deps.profileId && !!deps.bucket
		const openAction: UIAction = {
			id: 'open',
			label: 'Open',
			icon: <FolderOutlined />,
			keywords: 'open folder enter',
			enabled: canUsePrefixActions,
			run: () => deps.onOpenPrefix(targetPrefix),
		}
		const copyAction: UIAction = {
			id: 'copy',
			label: 'Copy folder path',
			icon: <CopyOutlined />,
			keywords: 'copy clipboard path',
			enabled: true,
			audience: 'advanced',
			run: () => deps.onCopy(targetPrefix),
		}
		const downloadZipAction: UIAction = {
			id: 'downloadZip',
			label: 'Download folder (zip)',
			shortLabel: 'Download zip',
			icon: <DownloadOutlined />,
			keywords: 'download zip folder client',
			enabled: canUsePrefixActions,
			audience: 'advanced',
			run: () => deps.onZipPrefix(targetPrefix),
		}
		const renameAction: UIAction = {
			id: 'rename',
			label: 'Rename folder…',
			icon: <EditOutlined />,
			keywords: 'rename folder',
			enabled: canUsePrefixActions,
			audience: 'advanced',
			run: () => deps.onOpenRenamePrefix(targetPrefix),
		}
		const deleteAction: UIAction = {
			id: 'delete',
			label: 'Delete folder…',
			icon: <DeleteOutlined />,
			keywords: 'delete remove rm folder',
			danger: true,
			enabled: canUsePrefixActions,
			audience: 'advanced',
			run: () => deps.onConfirmDeletePrefixAsJob(false, targetPrefix),
		}

		const jobActions: UIActionOrDivider[] = [
			{
				id: 'copyJob',
				label: 'Copy folder…',
				icon: <SnippetsOutlined />,
				keywords: 'copy cp folder job',
				enabled: canUsePrefixActions,
				audience: 'advanced',
				run: () => deps.onOpenCopyPrefix('copy', targetPrefix),
			},
			{
				id: 'moveJob',
				label: 'Move folder…',
				icon: <EditOutlined />,
				keywords: 'move mv folder job',
				danger: true,
				enabled: canUsePrefixActions,
				audience: 'advanced',
				run: () => deps.onOpenCopyPrefix('move', targetPrefix),
			},
			{
				id: 'downloadToServer',
				label: 'Download to server (backup)…',
				icon: <DownloadOutlined />,
				keywords: 'download sync local backup server',
				enabled: canUsePrefixActions,
				audience: 'advanced',
				run: () => deps.onOpenDownloadPrefix(targetPrefix),
			},
			{
				id: 'deleteDry',
				label: 'Dry run delete folder…',
				icon: <DeleteOutlined />,
				keywords: 'preview dry-run safe delete rm folder',
				danger: true,
				enabled: canUsePrefixActions,
				audience: 'advanced',
				run: () => deps.onConfirmDeletePrefixAsJob(true, targetPrefix),
			},
		]

		return [
			openAction,
			copyAction,
			{ type: 'divider' },
			downloadZipAction,
			{ type: 'divider' },
			renameAction,
			deleteAction,
			{ type: 'divider' },
			...jobActions,
		]
	}

	const canUseSelectionActions = !!deps.profileId && !!deps.bucket
	const selectionIsBulk = deps.selectedCount > 1
	const selectionActionsAll: UIAction[] = [
		{
			id: 'download_selected',
			label: selectionIsBulk ? 'Download selection (zip)' : 'Download (client)',
			shortLabel: selectionIsBulk ? 'Download zip' : 'Download',
			icon: <DownloadOutlined />,
			keywords: selectionIsBulk ? 'zip download selection' : 'download client',
			enabled: canUseSelectionActions && deps.selectedCount > 0,
			run: () => deps.onDownloadSelected(),
		},
		{
			id: 'copy_selected_keys',
			label: 'Copy selected keys',
			shortLabel: 'Copy',
			icon: <CopyOutlined />,
			keywords: 'clipboard ctrl+c',
			enabled: deps.selectedCount > 0,
			audience: 'advanced',
			run: () => deps.onCopySelectionToClipboard('copy'),
		},
		{
			id: 'cut_selected_keys',
			label: 'Cut selected keys',
			shortLabel: 'Cut',
			icon: <EditOutlined />,
			keywords: 'clipboard ctrl+x move',
			enabled: deps.selectedCount > 0,
			audience: 'advanced',
			run: () => deps.onCopySelectionToClipboard('move'),
		},
		{
			id: 'paste_keys',
			label: deps.clipboardObjects?.mode === 'move' ? 'Paste (Move)…' : 'Paste',
			icon: <SnippetsOutlined />,
			keywords: 'clipboard ctrl+v',
			enabled: !!deps.profileId && !!deps.bucket && (!!deps.clipboardObjects || !!navigator.clipboard?.readText),
			audience: 'advanced',
			run: () => deps.onPasteClipboardObjects(),
		},
		{
			id: 'clear_selection',
			label: 'Clear selection',
			shortLabel: 'Clear',
			icon: <DeleteOutlined />,
			keywords: 'unselect escape',
			enabled: deps.selectedCount > 0,
			run: () => deps.onClearSelection(),
		},
		{
			id: 'delete_selected',
			label: deps.selectedCount > 1 ? 'Delete selection…' : 'Delete',
			shortLabel: 'Delete',
			icon: <DeleteOutlined />,
			keywords: 'delete remove',
			danger: true,
			enabled: deps.selectedCount > 0,
			run: () => deps.onConfirmDeleteSelected(),
		},
	]

	const globalActionsAll: UIAction[] = [
		{
			id: 'nav_back',
			label: 'Back',
			icon: <LeftOutlined />,
			keywords: 'history',
			enabled: !!deps.profileId && deps.canGoBack,
			audience: 'advanced',
			run: () => deps.onGoBack(),
		},
		{
			id: 'nav_forward',
			label: 'Forward',
			icon: <RightOutlined />,
			keywords: 'history',
			enabled: !!deps.profileId && deps.canGoForward,
			audience: 'advanced',
			run: () => deps.onGoForward(),
		},
		{
			id: 'nav_up',
			label: 'Go up',
			icon: <UpOutlined />,
			keywords: 'parent folder backspace',
			enabled: !!deps.profileId && !!deps.bucket && deps.canGoUp,
			audience: 'advanced',
			run: () => deps.onGoUp(),
		},
		{
			id: 'toggle_details',
			label: deps.detailsVisible ? 'Hide details' : 'Show details',
			icon: <InfoCircleOutlined />,
			keywords: 'details preview panel',
			enabled: !!deps.profileId,
			audience: 'advanced',
			run: () => deps.onToggleDetails(),
		},
		{
			id: 'open_folders',
			label: 'Folders',
			icon: <FolderOutlined />,
			keywords: 'tree navigation',
			enabled: !!deps.profileId,
			audience: 'advanced',
			run: () => deps.onOpenTreeDrawer(),
		},
		{
			id: 'refresh',
			label: 'Refresh',
			icon: <ReloadOutlined />,
			keywords: 'reload refetch',
			enabled: !!deps.profileId && !!deps.bucket,
			run: () => deps.onRefresh(),
		},
		{
			id: 'go_to_path',
			label: 'Go to path… (Ctrl+L)',
			icon: <SearchOutlined />,
			keywords: 'ctrl+l address prefix jump',
			enabled: !!deps.profileId && !!deps.bucket,
			audience: 'advanced',
			run: () => deps.onOpenPathModal(),
		},
		{
			id: 'upload_files',
			label: 'Upload files',
			icon: <CloudUploadOutlined />,
			keywords: 'upload files',
			enabled: !!deps.profileId && !!deps.bucket,
			run: () => deps.onOpenUploadFiles(),
		},
		{
			id: 'upload_folder',
			label: 'Upload folder',
			icon: <FolderOutlined />,
			keywords: 'upload folder',
			enabled: !!deps.profileId && !!deps.bucket,
			run: () => deps.onOpenUploadFolder(),
		},
		{
			id: 'new_folder',
			label: 'New folder',
			icon: <FolderAddOutlined />,
			keywords: 'mkdir folder',
			enabled: !!deps.profileId && !!deps.bucket,
			run: () => deps.onOpenNewFolder(),
		},
		{
			id: 'commands',
			label: 'Commands (Ctrl+K)',
			icon: <SnippetsOutlined />,
			keywords: 'palette shortcuts',
			enabled: !!deps.profileId,
			audience: 'advanced',
			run: () => deps.onOpenCommandPalette(),
		},
		{
			id: 'transfers',
			label: 'Transfers',
			icon: <DownloadOutlined />,
			keywords: 'downloads jobs transfers',
			enabled: !!deps.profileId,
			audience: 'advanced',
			run: () => deps.onOpenTransfers(),
		},
		{
			id: 'new_tab',
			label: 'New tab',
			icon: <FolderOutlined />,
			keywords: 'tabs',
			enabled: true,
			audience: 'advanced',
			run: () => deps.onAddTab(),
		},
		{
			id: 'close_tab',
			label: 'Close tab',
			icon: <DeleteOutlined />,
			keywords: 'tabs',
			enabled: deps.tabsCount > 1 && !!deps.activeTabId,
			audience: 'advanced',
			run: () => deps.onCloseTab(deps.activeTabId),
		},
		{
			id: 'global_search',
			label: 'Global search',
			icon: <SearchOutlined />,
			keywords: 'index search',
			enabled: !!deps.profileId && !!deps.bucket,
			audience: 'advanced',
			run: () => deps.onOpenGlobalSearch(),
		},
		{
			id: 'ui_mode',
			label: deps.isAdvanced ? 'Basic view' : 'Advanced tools',
			icon: <SnippetsOutlined />,
			keywords: 'simple advanced view mode',
			enabled: !!deps.profileId,
			run: () => deps.onToggleUiMode(),
		},
	]

	return {
		getObjectActions,
		getPrefixActions,
		selectionActionsAll,
		globalActionsAll,
	}
}
