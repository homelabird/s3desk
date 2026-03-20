import { expect, test } from '@playwright/test'

import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import { expectLocatorWithinViewport, expectNoPageHorizontalOverflow } from './support/mobileResponsive'

test.describe('@mobile-responsive Jobs mobile responsive draft', () => {
	test.beforeEach(async ({ page }) => {
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
	})

	test('avoids page-level horizontal overflow on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/jobs')

		await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
		await expect(page.getByTestId('jobs-mobile-filters-trigger')).toBeVisible()
		await expectNoPageHorizontalOverflow(page)
	})

	test('opens mobile filters sheet within the viewport', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/jobs')

		await page.getByTestId('jobs-mobile-filters-trigger').click()
		const sheet = page.getByTestId('jobs-mobile-filters-sheet')
		await expect(sheet).toBeVisible()
		await expect(sheet.getByRole('combobox', { name: 'Job status filter' })).toBeVisible()
		await expect(sheet.getByRole('combobox', { name: 'Job type filter' })).toBeVisible()
		await expectLocatorWithinViewport(sheet)
	})

	test('stacks health cards vertically on narrow widths', async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 800 })
		await page.goto('/jobs')

		const activeCard = page.getByTestId('jobs-health-active')
		const queuedCard = page.getByTestId('jobs-health-queued')
		await expect(activeCard).toBeVisible()
		await expect(queuedCard).toBeVisible()

		const activeBox = await activeCard.boundingBox()
		const queuedBox = await queuedCard.boundingBox()
		expect(queuedBox?.y ?? 0).toBeGreaterThan((activeBox?.y ?? 0) + (activeBox?.height ?? 0) - 1)
		await expectNoPageHorizontalOverflow(page)
	})

	test('opens the upload creation sheet within the mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/jobs')

		await page.locator('button').filter({ hasText: 'Upload…' }).first().click()
		const sheet = page.getByRole('dialog', { name: 'Upload from device' })
		await expect(sheet).toBeVisible()
		await expectLocatorWithinViewport(sheet)
	})
})
