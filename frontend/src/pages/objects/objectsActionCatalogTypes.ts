import type { UIAction, UIActionOrDivider } from './objectsActions'

export type ClipboardObjects = {
	mode: 'copy' | 'move'
	srcProfileId: string | null
	srcBucket: string
	srcPrefix: string
	keys: string[]
}

export type ObjectsActionDeps = {
	isAdvanced: boolean
	isOffline: boolean
	profileId: string | null
	bucket: string
	prefix: string
	objectCrudSupported: boolean
	presignedDownloadSupported: boolean
	uploadSupported: boolean
	selectedCount: number
	clipboardObjects: ClipboardObjects | null
	isBookmarked: boolean
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
	onDownloadToDevice: (key: string, size?: number) => void
	onPresign: (key: string) => void
	onCopy: (value: string) => void
	onOpenLargePreviewForKey: (key: string) => void
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
	onOpenMoveSelected: () => void
	onCopySelectionToClipboard: (mode: 'copy' | 'move') => void
	onPasteClipboardObjects: () => void
	onClearSelection: () => void
	onConfirmDeleteSelected: () => void
	onToggleDetails: () => void
	onOpenTreeDrawer: () => void
	onRefresh: () => void
	onToggleBookmark: () => void
	onOpenPathModal: () => void
	onOpenUpload: () => void
	onOpenNewFolder: (parentPrefixOverride?: string) => void
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
