import { expect, test } from '@playwright/test'

import { expectNoPageHorizontalOverflow } from './support/mobileResponsive'
import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'

test.describe('@mobile-responsive Buckets mobile responsive draft', () => {
	test.beforeEach(async ({ page }) => {
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
	})

	test('avoids page-level horizontal overflow on narrow mobile widths', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 568 })
		await page.goto('/buckets')

		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()
		await expect(page.getByTestId('buckets-table-desktop')).toHaveCount(0)
		await expectNoPageHorizontalOverflow(page)
	})

	test('keeps compact cards active on mobile widths', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/buckets')

		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Policy' }).first()).toBeVisible()
		await expect(page.getByTestId('buckets-table-desktop')).toHaveCount(0)
	})

	test('stacks compact card actions vertically on extra-small widths', async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 800 })
		await page.goto('/buckets')

		const buttons = page.getByTestId('buckets-list-compact').locator('article').first().getByRole('button')
		const firstBox = await buttons.nth(0).boundingBox()
		const secondBox = await buttons.nth(1).boundingBox()
		const thirdBox = await buttons.nth(2).boundingBox()

		expect(firstBox?.width ?? 0).toBeGreaterThanOrEqual(300)
		expect(secondBox?.y ?? 0).toBeGreaterThan((firstBox?.y ?? 0) + (firstBox?.height ?? 0) - 1)
		expect(thirdBox?.y ?? 0).toBeGreaterThan((secondBox?.y ?? 0) + (secondBox?.height ?? 0) - 1)
		await expectNoPageHorizontalOverflow(page)
	})
})
