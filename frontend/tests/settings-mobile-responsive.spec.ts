import { expect, test, type Locator } from '@playwright/test'

import {
	installSettingsMobileResponsiveFixtures,
	seedSettingsMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'
import { expectMinTouchTarget } from './support/geometry'
import { dialogByName } from './support/ui'

async function setSwitch(scope: Locator, name: string, enabled: boolean) {
	const control = scope.getByRole('switch', { name })
	const state = await control.getAttribute('aria-checked')
	if ((state === 'true') !== enabled) {
		await control.click()
	}
}

async function openTransferAdvancedOptions(scope: Locator, advancedOptionsName: string, proxySwitchName: string) {
	const advancedOptionsLabel = scope.getByText(advancedOptionsName)
	const proxySwitch = scope.getByRole('switch', { name: proxySwitchName })
	const isExpanded = async () =>
		advancedOptionsLabel.evaluate((element) => element.closest('[aria-expanded]')?.getAttribute('aria-expanded') === 'true')

	if (!(await isExpanded())) {
		await advancedOptionsLabel.click()
	}
	await expect.poll(isExpanded).toBe(true)
	await expect(proxySwitch).toBeVisible()
	await expect
		.poll(() =>
			proxySwitch.evaluate((element) => {
				let current: HTMLElement | null = element as HTMLElement
				let visibleOpacity = 1
				while (current) {
					const opacity = Number(window.getComputedStyle(current).opacity)
					if (Number.isFinite(opacity)) visibleOpacity = Math.min(visibleOpacity, opacity)
					current = current.parentElement
				}
				return visibleOpacity
			}),
		)
		.toBeGreaterThan(0.99)
}

async function reopenSettingsFromCompactHeader(drawer: Locator) {
	const page = drawer.page()
	await page.getByTestId('app-header').getByRole('button', { name: 'App menu' }).click()
	await page.getByRole('menuitem', { name: /Settings/i }).click()
	await expect(drawer).toBeVisible()
}

test.describe('@mobile-responsive Settings mobile workflows', () => {
	test.beforeEach(async ({ page }) => {
		await installSettingsMobileResponsiveFixtures(page)
		await seedSettingsMobileResponsiveStorage(page)
	})

	test('access settings keep a long profile ID readable and distinguish unapplied token edits at 320px', async ({ page }, testInfo) => {
		const profileId = `profile-${'regional-workspace-identifier-'.repeat(8)}`
		await page.setViewportSize({ width: 320, height: 740 })
		await page.route('**/api/v1/profiles', (route) => route.fulfill({ json: [{
			id: profileId, name: 'Long regional workspace profile', provider: 's3_compatible',
			endpoint: 'http://localhost:9000', region: 'us-east-1', forcePathStyle: true,
			preserveLeadingSlash: false, tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
		}] }))
		await page.goto('/settings')
		const drawer = dialogByName(page, 'Settings')
		const identifier = drawer.getByText(`ID: ${profileId}`, { exact: true })
		await expect(identifier).toBeVisible()
		await page.screenshot({ path: testInfo.outputPath('settings-access-long-id-320.png'), fullPage: true })
		await expect.poll(() => identifier.evaluate((element) => {
			const rect = element.getBoundingClientRect() // e2e-geometry-allow proves the complete selectable profile ID reflows at 320 CSS px
			return rect.left >= 0 && rect.right <= window.innerWidth
		})).toBe(true)
		const apply = drawer.getByRole('button', { name: 'Apply', exact: true })
		await expect(apply).toBeDisabled()
		const token = drawer.getByPlaceholder('Must match API_TOKEN')
		await token.fill('edited-session-token')
		await expect(apply).toBeEnabled()
		await expect(drawer.getByText('Unapplied token change. Select Apply to reconnect.')).toBeVisible()
		await page.screenshot({ path: testInfo.outputPath('settings-access-token-draft-320.png'), fullPage: true })
		await token.fill('valid-token')
		await expect(apply).toBeDisabled()
		await expect(drawer.getByText('Unapplied token change. Select Apply to reconnect.')).toHaveCount(0)
	})

	test('thumbnail quality remains usable and saved on narrow mobile', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 568 })
		await page.goto('/settings')
		const drawer = dialogByName(page, 'Settings')
		await drawer.getByRole('tab', { name: 'Objects', exact: true }).click()
		const quality = drawer.getByRole('combobox', { name: 'Thumbnail quality' })
		await expect(quality).toBeVisible()
		await expectMinTouchTarget(quality)
		await quality.selectOption('512')
		await expect.poll(() => page.evaluate(() => window.localStorage.getItem('objectsThumbnailQuality'))).toBe('512')
		await drawer.getByRole('button', { name: 'Close' }).click()

		const reopenedDrawer = dialogByName(page, 'Settings')
		await reopenSettingsFromCompactHeader(reopenedDrawer)
		await reopenedDrawer.getByRole('tab', { name: 'Objects', exact: true }).click()
		await expect(reopenedDrawer.getByRole('combobox', { name: 'Thumbnail quality' })).toHaveValue('512')
		await setSwitch(reopenedDrawer, 'Show image thumbnails', false)
		await expect(reopenedDrawer.getByRole('combobox', { name: 'Thumbnail quality' })).toBeDisabled()
	})

	test('settings drawer persists transfer preferences across mobile reopen', async ({ page }) => {
		const advancedOptionsName = 'Advanced transfer options'
		const proxySwitchName = 'Use server for downloads and previews'

		await page.goto('/settings')

		const drawer = dialogByName(page, 'Settings')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('tab', { name: 'Transfers' }).click()
		await expect(drawer.getByRole('combobox', { name: 'Transfer safety' })).toHaveValue('auto')
		await openTransferAdvancedOptions(drawer, advancedOptionsName, proxySwitchName)
		await expect(drawer.getByText(proxySwitchName)).toBeVisible()
		await expectMinTouchTarget(drawer.getByRole('switch', { name: proxySwitchName }))

		await expect(drawer.getByRole('switch', { name: proxySwitchName })).toHaveAttribute('aria-checked', 'true')
		await setSwitch(drawer, proxySwitchName, false)
		await expect
			.poll(async () => page.evaluate(() => JSON.parse(window.localStorage.getItem('downloadLinkProxyEnabledV2') ?? 'null')))
			.toBe(false)

		await drawer.getByRole('button', { name: 'Close' }).click()
		await expect(drawer).toHaveCount(0)

		const reopenedDrawer = dialogByName(page, 'Settings')
		await reopenSettingsFromCompactHeader(reopenedDrawer)
		await reopenedDrawer.getByRole('tab', { name: 'Transfers' }).click()
		await openTransferAdvancedOptions(reopenedDrawer, advancedOptionsName, proxySwitchName)
		await expect(reopenedDrawer.getByRole('switch', { name: proxySwitchName })).toHaveAttribute('aria-checked', 'false')
	})

	test('settings access token survives mobile reopen after apply', async ({ page }) => {
		const updatedToken = 'updated-token'

		await page.goto('/settings')

		const drawer = dialogByName(page, 'Settings')
		await expect(drawer).toBeVisible()

		const tokenInput = drawer.getByPlaceholder('Must match API_TOKEN')
		await tokenInput.fill(updatedToken)
		await drawer.getByRole('button', { name: 'Apply' }).click()
		await expect.poll(async () => page.evaluate(() => JSON.parse(window.sessionStorage.getItem('apiToken') ?? '""'))).toBe(updatedToken)

		await drawer.getByRole('button', { name: 'Close' }).click()
		await expect(drawer).toHaveCount(0)

		const reopenedDrawer = dialogByName(page, 'Settings')
		await reopenSettingsFromCompactHeader(reopenedDrawer)
		await expect(reopenedDrawer.getByPlaceholder('Must match API_TOKEN')).toHaveValue(updatedToken)
	})

	test('settings tabs can reach support recovery tools on narrow mobile', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 568 })
		await page.goto('/settings')

		const drawer = dialogByName(page, 'Settings')
		await expect(drawer).toBeVisible()

		const supportTab = drawer.getByRole('tab', { name: 'Support' })
		await supportTab.click()
		await expect(supportTab).toHaveAttribute('aria-selected', 'true')
		await expect(supportTab).toBeInViewport()
		const recoveryTools = drawer.getByRole('button', { name: /Browser recovery/ })
		await expect(recoveryTools).toBeVisible()
		await recoveryTools.click()
		await expect(drawer.getByRole('button', { name: 'Clear saved layout' })).toBeVisible()
	})
})
