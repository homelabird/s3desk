import { expect, test } from '@playwright/test'

import {
	installLoginMobileResponsiveFixtures,
	seedLoginMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'
import { gotoProfilesPage } from './support/ui'

test.describe('@mobile-responsive Login mobile workflows', () => {
	test('login succeeds on a narrow mobile viewport', async ({ page }) => {
		const validToken = 'valid-token'
		const bootstrapStatuses: number[] = []
		let metaRequests = 0
		let profileRequests = 0
		const passwordFormWarnings: string[] = []
		page.on('request', (request) => {
			const pathname = new URL(request.url()).pathname
			if (pathname === '/api/v1/meta') metaRequests += 1
			if (pathname === '/api/v1/profiles') profileRequests += 1
		})
		page.on('response', (response) => {
			if (new URL(response.url()).pathname === '/api/v1/bootstrap') bootstrapStatuses.push(response.status())
		})
		page.on('console', (message) => {
			if (message.text().includes('Password forms should have')) passwordFormWarnings.push(message.text())
		})

		await seedLoginMobileResponsiveStorage(page, '')
		await installLoginMobileResponsiveFixtures(page, [validToken])
		await page.setViewportSize({ width: 320, height: 568 })
		await gotoProfilesPage(page, {
			ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }),
		})

		await expect(page.getByRole('heading', { name: 'S3Desk' })).toBeVisible()
		expect(bootstrapStatuses).toEqual([])
		expect(passwordFormWarnings).toEqual([])
		await page.getByPlaceholder('API_TOKEN').fill(validToken)
		await page.getByRole('button', { name: 'Login' }).click()
		await expect(page.getByText('No profiles yet')).toBeVisible({ timeout: 10_000 })
		expect(bootstrapStatuses).toEqual([200])
		expect(metaRequests).toBe(0)
		expect(profileRequests).toBe(0)
	})

	test('invalid stored token can be cleared and replaced on mobile', async ({ page }) => {
		const validToken = 'valid-token'

		await seedLoginMobileResponsiveStorage(page, 'stale-token')
		await installLoginMobileResponsiveFixtures(page, [validToken])
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
		await gotoProfilesPage(page, {
			ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }),
		})

		await expect(page).toHaveScreenshot('login-mobile-device-token-panel.png')
		await page.getByRole('button', { name: 'Dark mode' }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
		await expect(page.getByRole('button', { name: 'Light mode' })).toBeVisible()
	})
})
