import { expect, test, type Page } from '@playwright/test'

import { seedLocalStorage } from './support/apiFixtures'
import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import {
	installObjectsMobileResponsiveFixtures,
	seedObjectsMobileResponsiveStorage,
} from './support/objectsMobileResponsive'
import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import { installUploadsMobileResponsiveFixtures, seedUploadsMobileResponsiveStorage } from './support/uploadsMobileResponsive'
import {
	dialogByName,
	gotoBucketsPage,
	gotoJobsPage,
	gotoProfilesPage,
	gotoUploadsPage,
	gotoWithDynamicImportRecovery,
	objectsListRow,
} from './support/ui'

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
	await expect(page.getByRole('button', { name: /objects-mobile-bucket/i })).toBeVisible()
}

test.describe('Design audit visual smoke @visual', () => {
	test('Objects shell hierarchy remains visible in light mode', async ({ page }) => {
		await setupObjectsAuditPage(page, 'light')
		const listControls = await page.getByTestId('objects-list-controls-root').boundingBox() // e2e-geometry-allow keeps primary content above the desktop fold
		expect(listControls?.y).toBeLessThanOrEqual(320)
		const searchBox = await page.getByLabel('Search current folder').locator('..').boundingBox() // e2e-geometry-allow checks the visible input wrapper alignment
		const filtersBox = await page.getByRole('button', { name: 'Filters' }).boundingBox() // e2e-geometry-allow checks desktop control alignment
		expect(Math.abs((searchBox?.y ?? 0) - (filtersBox?.y ?? 0))).toBeLessThanOrEqual(2)

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

	test('Objects shell remains usable at the narrow mobile floor', async ({ page }) => {
		await setupObjectsAuditPage(page, 'light', { width: 320, height: 568 })
		await expect(page.getByLabel('Search current folder')).toBeVisible()
		await expect(objectsListRow(page, 'alpha.txt')).toBeVisible()
		const viewport = await page.evaluate(() => ({
			clientWidth: document.documentElement.clientWidth, // e2e-geometry-allow compares the narrow layout viewport
			scrollWidth: document.documentElement.scrollWidth, // e2e-geometry-allow detects page-level horizontal overflow
		}))
		expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth) // e2e-geometry-allow asserts page-level horizontal overflow

		await expect(page).toHaveScreenshot('design-audit-objects-shell-narrow-mobile.png', visualScreenshotOptions)
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
		const prefixInput = page.getByLabel('Upload prefix (optional)')
		await expect(prefixInput).toBeVisible()
		const prefixBox = await prefixInput.boundingBox() // e2e-geometry-allow proves the upload target remains in the first mobile viewport
		expect((prefixBox?.y ?? 844) + (prefixBox?.height ?? 0)).toBeLessThanOrEqual(844)

		await expect(page).toHaveScreenshot('design-audit-uploads-mobile.png', visualScreenshotOptions)
	})

	test('Profiles switches cleanly between desktop table and mobile cards', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 })
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await gotoProfilesPage(page)
		await expect(page.getByTestId('profiles-table-desktop')).toBeVisible()
		await expect(page).toHaveScreenshot('design-audit-profiles-desktop.png', visualScreenshotOptions)

		await page.setViewportSize({ width: 390, height: 844 })
		await expect(page.getByTestId('profiles-list-compact')).toBeVisible()
		await expect(page).toHaveScreenshot('design-audit-profiles-mobile.png', visualScreenshotOptions)
	})

	test('Profiles mobile cards preserve hierarchy in dark mode', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await seedLocalStorage(page, { themeMode: 'dark' })
		await gotoProfilesPage(page)
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
		await expect(page.getByTestId('profiles-list-compact')).toBeVisible()

		await expect(page).toHaveScreenshot('design-audit-profiles-mobile-dark.png', visualScreenshotOptions)
	})

	test('Buckets switches cleanly between desktop table and mobile cards', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 })
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await gotoBucketsPage(page)
		await expect(page.getByTestId('buckets-table-desktop')).toBeVisible()
		await expect(page).toHaveScreenshot('design-audit-buckets-desktop.png', visualScreenshotOptions)

		await page.setViewportSize({ width: 390, height: 844 })
		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()
		await expect(page).toHaveScreenshot('design-audit-buckets-mobile.png', visualScreenshotOptions)
	})
})
