import { expect, test } from '@playwright/test'

import { expectLocatorWithinViewport, expectNoPageHorizontalOverflow } from './support/mobileResponsive'
import {
	installSettingsMobileResponsiveFixtures,
	seedSettingsMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'

test.describe('@mobile-responsive Settings mobile responsive draft', () => {
	test.beforeEach(async ({ page }) => {
		await installSettingsMobileResponsiveFixtures(page)
		await seedSettingsMobileResponsiveStorage(page)
	})

	test('settings drawer stays within the mobile viewport and avoids horizontal overflow', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/settings')

		const drawer = page.getByRole('dialog', { name: 'Settings' })
		await expect(drawer).toBeVisible()
		await expectLocatorWithinViewport(drawer)
		await expectNoPageHorizontalOverflow(page)
	})

	test('settings tabs keep horizontal scrolling behavior on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/settings')

		const drawer = page.getByRole('dialog', { name: 'Settings' })
		const tablist = drawer.getByRole('tablist').first()
		const workspaceTab = drawer.getByRole('tab', { name: 'Workspace' })

		await expect(tablist).toBeVisible()
		await expect(workspaceTab).toBeVisible()

		const tabMetrics = await tablist.evaluate((node) => {
			const element = node as HTMLElement
			const styles = window.getComputedStyle(element)
			return {
				clientWidth: element.clientWidth,
				scrollWidth: element.scrollWidth,
				scrollSnapType: styles.scrollSnapType,
			}
		})

		expect(tabMetrics.scrollWidth).toBeGreaterThan(tabMetrics.clientWidth)
		expect(tabMetrics.scrollSnapType).toContain('x')
	})

	test('settings tabs keep touch targets at mobile sizes', async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 800 })
		await page.goto('/settings')

		const drawer = page.getByRole('dialog', { name: 'Settings' })
		const tabs = [
			drawer.getByRole('tab', { name: 'Workspace' }),
			drawer.getByRole('tab', { name: 'Objects' }),
			drawer.getByRole('tab', { name: 'Transfers' }),
		]

		for (const tab of tabs) {
			await expect(tab).toBeVisible()
			const box = await tab.boundingBox()
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
		}
	})
})
