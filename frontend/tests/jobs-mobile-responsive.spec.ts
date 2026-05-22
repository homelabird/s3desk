import { expect, test, type Locator } from '@playwright/test'

import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import { readProfileScopedLocalStorage } from './support/storage'
import {
	closeJobsMobileFilters,
	gotoJobsPage,
	openJobDetailsDrawer,
	openJobLogsDrawer,
	openJobsMobileFilters,
} from './support/ui'

async function expectMinTouchHeight(locator: Locator, minHeight = 44) {
	await expect
		.poll(async () => {
			const box = await locator.boundingBox() // e2e-geometry-allow verifies mobile touch target minimum size
			return box?.height ?? 0
		})
		.toBeGreaterThanOrEqual(minHeight)
}

test.describe('@mobile-responsive Jobs mobile workflows', () => {
	test.beforeEach(async ({ page }) => {
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
	})

	test('queue health reflects the loaded mobile job fixtures', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoJobsPage(page)

		await expect(page.getByTestId('jobs-health-active')).toContainText('2')
		await expect(page.getByTestId('jobs-health-queued')).toContainText('1')
		await expect(page.getByTestId('jobs-health-running')).toContainText('1')
		await expect(page.getByText('job-queued')).toBeVisible()
		await expect(page.getByText('job-running')).toBeVisible()

		await page.getByTestId('jobs-health-active').click()
		await expect(page.getByTestId('jobs-mobile-filters-trigger')).toContainText('Filters active')
		await expect
			.poll(() =>
				readProfileScopedLocalStorage(page, {
					apiToken: 'jobs-mobile-token',
					name: 'statusFilter',
					namespace: 'jobs',
					profileId: 'jobs-mobile-profile',
				}, 'all'),
			)
			.toBe('active')
		const sheet = await openJobsMobileFilters(page)
		await expect(sheet.getByRole('combobox', { name: 'Job status filter' })).toHaveValue('active')
		await closeJobsMobileFilters(sheet)
	})

	test('top operations groups remain usable at 320px', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 740 })
		await gotoJobsPage(page)

		await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible()
		await expect(page.getByRole('heading', { name: 'Queue health' })).toBeVisible()
		await expect(page.getByText('Realtime updates disconnected')).toBeVisible()
		await expectMinTouchHeight(page.getByRole('button', { name: 'Upload from device' }))
		const newJobButton = page.getByRole('button', { name: 'New job' })
		await expectMinTouchHeight(newJobButton)
		await newJobButton.click()
		await expect(page.getByRole('menuitem', { name: 'Download...' })).toBeVisible()
		await page.keyboard.press('Escape')
		await expectMinTouchHeight(page.getByTestId('jobs-mobile-filters-trigger'))
		await expect
			.poll(() =>
				page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), // e2e-geometry-allow verifies Jobs top groups do not horizontally overflow at 320px
			)
			.toBe(true)
	})

	test('mobile filters persist across reopen and can reset', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoJobsPage(page)

		const trigger = page.getByTestId('jobs-mobile-filters-trigger')
		await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
		await expect(trigger).toHaveAttribute('aria-expanded', 'false')
		await expect(trigger).toHaveAttribute('aria-controls', 'jobs-mobile-filters-sheet-panel')
		await expectMinTouchHeight(trigger)
		await expectMinTouchHeight(page.getByRole('button', { name: 'Reset filters' }))
		await expectMinTouchHeight(page.getByTestId('jobs-columns-trigger'))
		await expectMinTouchHeight(page.getByRole('button', { name: 'Refresh' }))

		const sheet = await openJobsMobileFilters(page)
		await expect(trigger).toHaveAttribute('aria-expanded', 'true')
		await expect(sheet).toHaveAttribute('id', 'jobs-mobile-filters-sheet-panel')
		await sheet.getByRole('combobox', { name: 'Job status filter' }).selectOption('failed')
		await closeJobsMobileFilters(sheet)
		await expect(trigger).toHaveAttribute('aria-expanded', 'false')
		await expect(page.getByTestId('jobs-mobile-filters-trigger')).toContainText('Filters active')
		await expect
			.poll(() =>
				readProfileScopedLocalStorage(page, {
					apiToken: 'jobs-mobile-token',
					name: 'statusFilter',
					namespace: 'jobs',
					profileId: 'jobs-mobile-profile',
				}, 'all'),
			)
			.toBe('failed')

		const reopenedSheet = await openJobsMobileFilters(page)
		await expect(reopenedSheet.getByRole('combobox', { name: 'Job status filter' })).toHaveValue('failed')

		await reopenedSheet.getByRole('button', { name: 'Reset filters' }).click()
		await expect(reopenedSheet.getByRole('combobox', { name: 'Job status filter' })).toHaveValue('all')
		await closeJobsMobileFilters(reopenedSheet)
		await expect(page.getByTestId('jobs-mobile-filters-trigger')).toHaveText('Filters')
	})

	test('mobile upload entrypoint opens and closes the upload source sheet', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoJobsPage(page)

		await page.getByRole('button', { name: 'Upload from device' }).click()
		const sheet = page.getByRole('dialog', { name: 'Upload from device' })
		await expect(sheet).toBeVisible()
		await sheet.getByLabel('Close', { exact: true }).click()
		await expect(sheet).toHaveCount(0)
	})

	test('mobile job details and logs drawers stay readable without horizontal overflow', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoJobsPage(page)

		await expect(page.getByRole('list').filter({ hasText: 'job-running' })).toBeVisible()
		const runningCard = page.getByRole('listitem').filter({ hasText: 'job-running' }).first()
		await expect(runningCard).toBeVisible()

		const detailsDrawer = await openJobDetailsDrawer(page, runningCard)
		await expect(detailsDrawer.getByText('job-running')).toBeVisible()
		await expect(detailsDrawer.getByText('Operational routing')).toBeVisible()
		await expect
			.poll(() =>
				detailsDrawer.evaluate((element) => {
					const rect = element.getBoundingClientRect() // e2e-geometry-allow verifies drawer stays within mobile viewport
					return (
						rect.left >= -1 &&
						rect.right <= window.innerWidth + 1 &&
						element.scrollWidth <= element.clientWidth + 1 // e2e-geometry-allow verifies drawer does not horizontally overflow
					)
				}),
			)
			.toBe(true)
		await detailsDrawer.getByLabel('Close', { exact: true }).click()
		await expect(detailsDrawer).toHaveCount(0)

		const logsDrawer = await openJobLogsDrawer(page, runningCard)
		await expect(logsDrawer.getByText('started mobile run').first()).toBeVisible()
		await expect(logsDrawer.getByText(/Errors: 1/)).toBeVisible()
		await expect
			.poll(() =>
				logsDrawer.evaluate((element) => {
					const rect = element.getBoundingClientRect() // e2e-geometry-allow verifies drawer stays within mobile viewport
					return (
						rect.left >= -1 &&
						rect.right <= window.innerWidth + 1 &&
						element.scrollWidth <= element.clientWidth + 1 // e2e-geometry-allow verifies drawer does not horizontally overflow
					)
				}),
			)
			.toBe(true)
		await logsDrawer.getByLabel('Close', { exact: true }).click()
		await expect(logsDrawer).toHaveCount(0)
	})
})
