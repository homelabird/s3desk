import { expect, test, type Page } from '@playwright/test'

import { seedLocalStorage } from './support/apiFixtures'
import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import {
	installObjectsMobileResponsiveFixtures,
	seedObjectsMobileResponsiveStorage,
} from './support/objectsMobileResponsive'
import { installUploadsMobileResponsiveFixtures, seedUploadsMobileResponsiveStorage } from './support/uploadsMobileResponsive'
import { dialogByName, gotoJobsPage, gotoUploadsPage, gotoWithDynamicImportRecovery, objectsListRow } from './support/ui'

const visualScreenshotOptions = {
	animations: 'disabled',
	caret: 'hide',
	maxDiffPixelRatio: 0.01,
} as const

async function setupObjectsAuditPage(
	page: Page,
	themeMode: 'light' | 'dark',
	viewport = { width: 1440, height: 900 },
) {
	await page.setViewportSize(viewport)
	await installObjectsMobileResponsiveFixtures(page)
	await seedObjectsMobileResponsiveStorage(page)
	await seedLocalStorage(page, { themeMode })
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'), {
		timeout: 10_000,
		maxAttempts: 3,
	})
	await expect(page.locator('html')).toHaveAttribute('data-theme', themeMode)
	await expect(objectsListRow(page, 'preview.png')).toBeVisible()
}

test.describe('Design audit visual smoke @visual', () => {
	test('Objects shell hierarchy remains visible in light mode', async ({ page }) => {
		await setupObjectsAuditPage(page, 'light')

		await expect(page).toHaveScreenshot('design-audit-objects-shell-light.png', visualScreenshotOptions)
	})

	test('Objects shell hierarchy remains visible in dark mode', async ({ page }) => {
		await setupObjectsAuditPage(page, 'dark')

		await expect(page).toHaveScreenshot('design-audit-objects-shell-dark.png', visualScreenshotOptions)
	})

	test('Objects shell hierarchy remains visible at tablet width', async ({ page }) => {
		await setupObjectsAuditPage(page, 'light', { width: 768, height: 1024 })

		await expect(page).toHaveScreenshot('design-audit-objects-shell-tablet.png', visualScreenshotOptions)
	})

	test('Objects bucket picker floating surface remains distinct', async ({ page }) => {
		await setupObjectsAuditPage(page, 'light')

		await page.getByRole('button', { name: /Current bucket|Select bucket|objects-mobile-bucket/i }).click()
		await expect(page.getByRole('dialog', { name: 'Select bucket' })).toBeVisible()

		await expect(page).toHaveScreenshot('design-audit-objects-bucket-picker.png', visualScreenshotOptions)
	})

	test('Jobs operational surfaces remain scannable on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
		await gotoJobsPage(page)
		await expect(page.getByText('job-queued')).toBeVisible()

		await page.getByRole('button', { name: 'Transfers' }).click()
		const drawer = dialogByName(page, 'Transfers')
		await expect(drawer).toBeVisible()

		await expect(drawer).toHaveScreenshot('design-audit-transfers-mobile.png', visualScreenshotOptions)
	})

	test('Uploads workflow cards remain distinct on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await installUploadsMobileResponsiveFixtures(page)
		await seedUploadsMobileResponsiveStorage(page)
		await gotoUploadsPage(page)
		await expect(page.getByLabel('Upload prefix (optional)')).toBeVisible()

		await expect(page).toHaveScreenshot('design-audit-uploads-mobile.png', visualScreenshotOptions)
	})
})
