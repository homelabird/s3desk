import { expect, test, type Locator } from '@playwright/test'

import { seedLocalStorage } from './support/apiFixtures'
import { installObjectsMobileResponsiveFixtures } from './support/objectsMobileResponsive'
import { installProfilesBucketsMobileResponsiveFixtures, seedProfilesBucketsMobileResponsiveStorage } from './support/profilesBucketsMobileResponsive'
import { installSettingsMobileResponsiveFixtures, seedSettingsMobileResponsiveStorage } from './support/settingsLoginMobileResponsive'
import { dialogByName, gotoProfilesPage, gotoWithDynamicImportRecovery } from './support/ui'

async function expectPanelWithinViewport(panel: Locator) {
	await expect.poll(() => panel.evaluate((element) => {
		const rect = element.getBoundingClientRect() // e2e-geometry-allow verifies the scrollable popover remains completely inside the narrow viewport
		return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight
	})).toBe(true)
}

test.describe('@mobile-responsive Common controls', () => {
	test('expanded profile tools stay scrollable and keyboard reachable in a short viewport', async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 568, height: 320 })
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await gotoProfilesPage(page)
		const opener = page.getByRole('button', { name: 'Profile tools for Responsive Profile' })
		await opener.click()
		await page.getByRole('menuitem', { name: /Diagnostics & export/ }).click()
		const menu = page.getByRole('menu').first()
		const panel = menu.locator('..')
		await expectPanelWithinViewport(panel)
		await expect.poll(() => panel.evaluate((element) => element.scrollHeight > element.clientHeight)) // e2e-geometry-allow confirms overflowing actions have a usable scroll region
			.toBe(true)
		await page.getByRole('menuitem', { name: 'Edit', exact: true }).focus()
		await page.keyboard.press('End')
		const lastAction = page.getByRole('menuitem', { name: 'Delete', exact: true })
		await expect(lastAction).toBeFocused()
		await expect(lastAction).toBeInViewport({ ratio: 1 })
		await page.screenshot({ path: testInfo.outputPath('profile-tools-scroll-568x320.png'), fullPage: true })
		await page.keyboard.press('Escape')
		await expect(opener).toBeFocused()
		await expect(opener).toHaveAttribute('aria-expanded', 'false')
	})

	test('long parent folder names wrap and deep ancestor menus remain navigable at 320px', async ({ page }, testInfo) => {
		const folderName = 'regionalworkspaceidentifier'.repeat(4)
		const ancestorParts = [folderName, ...Array.from({ length: 12 }, (_, index) => `level-${index + 1}`)]
		await page.setViewportSize({ width: 320, height: 568 })
		await installObjectsMobileResponsiveFixtures(page)
		await seedLocalStorage(page, {
			apiToken: 'objects-mobile-token', profileId: 'objects-mobile-profile', bucket: 'objects-mobile-bucket',
			prefix: `${ancestorParts.join('/')}/current/`, objectsUIMode: 'advanced', objectsDetailsOpen: false,
		})
		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'))
		const breadcrumb = page.getByRole('navigation', { name: 'Location breadcrumb' })
		await breadcrumb.getByRole('button', { name: 'Parent folders' }).click()
		const menu = page.getByRole('menu').first()
		const panel = menu.locator('..')
		const longAncestor = menu.getByRole('menuitem', { name: `${folderName}/`, exact: true })
		await expectPanelWithinViewport(panel)
		await expect.poll(() => longAncestor.locator('span').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)) // e2e-geometry-allow proves the full unbroken folder label reflows within its menu item
			.toBe(true)
		await page.screenshot({ path: testInfo.outputPath('parent-folders-long-label-320.png'), fullPage: true })
		await longAncestor.focus()
		await page.keyboard.press('End')
		const lastAncestor = menu.getByRole('menuitem', { name: 'level-12/', exact: true })
		await expect(lastAncestor).toBeFocused()
		await expect(lastAncestor).toBeInViewport({ ratio: 1 })
		await page.keyboard.press('Enter')
		await expect(breadcrumb.getByRole('button', { name: 'level-12/', exact: true })).toHaveAttribute('aria-current', 'location')
	})

	test('numeric settings preserve partial typing while valid edits save immediately', async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 320, height: 568 })
		await installSettingsMobileResponsiveFixtures(page)
		await seedSettingsMobileResponsiveStorage(page)
		await page.goto('/settings')
		const settings = dialogByName(page, 'Settings')
		await settings.getByRole('tab', { name: 'Transfers', exact: true }).click()
		await settings.getByText('Advanced transfer options').click()
		const chunkSize = settings.getByRole('spinbutton', { name: 'Upload chunk size (MiB)' })
		await chunkSize.focus()
		await chunkSize.press('ControlOrMeta+A')
		await chunkSize.pressSequentially('6')
		await expect(chunkSize).toHaveValue('6')
		await expect.poll(() => page.evaluate(() => localStorage.getItem('uploadChunkSizeMiB'))).toBe('128')
		await chunkSize.pressSequentially('4')
		await expect(chunkSize).toHaveValue('64')
		await expect.poll(() => page.evaluate(() => localStorage.getItem('uploadChunkSizeMiB'))).toBe('64')
		await chunkSize.press('ArrowUp')
		await expect(chunkSize).toHaveValue('80')
		await expect.poll(() => page.evaluate(() => localStorage.getItem('uploadChunkSizeMiB'))).toBe('80')
		await chunkSize.fill('999')
		await expect(chunkSize).toHaveValue('999')
		await expect.poll(() => page.evaluate(() => localStorage.getItem('uploadChunkSizeMiB'))).toBe('80')
		await chunkSize.press('Enter')
		await expect(chunkSize).toHaveValue('512')
		await expect.poll(() => page.evaluate(() => localStorage.getItem('uploadChunkSizeMiB'))).toBe('512')
		await chunkSize.fill('')
		await expect(chunkSize).toHaveValue('')
		await expect.poll(() => page.evaluate(() => localStorage.getItem('uploadChunkSizeMiB'))).toBe('512')
		await chunkSize.press('Tab')
		await expect(chunkSize).toHaveValue('128')
		await expect.poll(() => page.evaluate(() => localStorage.getItem('uploadChunkSizeMiB'))).toBe('128')
		await page.screenshot({ path: testInfo.outputPath('numeric-setting-320.png'), fullPage: true })
	})
})
