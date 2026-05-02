import { expect, test } from '@playwright/test'

import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import { readProfileScopedLocalStorage } from './support/storage'
import { closeJobsMobileFilters, gotoJobsPage, openJobsMobileFilters } from './support/ui'

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
	})

	test('mobile filters persist across reopen and can reset', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoJobsPage(page)

		const sheet = await openJobsMobileFilters(page)
		await sheet.getByRole('combobox', { name: 'Job status filter' }).selectOption('failed')
		await closeJobsMobileFilters(sheet)
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

		await page.getByRole('button', { name: 'Upload…' }).click()
		const sheet = page.getByRole('dialog', { name: 'Upload from device' })
		await expect(sheet).toBeVisible()
		await sheet.getByLabel('Close', { exact: true }).click()
		await expect(sheet).toHaveCount(0)
	})
})
