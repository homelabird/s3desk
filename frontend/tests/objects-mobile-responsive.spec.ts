import { expect, test, type Page } from '@playwright/test'

import {
	installObjectsMobileResponsiveFixtures,
	seedObjectsMobileResponsiveStorage,
} from './support/objectsMobileResponsive'
import {
	OBJECTS_DETAILS_ACTION_ROW_SELECTOR,
	OBJECTS_DETAILS_PREVIEW_ACTIONS_SELECTOR,
	OBJECTS_FILTERS_ACTIONS_SELECTOR,
	OBJECTS_FILTERS_CONTENT_SELECTOR,
	OBJECTS_FILTERS_SHEET_SELECTOR,
	OBJECTS_FOLDERS_PANE_BODY_SELECTOR,
	OBJECTS_FOLDERS_PANE_HEADER_SELECTOR,
	OBJECTS_FOLDERS_PANE_SELECTOR,
	OBJECTS_GLOBAL_SEARCH_ACTIONS_SELECTOR,
	OBJECTS_GLOBAL_SEARCH_CONTENT_SELECTOR,
	OBJECTS_GLOBAL_SEARCH_INDEX_TOGGLE_SELECTOR,
	OBJECTS_GLOBAL_SEARCH_RESULT_CARD_SELECTOR,
	OBJECTS_GLOBAL_SEARCH_SHEET_SELECTOR,
	OBJECTS_IMAGE_VIEWER_FOOTER_SELECTOR,
	OBJECTS_IMAGE_VIEWER_META_SELECTOR,
	OBJECTS_IMAGE_VIEWER_STAGE_SELECTOR,
	OBJECTS_LIST_CONTROLS_ROOT_SELECTOR,
	OBJECTS_LIST_HEADER_ROW_SELECTOR,
	OBJECTS_LIST_ROW_SELECTOR,
	OBJECTS_PAGE_HEADER_SELECTOR,
	OBJECTS_SELECTION_BAR_SELECTOR,
	OBJECTS_TOOLBAR_MOBILE_ACTIONS_SELECTOR,
	OBJECTS_TOOLBAR_MOBILE_TOP_ROW_SELECTOR,
	OBJECTS_TREE_CONTENT_SELECTOR,
	OBJECTS_TREE_SHEET_SELECTOR,
	dialogByName,
	gotoWithDynamicImportRecovery,
	objectsListRow,
	objectsSelectionCheckbox,
} from './support/ui'

async function openObjectsMobilePage(page: Page) {
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'), {
		timeout: 10_000,
		maxAttempts: 3,
	})
}

const objectsMetricSelectors = {
	detailsActionRow: OBJECTS_DETAILS_ACTION_ROW_SELECTOR,
	detailsPreviewActions: OBJECTS_DETAILS_PREVIEW_ACTIONS_SELECTOR,
	filtersActions: OBJECTS_FILTERS_ACTIONS_SELECTOR,
	filtersContent: OBJECTS_FILTERS_CONTENT_SELECTOR,
	filtersSheet: OBJECTS_FILTERS_SHEET_SELECTOR,
	foldersPane: OBJECTS_FOLDERS_PANE_SELECTOR,
	foldersPaneBody: OBJECTS_FOLDERS_PANE_BODY_SELECTOR,
	foldersPaneHeader: OBJECTS_FOLDERS_PANE_HEADER_SELECTOR,
	globalSearchActions: OBJECTS_GLOBAL_SEARCH_ACTIONS_SELECTOR,
	globalSearchContent: OBJECTS_GLOBAL_SEARCH_CONTENT_SELECTOR,
	globalSearchIndexToggle: OBJECTS_GLOBAL_SEARCH_INDEX_TOGGLE_SELECTOR,
	globalSearchResultCard: OBJECTS_GLOBAL_SEARCH_RESULT_CARD_SELECTOR,
	globalSearchSheet: OBJECTS_GLOBAL_SEARCH_SHEET_SELECTOR,
	imageViewerFooter: OBJECTS_IMAGE_VIEWER_FOOTER_SELECTOR,
	imageViewerMeta: OBJECTS_IMAGE_VIEWER_META_SELECTOR,
	imageViewerStage: OBJECTS_IMAGE_VIEWER_STAGE_SELECTOR,
	listControlsRoot: OBJECTS_LIST_CONTROLS_ROOT_SELECTOR,
	listHeaderRow: OBJECTS_LIST_HEADER_ROW_SELECTOR,
	listRow: OBJECTS_LIST_ROW_SELECTOR,
	pageHeader: OBJECTS_PAGE_HEADER_SELECTOR,
	selectionBar: OBJECTS_SELECTION_BAR_SELECTOR,
	toolbarMobileActions: OBJECTS_TOOLBAR_MOBILE_ACTIONS_SELECTOR,
	toolbarMobileTopRow: OBJECTS_TOOLBAR_MOBILE_TOP_ROW_SELECTOR,
	treeContent: OBJECTS_TREE_CONTENT_SELECTOR,
	treeSheet: OBJECTS_TREE_SHEET_SELECTOR,
} as const

