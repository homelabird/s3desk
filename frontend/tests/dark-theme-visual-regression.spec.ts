import { expect, test, type Page } from '@playwright/test'

import { seedLocalStorage } from './support/apiFixtures'
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

async function setupDarkObjectsVisualPage(page: Page) {
	await page.setViewportSize({ width: 1440, height: 900 })
	await installObjectsMobileResponsiveFixtures(page)
	await seedObjectsMobileResponsiveStorage(page)
	await seedLocalStorage(page, { themeMode: 'dark' })
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'), {
		timeout: 10_000,
		maxAttempts: 3,
	})
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
	await expect(objectsListRow(page, 'preview.png')).toBeVisible()
}

test.describe('Dark theme visual regression @visual', () => {
	test('Objects global search drawer remains stable in dark mode', async ({ page }) => {
		await setupDarkObjectsVisualPage(page)

		await page.getByRole('button', { name: 'Search bucket' }).click()
		const drawer = dialogByName(page, 'Search bucket')
		await expect(drawer).toBeVisible()
		await drawer.getByPlaceholder('Search files or folders').fill('preview')
		await expect(drawer.getByText('preview.png')).toBeVisible()
		await expect(drawer.getByTestId('objects-global-search-actions')).toBeVisible()
		await expect(drawer.getByText('reports/mobile/a-very-long-object-key').first()).toBeVisible()

		const longKeyMetrics = await drawer.getByTestId('objects-global-search-table-wrap')
			.locator('tbody tr', { hasText: 'reports/mobile/a-very-long-object-key' })
			.first()
			.evaluate((row) => {
				const cells = row.querySelectorAll('td')
				const keyCell = cells.item(0)
				const nextCell = cells.item(1)
				const keyText = keyCell.querySelector('code')
				const keyCellBox = keyCell.getBoundingClientRect()
				const nextCellBox = nextCell.getBoundingClientRect()
				const keyTextBox = keyText?.getBoundingClientRect()
				return {
					keyCellRight: keyCellBox.right,
					keyTextRight: keyTextBox?.right ?? 0,
					nextCellLeft: nextCellBox.left,
				}
			})
		expect(longKeyMetrics.keyTextRight).toBeLessThanOrEqual(longKeyMetrics.keyCellRight + 1)
		expect(longKeyMetrics.keyCellRight).toBeLessThanOrEqual(longKeyMetrics.nextCellLeft + 1)

		await expect(drawer).toHaveScreenshot('objects-dark-global-search-drawer.png', visualScreenshotOptions)
	})
})
