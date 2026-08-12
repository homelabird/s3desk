import { expect, test, type Locator, type Page } from '@playwright/test'

import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import { installObjectsMobileResponsiveFixtures, seedObjectsMobileResponsiveStorage } from './support/objectsMobileResponsive'
import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import {
	installLoginMobileResponsiveFixtures,
	installSettingsMobileResponsiveFixtures,
	seedLoginMobileResponsiveStorage,
	seedSettingsMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'
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

const reflowViewport = { width: 320, height: 800 }

async function expectPageReflow(page: Page) {
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
		.toBe(true) // e2e-geometry-allow verifies WCAG 1.4.10 page reflow at 320 CSS px
}

async function expectContainedReflow(locator: Locator) {
	await expect
		.poll(() => locator.evaluate((element) => {
			const rect = element.getBoundingClientRect() // e2e-geometry-allow bounds overlay reflow to the viewport
			return (
				element.scrollWidth <= element.clientWidth + 1
				&& rect.left >= -1
				&& rect.right <= window.innerWidth + 1
			)
		}))
		.toBe(true) // e2e-geometry-allow verifies overlay content does not require page-level horizontal scrolling
}

test.describe('WCAG 1.4.10 reflow at 320 CSS px', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(reflowViewport)
	})

	test('Login reflows without losing authentication controls', async ({ page }) => {
		await seedLoginMobileResponsiveStorage(page, '')
		await installLoginMobileResponsiveFixtures(page, ['valid-token'])
		await gotoProfilesPage(page, { ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }) })

		await expect(page.getByPlaceholder('API_TOKEN')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
		await expectPageReflow(page)
	})

	test('Profiles reflows to compact cards', async ({ page }) => {
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await gotoProfilesPage(page)

		await expect(page.getByTestId('profiles-list-compact')).toBeVisible()
		await expectPageReflow(page)
	})

	test('Buckets reflows to compact cards', async ({ page }) => {
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await gotoBucketsPage(page)

		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()
		await expectPageReflow(page)
	})

	test('Objects and its view-options sheet reflow', async ({ page }) => {
		await installObjectsMobileResponsiveFixtures(page)
		await seedObjectsMobileResponsiveStorage(page)
		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'))

		await expect(objectsListRow(page, 'alpha.txt')).toBeVisible()
		await expectPageReflow(page)

		await page.getByRole('button', { name: /Filters|View|Filter/ }).click()
		const sheet = dialogByName(page, 'View options')
		await expect(sheet).toBeVisible()
		await expectContainedReflow(sheet)
	})

	test('Uploads reflows without losing its primary action', async ({ page }) => {
		await installUploadsMobileResponsiveFixtures(page)
		await seedUploadsMobileResponsiveStorage(page)
		await gotoUploadsPage(page)

		await expect(page.getByRole('button', { name: /Add from device/i })).toBeVisible()
		await expect(page.getByLabel('Upload prefix (optional)')).toBeVisible()
		await expectPageReflow(page)
	})

	test('Jobs reflows without losing filters and queue content', async ({ page }) => {
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
		await gotoJobsPage(page)

		await expect(page.getByText('job-queued')).toBeVisible()
		await expect(page.getByTestId('jobs-mobile-filters-trigger')).toBeVisible()
		await expectPageReflow(page)
	})

	test('Settings drawer reflows and keeps all sections reachable', async ({ page }) => {
		await installSettingsMobileResponsiveFixtures(page)
		await seedSettingsMobileResponsiveStorage(page)
		await page.goto('/settings')

		const drawer = dialogByName(page, 'Settings')
		await expect(drawer).toBeVisible()
		const supportTab = drawer.getByRole('tab', { name: 'Support' })
		await expect(supportTab).toBeVisible()
		await supportTab.click()
		await expect(drawer.getByText('Browser recovery')).toBeVisible()
		await drawer.getByRole('button', { name: 'Server and backup' }).click()
		await expect(drawer.getByText('Runtime diagnostics')).toBeVisible()
		await expectPageReflow(page)
		await expectContainedReflow(drawer)
	})
})
