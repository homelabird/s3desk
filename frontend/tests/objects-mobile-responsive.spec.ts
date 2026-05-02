import { expect, test, type Page } from '@playwright/test'

import {
	installObjectsMobileResponsiveFixtures,
	seedObjectsMobileResponsiveStorage,
} from './support/objectsMobileResponsive'
import {
	OBJECTS_GLOBAL_SEARCH_RESULT_CARD_SELECTOR,
	dialogByName,
	gotoWithDynamicImportRecovery,
	objectsListRow,
	objectsSelectionCheckbox,
	objectsTreeRow,
} from './support/ui'

async function openObjectsMobilePage(page: Page) {
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'), {
		timeout: 10_000,
		maxAttempts: 3,
	})
}

test.describe('@mobile-responsive Objects mobile workflows', () => {
	test.beforeEach(async ({ page }) => {
		await installObjectsMobileResponsiveFixtures(page)
		await seedObjectsMobileResponsiveStorage(page)
	})

	test('renders the mobile header, location controls, and initial objects', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await expect(page.getByTestId('objects-page-header')).toBeVisible()
		await expect(page.getByTestId('objects-list-controls-root')).toBeVisible()
		await expect(page.getByText('s3://objects-mobile-bucket/')).toBeVisible()
		await expect(page.getByLabel('Search current folder')).toBeVisible()
		await expect(objectsListRow(page, 'alpha.txt')).toBeVisible()
		await expect(objectsListRow(page, 'preview.png')).toBeVisible()
	})

	test('exposes primary toolbar actions at mid-width mobile breakpoints', async ({ page }) => {
		await page.setViewportSize({ width: 640, height: 844 })
		await openObjectsMobilePage(page)

		await expect(page.getByTestId('objects-toolbar-mobile-top-row')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Go back' })).toBeDisabled()
		await expect(page.getByRole('button', { name: 'Go forward' })).toBeDisabled()
		await expect(page.getByRole('button', { name: 'Upload' })).toBeEnabled()
		await expect(page.getByRole('button', { name: 'New folder' })).toBeEnabled()
		await expect(page.getByRole('button', { name: 'Folders' })).toBeEnabled()
		await expect(page.getByRole('button', { name: 'Details' })).toBeEnabled()
	})

	test('opens and dismisses object action menus on mobile rows', async ({ page }) => {
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
		await expect(menu.getByRole('menuitem', { name: /Download \(client\)/ })).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(menu).toHaveCount(0)
		await expect(row).toBeVisible()
	})

	test('opens image preview directly from a mobile grid card', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: /Grid/i }).click()
		await expect(page.getByTestId('objects-grid-content')).toBeVisible()

		const card = objectsListRow(page, 'preview.png')
		await expect(card).toBeVisible()
		const previewButton = card.getByRole('button', { name: 'Open large preview for preview.png' })
		await expect(previewButton).toBeVisible()
		await previewButton.click()

		const modal = page.getByTestId('objects-image-viewer-modal')
		await expect(modal).toBeVisible()
		await expect(modal.getByTestId('objects-image-viewer-image')).toBeVisible()
		await modal.getByRole('button', { name: 'Close' }).click()
		await expect(modal).toHaveCount(0)
	})

	test('shows selection actions and clears selected objects on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await objectsSelectionCheckbox(page, 'alpha.txt').click()
		const selectionBar = page.getByTestId('objects-selection-bar')
		await expect(selectionBar).toBeVisible()
		await expect(page.getByTestId('objects-list-header-row')).toBeVisible()
		await expect(page.getByText('1 selected')).toBeVisible()
		await expect(selectionBar.getByRole('button', { name: 'Download' })).toBeVisible()
		await expect(selectionBar.getByRole('button', { name: 'Delete' })).toBeVisible()
		await selectionBar.getByRole('button', { name: 'Clear' }).click()
		await expect(selectionBar).toHaveCount(0)
		await expect(objectsSelectionCheckbox(page, 'alpha.txt')).not.toBeChecked()
	})

	test('folders drawer opens, navigates to a prefix, and closes on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByTestId('objects-folders-pane')).toBeVisible()
		const rootRow = objectsTreeRow(drawer, 0).filter({ hasText: 'objects-mobile-bucket' }).first()
		await expect(rootRow).toBeVisible()
		await rootRow.getByRole('button', { name: 'Expand objects-mobile-bucket' }).click()

		const reportsRow = objectsTreeRow(drawer, 1).filter({ hasText: 'reports' }).first()
		await expect(reportsRow).toBeVisible()
		await reportsRow.getByRole('button', { name: 'reports', exact: true }).click()

		await expect(drawer).toHaveCount(0)
		await expect(page.getByText('s3://objects-mobile-bucket/reports/')).toBeVisible()
	})

	test('opens and closes core overlay drawers at mid-width mobile sizes', async ({ page }) => {
		await page.setViewportSize({ width: 640, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: 'Folders' }).click()
		const treeDrawer = page.getByTestId('objects-tree-sheet')
		await expect(treeDrawer).toBeVisible()
		await expect(treeDrawer.getByTestId('objects-folders-pane')).toBeVisible()
		await treeDrawer.getByLabel('Close', { exact: true }).click()
		await expect(treeDrawer).toHaveCount(0)

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()
		const searchDrawer = dialogByName(page, 'Global Search (Indexed)')
		await expect(searchDrawer).toBeVisible()
		await expect(searchDrawer.getByLabel('Search query')).toBeVisible()
		await searchDrawer.getByLabel('Close', { exact: true }).click()
		await expect(searchDrawer).toHaveCount(0)

		await page.getByRole('button', { name: /Filters|View|Filter/ }).click()
		const filterDrawer = dialogByName(page, 'View options')
		await expect(filterDrawer).toBeVisible()
		await expect(filterDrawer.getByLabel('Type filter')).toBeVisible()
		await filterDrawer.getByRole('button', { name: 'Done' }).click()
		await expect(filterDrawer).toHaveCount(0)
	})

	test('uses folders, global search, and filters as task flows at mid-width mobile sizes', async ({ page }) => {
		await page.setViewportSize({ width: 640, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: 'Folders' }).click()
		const treeDrawer = page.getByTestId('objects-tree-sheet')
		await expect(treeDrawer).toBeVisible()
		await expect(treeDrawer.getByRole('button', { name: 'Favorites' })).toBeVisible()
		await treeDrawer.getByLabel('Close', { exact: true }).click()
		await expect(treeDrawer).toHaveCount(0)

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()
		const searchDrawer = dialogByName(page, 'Global Search (Indexed)')
		await expect(searchDrawer).toBeVisible()
		await searchDrawer.getByPlaceholder('Search query (substring)').fill('alpha')
		const resultCard = page.locator(OBJECTS_GLOBAL_SEARCH_RESULT_CARD_SELECTOR).first()
		await expect(resultCard).toBeVisible()
		await searchDrawer.getByLabel('Close', { exact: true }).click()
		await expect(searchDrawer).toHaveCount(0)

		await page.getByRole('button', { name: /Filters|View|Filter/ }).click()
		const filtersDrawer = dialogByName(page, 'View options')
		await expect(filtersDrawer).toBeVisible()
		await filtersDrawer.getByLabel('Extension filter').fill('log')
		await filtersDrawer.getByRole('button', { name: 'Done' }).click()
		await expect(filtersDrawer).toHaveCount(0)
		await expect(objectsListRow(page, /a-very-long-object-key/)).toBeVisible()
		await expect(objectsListRow(page, 'alpha.txt')).toHaveCount(0)
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
		await expect(drawer.getByRole('button', { name: /Download/i })).toBeVisible()
		await expect(drawer.getByRole('button', { name: 'Copy key' })).toBeVisible()

		await drawer.getByRole('button', { name: 'Close' }).click()
		await expect(drawer).toHaveCount(0)
	})

	test('large preview viewer opens with image metadata and actions on mobile', async ({ page }) => {
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
		await expect(modal.getByTestId('objects-image-viewer-meta')).toContainText('image/png')
		await expect(modal.getByRole('button', { name: 'Download' })).toBeVisible()
		await expect(modal.getByRole('button', { name: 'Reload preview' })).toBeVisible()
		await modal.getByRole('button', { name: 'Close' }).click()
		await expect(modal).toHaveCount(0)
	})

	test('global search preserves query filters across mobile reopen', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()

		const drawer = dialogByName(page, 'Global Search (Indexed)')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByPlaceholder('Search query (substring)')).toBeVisible()
		await expect(drawer.getByRole('button', { name: /Refresh/ })).toBeVisible()
		await expect(drawer.getByRole('button', { name: 'Reset' })).toBeVisible()

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

	test('global search result cards expose object actions on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()

		const drawer = dialogByName(page, 'Global Search (Indexed)')
		await expect(drawer).toBeVisible()
		await drawer.getByPlaceholder('Search query (substring)').fill('alpha')

		const card = page.locator(OBJECTS_GLOBAL_SEARCH_RESULT_CARD_SELECTOR).first()
		await expect(card).toBeVisible({ timeout: 10_000 })
		await expect(card).toContainText('alpha.txt')
		await expect(card.getByRole('button', { name: 'Copy key alpha.txt' })).toBeVisible()
		await expect(card.getByRole('button', { name: 'Download alpha.txt' })).toBeVisible()
		await expect(card.getByRole('button', { name: 'Open details for alpha.txt' })).toBeVisible()
	})

	test('filters drawer applies and clears file filters on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await openObjectsMobilePage(page)

		await page.getByRole('button', { name: /Filters|View|Filter/ }).click()

		const drawer = dialogByName(page, 'View options')
		await expect(drawer).toBeVisible()
		await drawer.getByLabel('Extension filter').fill('log')
		await drawer.getByRole('button', { name: 'Done' }).click()
		await expect(drawer).toHaveCount(0)
		await expect(objectsListRow(page, /a-very-long-object-key/)).toBeVisible()
		await expect(objectsListRow(page, 'alpha.txt')).toHaveCount(0)

		await page.getByRole('button', { name: /Filters|View|Filter/ }).click()
		const reopenedDrawer = dialogByName(page, 'View options')
		await expect(reopenedDrawer).toBeVisible()
		await reopenedDrawer.getByRole('button', { name: 'Reset view' }).click()
		await reopenedDrawer.getByRole('button', { name: 'Done' }).click()
		await expect(reopenedDrawer).toHaveCount(0)
		await expect(objectsListRow(page, 'alpha.txt')).toBeVisible()
	})
})
