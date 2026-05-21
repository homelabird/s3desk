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

		await page.getByRole('button', { name: 'Indexed Search' }).click()
		const drawer = dialogByName(page, 'Indexed Search')
		await expect(drawer).toBeVisible()
		await drawer.getByPlaceholder('Search query (substring)').fill('preview')
		await expect(drawer.getByText('preview.png')).toBeVisible()
		await expect(drawer.getByTestId('objects-global-search-actions')).toBeVisible()

		await expect(drawer).toHaveScreenshot('objects-dark-global-search-drawer.png', visualScreenshotOptions)
	})
})
