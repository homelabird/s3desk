import { expect, test, type Locator } from '@playwright/test'

import {
	installSettingsMobileResponsiveFixtures,
	seedSettingsMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'
import { dialogByName } from './support/ui'

async function setSwitch(scope: Locator, name: string, enabled: boolean) {
	const control = scope.getByRole('switch', { name })
	const state = await control.getAttribute('aria-checked')
	if ((state === 'true') !== enabled) {
		await control.click()
	}
}

async function expectMinTouchHeight(locator: Locator, minHeight = 44) {
	await expect.poll(() => locator.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(minHeight) // e2e-geometry-allow validates shared switch touch-target height
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

	test('settings drawer persists transfer preferences across mobile reopen', async ({ page }) => {
		const advancedOptionsName = 'Advanced transfer options'
		const proxySwitchName = 'Force server proxy for downloads and previews'

		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/settings')

		const drawer = dialogByName(page, 'Settings')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('tab', { name: 'Transfers' }).click()
		await expect(drawer.getByText('Defaults work for most connections.')).toBeVisible()
		await openTransferAdvancedOptions(drawer, advancedOptionsName, proxySwitchName)
		await expect(drawer.getByText(proxySwitchName)).toBeVisible()
		await expectMinTouchHeight(drawer.getByRole('switch', { name: proxySwitchName }))

		await setSwitch(drawer, proxySwitchName, true)
		await expect
			.poll(async () => page.evaluate(() => JSON.parse(window.localStorage.getItem('downloadLinkProxyEnabled') ?? 'false')))
			.toBe(true)

		await drawer.getByRole('button', { name: 'Close' }).click()
		await expect(drawer).toHaveCount(0)

		const reopenedDrawer = dialogByName(page, 'Settings')
		await reopenSettingsFromCompactHeader(reopenedDrawer)
		await reopenedDrawer.getByRole('tab', { name: 'Transfers' }).click()
		await openTransferAdvancedOptions(reopenedDrawer, advancedOptionsName, proxySwitchName)
		await expect(reopenedDrawer.getByRole('switch', { name: proxySwitchName })).toHaveAttribute('aria-checked', 'true')
	})

	test('settings access token survives mobile reopen after apply', async ({ page }) => {
		const updatedToken = 'updated-token'

		await page.setViewportSize({ width: 390, height: 844 })
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