test.describe('@mobile-responsive Objects mobile workflows', () => {
	test.beforeEach(async ({ page }) => {
		await installObjectsMobileResponsiveFixtures(page)
		await seedObjectsMobileResponsiveStorage(page)
	})

	test('keeps the mobile header compact enough to expose location controls above the fold', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await expect(page.getByTestId('objects-page-header')).toBeVisible()
		await expect(page.getByTestId('objects-list-controls-root')).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const header = document.querySelector(selectors.pageHeader)
			const controls = document.querySelector(selectors.listControlsRoot)
			if (!(header instanceof HTMLElement) || !(controls instanceof HTMLElement)) return null
			const headerRect = header.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const controlsRect = controls.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			return {
				headerHeight: Math.round(headerRect.height),
				controlsTop: Math.round(controlsRect.top),
				viewportHeight: window.innerHeight,
			}
		}, objectsMetricSelectors)

		if (!metrics) {
			throw new Error('Missing mobile header metrics')
		}

		expect(metrics.headerHeight, JSON.stringify(metrics)).toBeLessThan(200)
		expect(metrics.controlsTop, JSON.stringify(metrics)).toBeLessThan(280)
	})

	test('keeps the toolbar action strip compact at mid-width mobile breakpoints', async ({ page }) => {
		await page.setViewportSize({ width: 640, height: 844 })
		await openObjectsMobilePage(page)

		await expect(page.getByTestId('objects-toolbar-mobile-top-row')).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const row = document.querySelector(selectors.toolbarMobileTopRow)
			const actions = document.querySelector(selectors.toolbarMobileActions)
			if (!(row instanceof HTMLElement) || !(actions instanceof HTMLElement)) return null

			const rowRect = row.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const buttonHeights = Array.from(actions.querySelectorAll('button')).map((button) =>
				Math.round(button.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
			)

			return {
				rowHeight: Math.round(rowRect.height),
				maxButtonHeight: Math.max(...buttonHeights),
				buttonCount: buttonHeights.length,
			}
		}, objectsMetricSelectors)

		if (!metrics) {
			throw new Error('Missing mobile toolbar metrics')
		}

		expect(metrics.buttonCount, JSON.stringify(metrics)).toBeGreaterThan(4)
		expect(metrics.rowHeight, JSON.stringify(metrics)).toBeLessThan(44)
		expect(metrics.maxButtonHeight, JSON.stringify(metrics)).toBeLessThan(34)
	})

	test('keeps compact object rows dense on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		const row = objectsListRow(page, 'alpha.txt')
		await expect(row).toBeVisible()

		const metrics = await row.evaluate((element) => {
			const rowRect = element.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const actionButtons = element.querySelectorAll('button')
			const buttonHeights = Array.from(actionButtons).map((button) =>
				Math.round(button.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
			)
			return {
				rowHeight: Math.round(rowRect.height),
				maxButtonHeight: Math.max(...buttonHeights),
			}
		})

		expect(metrics.rowHeight, JSON.stringify(metrics)).toBeLessThan(56)
		expect(metrics.maxButtonHeight, JSON.stringify(metrics)).toBeLessThan(34)
	})

	test('keeps grid cards and preview actions compact on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: /Grid/i }).click()
		await expect(page.getByTestId('objects-grid-content')).toBeVisible()

		const card = objectsListRow(page, 'preview.png')
		await expect(card).toBeVisible()
		const previewButton = card.getByRole('button', { name: 'Open large preview for preview.png' })
		await expect(previewButton).toBeVisible()

		const metrics = await card.evaluate((element) => {
			const cardRect = element.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const actionButtons = element.querySelectorAll('button')
			const buttonHeights = Array.from(actionButtons).map((button) =>
				Math.round(button.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
			)
			return {
				cardHeight: Math.round(cardRect.height),
				maxButtonHeight: Math.max(...buttonHeights),
			}
		})

		expect(metrics.cardHeight, JSON.stringify(metrics)).toBeLessThan(280)
		expect(metrics.maxButtonHeight, JSON.stringify(metrics)).toBeLessThan(34)
	})

	test('keeps the selection bar and list header compact after selecting an object on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await objectsSelectionCheckbox(page, 'alpha.txt').click()
		await expect(page.getByTestId('objects-selection-bar')).toBeVisible()
		await expect(page.getByTestId('objects-list-header-row')).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const selectionBar = document.querySelector(selectors.selectionBar)
			const listHeader = document.querySelector(selectors.listHeaderRow)
			const firstRow = document.querySelector(selectors.listRow)
			if (!(selectionBar instanceof HTMLElement) || !(listHeader instanceof HTMLElement) || !(firstRow instanceof HTMLElement)) {
				return null
			}

			const selectionBarRect = selectionBar.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const listHeaderRect = listHeader.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const firstRowRect = firstRow.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract

			return {
				selectionBarHeight: Math.round(selectionBarRect.height),
				listHeaderHeight: Math.round(listHeaderRect.height),
				rowOffsetFromHeader: Math.round(firstRowRect.top - listHeaderRect.bottom),
				viewportHeight: window.innerHeight,
			}
		}, objectsMetricSelectors)

		if (!metrics) {
			throw new Error('Missing mobile selection metrics')
		}

		expect(metrics.selectionBarHeight, JSON.stringify(metrics)).toBeLessThan(60)
		expect(metrics.listHeaderHeight, JSON.stringify(metrics)).toBeLessThan(40)
		expect(metrics.rowOffsetFromHeader, JSON.stringify(metrics)).toBeLessThan(8)
	})

	test('folders drawer can be opened and dismissed on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByTestId('objects-folders-pane')).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const drawer = document.querySelector(selectors.treeSheet)
			const content = document.querySelector(selectors.treeContent)
			const foldersPane = document.querySelector(selectors.foldersPane)
			if (!(drawer instanceof HTMLElement) || !(content instanceof HTMLElement) || !(foldersPane instanceof HTMLElement)) {
				return null
			}
			const drawerRect = drawer.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const contentRect = content.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const foldersRect = foldersPane.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const contentButtons = content.querySelectorAll('button')
			const buttonHeights = Array.from(contentButtons).map((button) => Math.round(button.getBoundingClientRect().height)) // e2e-geometry-allow: explicit responsive density contract
			return {
				contentOffsetTop: Math.round(contentRect.top - drawerRect.top),
				foldersOffsetTop: Math.round(foldersRect.top - drawerRect.top),
				maxButtonHeight: Math.max(...buttonHeights),
			}
		}, objectsMetricSelectors)

		if (!metrics) {
			throw new Error('Missing mobile folders drawer metrics')
		}

		expect(metrics.contentOffsetTop, JSON.stringify(metrics)).toBeLessThan(84)
		expect(metrics.foldersOffsetTop, JSON.stringify(metrics)).toBeLessThan(180)
		expect(metrics.maxButtonHeight, JSON.stringify(metrics)).toBeLessThan(34)

		await drawer.getByLabel('Close', { exact: true }).click()
		await expect(drawer).toHaveCount(0)
	})

	test('keeps compact overlay sheet header and body gutters aligned across drawers at mid-width mobile sizes', async ({ page }) => {
		await page.setViewportSize({ width: 640, height: 844 })
		await openObjectsMobilePage(page)

		const measureInsets = async (sheetTestId: string) => {
			const drawer = page.getByTestId(sheetTestId)
			await expect(drawer).toBeVisible()
			const metrics = await page.evaluate((resolvedSheetTestId) => {
				const drawer = document.querySelector(`[data-testid="${resolvedSheetTestId}"]`)
				const header = document.querySelector(`[data-testid="${resolvedSheetTestId}-header"]`)
				const body = document.querySelector(`[data-testid="${resolvedSheetTestId}-body"]`)
				if (!(drawer instanceof HTMLElement) || !(header instanceof HTMLElement) || !(body instanceof HTMLElement)) return null

				const drawerRect = drawer.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
				const headerRect = header.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
				const bodyRect = body.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
				return {
					headerLeftInset: Math.round(headerRect.left - drawerRect.left),
					bodyLeftInset: Math.round(bodyRect.left - drawerRect.left),
					headerRightInset: Math.round(drawerRect.right - headerRect.right),
					bodyRightInset: Math.round(drawerRect.right - bodyRect.right),
				}
			}, sheetTestId)

			if (!metrics) {
				throw new Error(`Missing overlay metrics for ${sheetTestId}`)
			}

			await drawer.getByLabel('Close', { exact: true }).click()
			await expect(drawer).toHaveCount(0)
			return metrics
		}

		await page.getByRole('button', { name: 'Folders' }).click()
		const treeInsets = await measureInsets('objects-tree-sheet')

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()
		const searchInsets = await measureInsets('objects-global-search-sheet')

		await page.getByRole('button', { name: /Filters|View|Filter/ }).click()
		const filterInsets = await measureInsets('objects-filters-sheet')

		const leftInsets = [treeInsets, searchInsets, filterInsets].flatMap((metrics) => [metrics.headerLeftInset, metrics.bodyLeftInset])
		const rightInsets = [treeInsets, searchInsets, filterInsets].flatMap((metrics) => [metrics.headerRightInset, metrics.bodyRightInset])

		expect(Math.max(...leftInsets) - Math.min(...leftInsets), JSON.stringify({ treeInsets, searchInsets, filterInsets })).toBeLessThanOrEqual(1)
		expect(Math.max(...rightInsets) - Math.min(...rightInsets), JSON.stringify({ treeInsets, searchInsets, filterInsets })).toBeLessThanOrEqual(1)
		expect(Math.max(...leftInsets), JSON.stringify({ treeInsets, searchInsets, filterInsets })).toBeLessThanOrEqual(15)
		expect(Math.max(...rightInsets), JSON.stringify({ treeInsets, searchInsets, filterInsets })).toBeLessThanOrEqual(15)
	})

	test('keeps internal pane and card padding dense across folders, global search, and filters at mid-width mobile sizes', async ({ page }) => {
		await page.setViewportSize({ width: 640, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: 'Folders' }).click()
		const treeDrawer = page.getByTestId('objects-tree-sheet')
		await expect(treeDrawer).toBeVisible()

		const treeMetrics = await page.evaluate((selectors) => {
			const header = document.querySelector(selectors.foldersPaneHeader)
			const body = document.querySelector(selectors.foldersPaneBody)
			if (!(header instanceof HTMLElement) || !(body instanceof HTMLElement)) return null
			const headerStyles = window.getComputedStyle(header)
			const bodyStyles = window.getComputedStyle(body)
			return {
				headerInlinePadding: Math.round(parseFloat(headerStyles.paddingLeft)),
				bodyInlinePadding: Math.round(parseFloat(bodyStyles.paddingLeft)),
			}
		}, objectsMetricSelectors)

		if (!treeMetrics) {
			throw new Error('Missing tree pane padding metrics')
		}

		await treeDrawer.getByLabel('Close', { exact: true }).click()
		await expect(treeDrawer).toHaveCount(0)

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()
		const searchDrawer = dialogByName(page, 'Global Search (Indexed)')
		await expect(searchDrawer).toBeVisible()
		await searchDrawer.getByPlaceholder('Search query (substring)').fill('alpha')
		const resultCard = page.locator(OBJECTS_GLOBAL_SEARCH_RESULT_CARD_SELECTOR).first()
		await expect(resultCard).toBeVisible()

		const searchMetrics = await page.evaluate((selectors) => {
			const content = document.querySelector(selectors.globalSearchContent)
			const indexToggle = document.querySelector(selectors.globalSearchIndexToggle)
			const resultCard = document.querySelector(selectors.globalSearchResultCard)
			if (!(content instanceof HTMLElement) || !(indexToggle instanceof HTMLElement) || !(resultCard instanceof HTMLElement)) return null
			const contentStyles = window.getComputedStyle(content)
			const indexToggleStyles = window.getComputedStyle(indexToggle)
			const resultCardStyles = window.getComputedStyle(resultCard)
			return {
				contentGap: Math.round(parseFloat(contentStyles.rowGap || contentStyles.gap || '0')),
				indexInlinePadding: Math.round(parseFloat(indexToggleStyles.paddingLeft)),
				resultInlinePadding: Math.round(parseFloat(resultCardStyles.paddingLeft)),
			}
		}, objectsMetricSelectors)

		if (!searchMetrics) {
			throw new Error('Missing global search padding metrics')
		}

		await searchDrawer.getByLabel('Close', { exact: true }).click()
		await expect(searchDrawer).toHaveCount(0)

		await page.getByRole('button', { name: /Filters|View|Filter/ }).click()
		const filtersDrawer = dialogByName(page, 'View options')
		await expect(filtersDrawer).toBeVisible()

		const filterMetrics = await page.evaluate((selectors) => {
			const content = document.querySelector(selectors.filtersContent)
			if (!(content instanceof HTMLElement)) return null
			const contentStyles = window.getComputedStyle(content)
			return {
				contentGap: Math.round(parseFloat(contentStyles.rowGap || contentStyles.gap || '0')),
			}
		}, objectsMetricSelectors)

		if (!filterMetrics) {
			throw new Error('Missing filters padding metrics')
		}

		expect(treeMetrics.headerInlinePadding, JSON.stringify({ treeMetrics, searchMetrics, filterMetrics })).toBeLessThanOrEqual(10)
		expect(treeMetrics.bodyInlinePadding, JSON.stringify({ treeMetrics, searchMetrics, filterMetrics })).toBeLessThanOrEqual(6)
		expect(searchMetrics.indexInlinePadding, JSON.stringify({ treeMetrics, searchMetrics, filterMetrics })).toBeLessThanOrEqual(10)
		expect(searchMetrics.resultInlinePadding, JSON.stringify({ treeMetrics, searchMetrics, filterMetrics })).toBeLessThanOrEqual(8)
		expect(searchMetrics.contentGap, JSON.stringify({ treeMetrics, searchMetrics, filterMetrics })).toBeLessThanOrEqual(10)
		expect(filterMetrics.contentGap, JSON.stringify({ treeMetrics, searchMetrics, filterMetrics })).toBeLessThanOrEqual(10)
		expect(Math.abs(searchMetrics.contentGap - filterMetrics.contentGap), JSON.stringify({ treeMetrics, searchMetrics, filterMetrics })).toBeLessThanOrEqual(1)
	})

	test('details drawer opens from object actions and closes cleanly on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		const row = objectsListRow(page, 'alpha.txt')
		await expect(row).toBeVisible()
		await row.getByRole('button', { name: 'Object actions' }).click()

		const menu = page
			.getByRole('menu')
			.filter({ has: page.getByRole('menuitem', { name: 'Details' }) })
			.last()
		await expect(menu).toBeVisible()
		await menu.getByRole('menuitem', { name: 'Details' }).click()

		const drawer = page.getByTestId('objects-details-sheet')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByText('Content Type')).toBeVisible()
		await expect(drawer.getByText('alpha.txt')).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const actionRow = document.querySelector(selectors.detailsActionRow)
			const previewActions = document.querySelector(selectors.detailsPreviewActions)
			if (!(actionRow instanceof HTMLElement) || !(previewActions instanceof HTMLElement)) return null
			const rowRect = actionRow.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const previewRect = previewActions.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const actionButtons = actionRow.querySelectorAll('button')
			const previewButtons = previewActions.querySelectorAll('button')
			const buttonHeights = [...Array.from(actionButtons), ...Array.from(previewButtons)].map((button) =>
				Math.round(button.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
			)
			return {
				actionRowHeight: Math.round(rowRect.height),
				previewActionsTop: Math.round(previewRect.top),
				maxButtonHeight: Math.max(...buttonHeights),
			}
		}, objectsMetricSelectors)

		if (!metrics) {
			throw new Error('Missing mobile details drawer metrics')
		}

		expect(metrics.actionRowHeight, JSON.stringify(metrics)).toBeLessThan(72)
		expect(metrics.previewActionsTop, JSON.stringify(metrics)).toBeLessThan(620)
		expect(metrics.maxButtonHeight, JSON.stringify(metrics)).toBeLessThan(34)

		await drawer.getByRole('button', { name: 'Close' }).click()
		await expect(drawer).toHaveCount(0)
	})

	test('large preview viewer keeps stage, meta, and actions compact on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		const row = objectsListRow(page, 'preview.png')
		await expect(row).toBeVisible()
		await row.getByRole('button', { name: 'Object actions' }).click()

		const menu = page
			.getByRole('menu')
			.filter({ has: page.getByRole('menuitem', { name: 'Open large preview' }) })
			.last()
		await expect(menu).toBeVisible()
		await menu.getByRole('menuitem', { name: 'Open large preview' }).click()

		const modal = page.getByTestId('objects-image-viewer-modal')
		await expect(modal).toBeVisible()
		await expect(modal.getByTestId('objects-image-viewer-image')).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const meta = document.querySelector(selectors.imageViewerMeta)
			const stage = document.querySelector(selectors.imageViewerStage)
			const footer = document.querySelector(selectors.imageViewerFooter)
			if (!(meta instanceof HTMLElement) || !(stage instanceof HTMLElement) || !(footer instanceof HTMLElement)) return null
			const footerButtons = footer.querySelectorAll('button')
			const buttonHeights = Array.from(footerButtons).map((button) => Math.round(button.getBoundingClientRect().height)) // e2e-geometry-allow: explicit responsive density contract
			return {
				metaHeight: Math.round(meta.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				stageTop: Math.round(stage.getBoundingClientRect().top), // e2e-geometry-allow: explicit responsive density contract
				footerHeight: Math.round(footer.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				maxButtonHeight: Math.max(...buttonHeights),
			}
		}, objectsMetricSelectors)

		if (!metrics) {
			throw new Error('Missing mobile image viewer metrics')
		}

		expect(metrics.metaHeight, JSON.stringify(metrics)).toBeLessThan(68)
		expect(metrics.stageTop, JSON.stringify(metrics)).toBeLessThan(260)
		expect(metrics.footerHeight, JSON.stringify(metrics)).toBeLessThan(76)
		expect(metrics.maxButtonHeight, JSON.stringify(metrics)).toBeLessThan(34)
	})

	test('global search preserves query filters across mobile reopen', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()

		const drawer = dialogByName(page, 'Global Search (Indexed)')
		await expect(drawer).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const drawer = document.querySelector(selectors.globalSearchSheet)
			const content = document.querySelector(selectors.globalSearchContent)
			const actions = document.querySelector(selectors.globalSearchActions)
			if (!(drawer instanceof HTMLElement) || !(content instanceof HTMLElement) || !(actions instanceof HTMLElement)) return null
			const drawerRect = drawer.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const contentRect = content.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const buttonHeights = Array.from(actions.querySelectorAll('button')).map((button) =>
				Math.round(button.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
			)
			return {
				contentOffsetTop: Math.round(contentRect.top - drawerRect.top),
				maxButtonHeight: Math.max(...buttonHeights),
			}
		}, objectsMetricSelectors)

		if (!metrics) {
			throw new Error('Missing mobile global search metrics')
		}

		expect(metrics.contentOffsetTop, JSON.stringify(metrics)).toBeLessThan(84)
		expect(metrics.maxButtonHeight, JSON.stringify(metrics)).toBeLessThan(34)

		await drawer.getByPlaceholder('Search query (substring)').fill('wrap')
		await drawer.getByLabel('Extension filter').fill('log')
		await drawer.getByLabel('Close', { exact: true }).click()
		await expect(drawer).toHaveCount(0)

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()
		const reopenedDrawer = dialogByName(page, 'Global Search (Indexed)')
		await expect(reopenedDrawer).toBeVisible()
		await expect(reopenedDrawer.getByPlaceholder('Search query (substring)')).toHaveValue('wrap')
		await expect(reopenedDrawer.getByLabel('Extension filter')).toHaveValue('log')
	})

	test('global search renders compact result cards on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()

		const drawer = dialogByName(page, 'Global Search (Indexed)')
		await expect(drawer).toBeVisible()
		await drawer.getByPlaceholder('Search query (substring)').fill('alpha')

		const card = page.locator(OBJECTS_GLOBAL_SEARCH_RESULT_CARD_SELECTOR).first()
		await expect(card).toBeVisible({ timeout: 10_000 })

		const metrics = await card.evaluate((element) => {
			const rect = element.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const buttons = element.querySelectorAll('button')
			const buttonHeights = Array.from(buttons).map((button) => Math.round(button.getBoundingClientRect().height)) // e2e-geometry-allow: explicit responsive density contract
			return {
				cardHeight: Math.round(rect.height),
				scrollWidth: Math.round(element.scrollWidth), // e2e-geometry-allow: explicit responsive density contract
				clientWidth: Math.round(element.clientWidth), // e2e-geometry-allow: explicit responsive density contract
				maxButtonHeight: Math.max(...buttonHeights),
			}
		})

		expect(metrics.cardHeight, JSON.stringify(metrics)).toBeLessThan(116)
		expect(metrics.maxButtonHeight, JSON.stringify(metrics)).toBeLessThan(34)
		expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.clientWidth + 1) // e2e-geometry-allow: explicit responsive density contract
	})

	test('filters drawer keeps compact padding and actions on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: /Filters|View|Filter/ }).click()

		const drawer = dialogByName(page, 'View options')
		await expect(drawer).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const drawer = document.querySelector(selectors.filtersSheet)
			const content = document.querySelector(selectors.filtersContent)
			const actions = document.querySelector(selectors.filtersActions)
			if (!(drawer instanceof HTMLElement) || !(content instanceof HTMLElement) || !(actions instanceof HTMLElement)) return null
			const drawerRect = drawer.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const contentRect = content.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const actionsButtons = Array.from(actions.querySelectorAll('button'))
			const buttonHeights = actionsButtons.map((button) => Math.round(button.getBoundingClientRect().height)) // e2e-geometry-allow: explicit responsive density contract
			return {
				contentOffsetTop: Math.round(contentRect.top - drawerRect.top),
				maxButtonHeight: Math.max(...buttonHeights),
			}
		}, objectsMetricSelectors)

		if (!metrics) {
			throw new Error('Missing mobile filters drawer metrics')
		}

		expect(metrics.contentOffsetTop, JSON.stringify(metrics)).toBeLessThan(84)
		expect(metrics.maxButtonHeight, JSON.stringify(metrics)).toBeLessThan(34)
	})
})
