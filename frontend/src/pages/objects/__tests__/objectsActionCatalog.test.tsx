import { describe, expect, it } from 'vitest'

import { buildObjectsActionCatalog } from '../objectsActionCatalog'

function noop() {}

describe('buildObjectsActionCatalog', () => {
	function buildCatalog(overrides: Partial<Parameters<typeof buildObjectsActionCatalog>[0]> = {}) {
		return buildObjectsActionCatalog({
			isAdvanced: true,
			isOffline: false,
			profileId: 'profile-1',
			bucket: 'bucket-1',
			prefix: '',
			objectCrudSupported: true,
			presignedDownloadSupported: false,
			uploadSupported: true,
			selectedCount: 0,
			clipboardObjects: null,
			canGoBack: false,
			canGoForward: false,
			canGoUp: false,
			detailsVisible: false,
			activeTabId: 'tab-1',
			tabsCount: 1,
			onGoBack: noop,
			onGoForward: noop,
			onGoUp: noop,
			onDownload: noop,
			onDownloadToDevice: noop,
			onPresign: noop,
			onCopy: noop,
			onOpenLargePreviewForKey: noop,
			onOpenDetailsForKey: noop,
			onOpenRenameObject: noop,
			onOpenCopyMove: noop,
			onConfirmDeleteObjects: noop,
			onOpenPrefix: noop,
			onOpenRenamePrefix: noop,
			onConfirmDeletePrefixAsJob: noop,
			onOpenCopyPrefix: noop,
			onOpenDownloadPrefix: noop,
			onZipPrefix: noop,
			onDownloadSelected: noop,
			onOpenMoveSelected: noop,
			onCopySelectionToClipboard: noop,
			onPasteClipboardObjects: noop,
			onClearSelection: noop,
			onConfirmDeleteSelected: noop,
			onToggleDetails: noop,
			onOpenTreeDrawer: noop,
			onRefresh: noop,
			onOpenPathModal: noop,
			onOpenUpload: noop,
			onOpenNewFolder: noop,
			onOpenCommandPalette: noop,
			onOpenTransfers: noop,
			onAddTab: noop,
			onCloseTab: noop,
			onOpenGlobalSearch: noop,
			onToggleUiMode: noop,
			...overrides,
		})
	}

	it('hides link actions when presigned download URLs are unsupported', () => {
		const catalog = buildCatalog()

		const objectActions = catalog.getObjectActions('sample.txt')
		expect(objectActions.some((item) => !('type' in item) && item.id === 'presign')).toBe(false)
	})

	it('uses explicit labels for switching object workspace complexity', () => {
		const advancedCatalog = buildCatalog({ isAdvanced: true })
		const simpleCatalog = buildCatalog({ isAdvanced: false })

		expect(advancedCatalog.globalActionsAll.find((action) => action.id === 'ui_mode')?.label).toBe('Switch to simple mode')
		expect(simpleCatalog.globalActionsAll.find((action) => action.id === 'ui_mode')?.label).toBe('Switch to advanced mode')
	})
})
