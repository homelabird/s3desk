import { describe, expect, it, vi } from 'vitest'

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
			isBookmarked: false,
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
			onToggleBookmark: noop,
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

	it('uses task-focused labels for switching object workspace tools', () => {
		const advancedCatalog = buildCatalog({ isAdvanced: true })
		const simpleCatalog = buildCatalog({ isAdvanced: false })

		expect(advancedCatalog.globalActionsAll.find((action) => action.id === 'ui_mode')?.label).toBe('Hide workspace tools')
		expect(simpleCatalog.globalActionsAll.find((action) => action.id === 'ui_mode')?.label).toBe('Show workspace tools')
	})

	it('labels the current location bookmark action by state', () => {
		const unbookmarkedCatalog = buildCatalog({ isBookmarked: false })
		const bookmarkedCatalog = buildCatalog({ isBookmarked: true })

		expect(unbookmarkedCatalog.globalActionsAll.find((action) => action.id === 'toggle_location_bookmark')?.label).toBe(
			'Bookmark this location',
		)
		expect(bookmarkedCatalog.globalActionsAll.find((action) => action.id === 'toggle_location_bookmark')?.label).toBe(
			'Remove location bookmark',
		)
	})

	it('copies the current bucket location from the global location action', () => {
		const onCopy = vi.fn()
		const catalog = buildCatalog({ bucket: 'bucket-1', prefix: 'reports/2026/', onCopy })

		catalog.globalActionsAll.find((action) => action.id === 'copy_location')?.run()

		expect(onCopy).toHaveBeenCalledWith('s3://bucket-1/reports/2026/')
	})
})
