import { expect, test } from '@playwright/test'

import { expectLocatorWithinViewport, expectNoPageHorizontalOverflow } from './support/mobileResponsive'
import {
	installLoginMobileResponsiveFixtures,
	seedLoginMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'

test.describe('@mobile-responsive Login mobile responsive draft', () => {
	test('login screen fits a narrow mobile viewport without horizontal overflow', async ({ page }) => {
		await seedLoginMobileResponsiveStorage(page, '')
		await installLoginMobileResponsiveFixtures(page, ['valid-token'])
		await page.setViewportSize({ width: 320, height: 568 })
		await page.goto('/setup')

		await expect(page.getByRole('heading', { name: 'S3Desk' })).toBeVisible()
		await expect(page.getByPlaceholder('API_TOKEN…')).toBeVisible()
		await expectLocatorWithinViewport(page.locator('form').first())
		await expectNoPageHorizontalOverflow(page)
	})

	test('login screen keeps controls visible with an invalid stored token on mobile', async ({ page }) => {
		await seedLoginMobileResponsiveStorage(page, 'stale-token')
		await installLoginMobileResponsiveFixtures(page, ['valid-token'])
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/setup')

		await expect(page.getByText('Stored API token for this browser session is invalid.')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Clear stored token' })).toBeVisible()
		await expectLocatorWithinViewport(page.locator('form').first())
		await expectNoPageHorizontalOverflow(page)
	})

	test('login theme toggle remains reachable on mobile', async ({ page }) => {
		await seedLoginMobileResponsiveStorage(page, '')
		await installLoginMobileResponsiveFixtures(page, ['valid-token'])
		await page.setViewportSize({ width: 360, height: 800 })
		await page.goto('/setup')

		const toggle = page.getByRole('button', { name: /Switch to (dark|light) mode/i })
		await expect(toggle).toBeVisible()
		await expectLocatorWithinViewport(toggle)
	})
})
