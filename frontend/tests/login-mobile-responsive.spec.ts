import { expect, test } from '@playwright/test'

import {
	installLoginMobileResponsiveFixtures,
	seedLoginMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'
import { gotoProfilesPage } from './support/ui'

test.describe('@mobile-responsive Login mobile workflows', () => {
	test('login validation follows token edits and protects pending login input at 320px', async ({ page }, testInfo) => {
		await seedLoginMobileResponsiveStorage(page, '')
		await installLoginMobileResponsiveFixtures(page, ['valid-token'])
		await page.setViewportSize({ width: 320, height: 740 })
		await gotoProfilesPage(page, { ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }) })
		const token = page.getByPlaceholder('API_TOKEN')
		await token.fill('invalid-token')
		await page.getByRole('button', { name: 'Login', exact: true }).click()
		await expect(page.getByText('Login failed: invalid API token.', { exact: true })).toBeVisible()
		const wrapper = page.locator('.ant-input-affix-wrapper')
		await page.mouse.move(0, 0)
		await expect(wrapper).toHaveCSS('border-top-color', 'rgb(185, 74, 67)')
		await wrapper.hover()
		await expect(wrapper).toHaveCSS('border-top-color', 'rgb(185, 74, 67)')
		await token.focus()
		await page.keyboard.press('Tab')
		await page.keyboard.press('Shift+Tab')
		await expect(token).toBeFocused()
		await expect(wrapper).toHaveCSS('border-top-color', 'rgb(185, 74, 67)')
		await page.screenshot({ path: testInfo.outputPath('login-invalid-token-320.png'), fullPage: true })
		await page.getByRole('button', { name: 'Dark mode' }).click()
		await expect(wrapper).toHaveCSS('border-top-color', 'rgb(220, 145, 141)')
		await wrapper.hover()
		await expect(wrapper).toHaveCSS('border-top-color', 'rgb(220, 145, 141)')
		await token.focus()
		await page.keyboard.press('Tab')
		await page.keyboard.press('Shift+Tab')
		await expect(token).toBeFocused()
		await expect(wrapper).toHaveCSS('border-top-color', 'rgb(220, 145, 141)')
		await page.screenshot({ path: testInfo.outputPath('login-invalid-token-dark-320.png'), fullPage: true })
		await page.getByRole('button', { name: 'Light mode' }).click()
		await token.fill('valid-token')
		await expect(page.getByText('Login failed: invalid API token.', { exact: true })).toHaveCount(0)
		await expect(wrapper).not.toHaveClass(/ant-input-status-error/)
		await expect(wrapper).not.toHaveCSS('border-top-color', 'rgb(185, 74, 67)')
		let releaseLogin!: () => void
		const loginGate = new Promise<void>((resolve) => { releaseLogin = resolve })
		await page.route('**/api/v1/bootstrap', async (route) => {
			await loginGate
			return route.fallback()
		})
		try {
			await page.getByRole('button', { name: 'Login', exact: true }).click()
			await expect(token).toBeDisabled()
			await page.screenshot({ path: testInfo.outputPath('login-pending-320.png'), fullPage: true })
			releaseLogin()
			await expect(page.getByText('No profiles yet', { exact: true })).toBeVisible()
		} finally {
			releaseLogin()
		}
	})

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
