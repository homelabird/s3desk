import { expect, test, type Page } from '@playwright/test'

import {
	installObjectsMobileResponsiveFixtures,
	seedObjectsMobileResponsiveStorage,
} from './support/objectsMobileResponsive'
import { dialogByName, gotoWithDynamicImportRecovery, objectsListRow } from './support/ui'

const visualScreenshotOptions = {
	animations: 'disabled',
	caret: 'hide',
	maxDiffPixelRatio: 0.01,
} as const

async function setupObjectsVisualPage(page: Page, viewport: { width: number; height: number }) {
	await page.setViewportSize(viewport)
	await installObjectsMobileResponsiveFixtures(page)
	await seedObjectsMobileResponsiveStorage(page)
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'), {
		timeout: 10_000,
		maxAttempts: 3,
	})
	await expect(objectsListRow(page, 'preview.png')).toBeVisible()
}

test.describe('Objects visual regression @visual', () => {
	test('global search drawer action layout remains stable', async ({ page }) => {
		await setupObjectsVisualPage(page, { width: 1440, height: 900 })

		await page.getByRole('button', { name: 'Search bucket' }).click()
		const drawer = dialogByName(page, 'Search bucket')
		await expect(drawer).toBeVisible()
		await drawer.getByPlaceholder('Search files or folders').fill('preview')
		await expect(drawer.getByText('preview.png')).toBeVisible()
		await expect(drawer.getByTestId('objects-global-search-actions')).toBeVisible()

		await expect(drawer).toHaveScreenshot('objects-global-search-drawer-actions.png', visualScreenshotOptions)
	})

	test('mobile object grid density remains stable', async ({ page }) => {
		await setupObjectsVisualPage(page, { width: 390, height: 844 })

		await page.getByRole('button', { name: /Grid/i }).click()
		const grid = page.getByTestId('objects-grid-content')
		await expect(grid).toBeVisible()
		await expect(page.getByAltText('Thumbnail of preview.png')).toBeVisible()
		await expect(objectsListRow(page, 'reports/mobile/a-very-long-object-key-that-should-wrap-on-mobile-without-causing-horizontal-overflow-or-clipped-actions.log')).toBeVisible()

		await expect(grid).toHaveScreenshot('objects-mobile-grid-density.png', visualScreenshotOptions)
	})
})
