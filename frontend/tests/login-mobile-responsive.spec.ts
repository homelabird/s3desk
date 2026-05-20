import { expect, test } from '@playwright/test'

import {
	installLoginMobileResponsiveFixtures,
	seedLoginMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'
import { gotoProfilesPage } from './support/ui'

test.describe('@mobile-responsive Login mobile workflows', () => {
	test('login succeeds on a narrow mobile viewport', async ({ page }) => {
		const validToken = 'valid-token'

		await seedLoginMobileResponsiveStorage(page, '')
		await installLoginMobileResponsiveFixtures(page, [validToken])
		await page.setViewportSize({ width: 320, height: 568 })
		await gotoProfilesPage(page, {
			ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }),
		})

		await expect(page.getByRole('heading', { name: 'S3Desk' })).toBeVisible()
		await page.getByPlaceholder('API_TOKEN').fill(validToken)
		await page.getByRole('button', { name: 'Login' }).click()
		await expect(page.getByText('No profiles yet')).toBeVisible({ timeout: 10_000 })
	})

	test('invalid stored token can be cleared and replaced on mobile', async ({ page }) => {
		const validToken = 'valid-token'

		await seedLoginMobileResponsiveStorage(page, 'stale-token')
		await installLoginMobileResponsiveFixtures(page, [validToken])
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoProfilesPage(page, {
			ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }),
		})

		const tokenInput = page.getByPlaceholder('API_TOKEN')
		await expect(page.getByText('Stored API token for this browser session is invalid.')).toBeVisible()
		await expect(tokenInput).toHaveValue('stale-token')

		await page.getByRole('button', { name: 'Clear stored token' }).click()
		await expect.poll(async () => page.evaluate(() => JSON.parse(window.sessionStorage.getItem('apiToken') ?? '""'))).toBe('')

		await tokenInput.fill(validToken)
		await page.getByRole('button', { name: 'Login' }).click()
		await expect(page.getByText('No profiles yet')).toBeVisible({ timeout: 10_000 })
	})

	test('theme switching remains reachable on mobile login', async ({ page }) => {
		await seedLoginMobileResponsiveStorage(page, '')
		await installLoginMobileResponsiveFixtures(page, ['valid-token'])
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoProfilesPage(page, {
			ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }),
		})

		await page.getByRole('button', { name: 'Dark mode' }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
		await expect(page.getByRole('button', { name: 'Light mode' })).toBeVisible()
	})
})
