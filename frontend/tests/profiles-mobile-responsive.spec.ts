import { expect, test } from '@playwright/test'

import { expectNoPageHorizontalOverflow } from './support/mobileResponsive'
import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'

test.describe('@mobile-responsive Profiles mobile responsive draft', () => {
	test.beforeEach(async ({ page }) => {
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
	})

	test('avoids page-level horizontal overflow on narrow mobile widths', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 568 })
		await page.goto('/profiles')

		await expect(page.getByTestId('profiles-list-compact')).toBeVisible()
		await expect(page.getByTestId('profiles-table-desktop')).toHaveCount(0)
		await expectNoPageHorizontalOverflow(page)
	})

	test('keeps compact cards active on mobile widths', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/profiles')

		await expect(page.getByTestId('profiles-list-compact')).toBeVisible()
		await expect(page.getByRole('button', { name: /Selected|Use profile/ }).first()).toBeVisible()
		await expect(page.getByTestId('profiles-table-desktop')).toHaveCount(0)
	})

	test('stacks compact card actions vertically on extra-small widths', async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 800 })
		await page.goto('/profiles')

		const buttons = page.getByTestId('profiles-list-compact').locator('article').first().getByRole('button')
		const primaryBox = await buttons.nth(0).boundingBox()
		const moreBox = await buttons.nth(1).boundingBox()

		expect(primaryBox?.width ?? 0).toBeGreaterThanOrEqual(300)
		expect(moreBox?.y ?? 0).toBeGreaterThan((primaryBox?.y ?? 0) + (primaryBox?.height ?? 0) - 1)
		await expectNoPageHorizontalOverflow(page)
	})
})
