import { expect, test } from '@playwright/test'

import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import { installObjectsMobileResponsiveFixtures, seedObjectsMobileResponsiveStorage } from './support/objectsMobileResponsive'
import { installSettingsMobileResponsiveFixtures, seedSettingsMobileResponsiveStorage } from './support/settingsLoginMobileResponsive'
import { dialogByName, gotoJobsPage, gotoObjectsPage, objectsListRow } from './support/ui'

test.describe('@mobile-responsive Overlay keyboard details', () => {
	test('collapsed transfer settings stay outside both focus-trap boundaries', async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 320, height: 740 })
		await installSettingsMobileResponsiveFixtures(page)
		await seedSettingsMobileResponsiveStorage(page)
		await page.goto('/settings')
		const settings = dialogByName(page, 'Settings')
		await settings.getByRole('tab', { name: 'Transfers', exact: true }).click()
		const advanced = settings.getByRole('button', { name: /Advanced transfer options/ })
		const resumeConversion = settings.getByRole('switch', { name: 'Resume conversion mode', exact: true, includeHidden: true })
		await advanced.click()
		await expect(resumeConversion).toBeVisible()
		await advanced.click()
		await expect(resumeConversion).toHaveCount(1)
		await expect(resumeConversion).not.toBeVisible()

		const close = settings.getByRole('button', { name: 'Close', exact: true })
		await close.focus()
		await page.keyboard.press('Shift+Tab')
		await page.screenshot({ path: testInfo.outputPath('settings-collapsed-reverse-tab.png'), animations: 'disabled' })
		await expect.soft(advanced).toBeFocused()

		await advanced.focus()
		await page.keyboard.press('Tab')
		await page.screenshot({ path: testInfo.outputPath('settings-collapsed-forward-tab.png'), animations: 'disabled' })
		await expect.soft(close).toBeFocused()
	})

	test('new-folder actions fit a simulated shorter visual viewport', async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 390, height: 900 })
		// This models the overlay geometry contract; it does not open a real device keyboard.
		await page.addInitScript(() => {
			class SimulatedVisualViewport extends EventTarget {
				height = 420
				width = 390
				offsetTop = 80
				offsetLeft = 0
				pageTop = 80
				pageLeft = 0
				scale = 1
			}
			Object.defineProperty(window, 'visualViewport', { configurable: true, value: new SimulatedVisualViewport() })
		})
		await installObjectsMobileResponsiveFixtures(page)
		await seedObjectsMobileResponsiveStorage(page)
		await gotoObjectsPage(page)
		await expect(page.getByRole('button', { name: 'Bucket: objects-mobile-bucket', exact: true })).toBeVisible()
		await expect(objectsListRow(page, 'alpha.txt')).toBeVisible()
		await page.getByRole('button', { name: 'More actions', exact: true }).click()
		const toolsMenu = page.getByRole('menu').filter({ has: page.getByRole('menuitem', { name: /New folder…/ }) }).last()
		await expect(toolsMenu).toBeVisible()
		await toolsMenu.getByRole('menuitem', { name: /New folder…/ }).click()
		const dialog = dialogByName(page, 'New folder')
		await expect(dialog.getByRole('textbox', { name: 'Folder name', exact: true })).toBeFocused()
		await expect.poll(() => dialog.locator('..').evaluate(element => element.style.getPropertyValue('--s3d-visual-viewport-height'))).toBe('420px')
		await expect.poll(() => dialog.locator('..').evaluate(element => element.style.getPropertyValue('--s3d-visual-viewport-top'))).toBe('80px')
		await page.screenshot({ path: testInfo.outputPath('new-folder-visual-viewport-simulation.png'), animations: 'disabled' })
		await expect.poll(() => dialog.evaluate(element => {
			const rect = element.getBoundingClientRect() // e2e-geometry-allow validates the dialog within the simulated visible viewport bounds
			return rect.top >= 79 && rect.bottom <= 501
		})).toBe(true)
		await expect.poll(() => dialog.getByRole('button', { name: 'Create folder', exact: true }).evaluate(element => {
			const rect = element.getBoundingClientRect() // e2e-geometry-allow verifies the submit action remains above the simulated keyboard boundary
			return rect.top >= 79 && rect.bottom <= 501
		})).toBe(true)
	})

	test('keyboard removal keeps focus in the next transfer or its queue tab', async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 320, height: 900 })
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
		await page.addInitScript(() => {
			const task = { profileId: 'jobs-mobile-profile', bucket: 'jobs-mobile-bucket', kind: 'object', status: 'succeeded', createdAtMs: 1, finishedAtMs: Date.now(), loadedBytes: 8192, totalBytes: 8192, speedBps: 0, etaSeconds: 0 }
			sessionStorage.setItem('transfersHistoryV1', JSON.stringify({
				version: 1,
				savedAtMs: Date.now(),
				downloads: [{ ...task, id: 'first', key: 'first.txt', label: 'first.txt' }, { ...task, id: 'next', key: 'next.txt', label: 'next.txt' }],
				uploads: [],
			}))
		})
		await gotoJobsPage(page)
		await page.getByRole('button', { name: 'Transfers', exact: true }).click()
		const transfers = dialogByName(page, 'Transfers')
		const first = transfers.getByRole('listitem', { name: /^Download first\.txt,/ })
		const next = transfers.getByRole('listitem', { name: /^Download next\.txt,/ })
		const firstRemove = first.getByRole('button', { name: 'Remove download first.txt', exact: true })
		const nextRemove = next.getByRole('button', { name: 'Remove download next.txt', exact: true })
		await firstRemove.focus()
		await page.keyboard.press('Enter')
		await expect(first).toHaveCount(0)
		await page.screenshot({ path: testInfo.outputPath('transfer-remove-next-focus.png'), animations: 'disabled' })
		await expect.soft(nextRemove).toBeFocused()

		await nextRemove.focus()
		await page.keyboard.press('Enter')
		await expect(next).toHaveCount(0)
		await page.screenshot({ path: testInfo.outputPath('transfer-remove-empty-focus.png'), animations: 'disabled' })
		await expect.soft(transfers.getByRole('tab', { name: /Downloads/ })).toBeFocused()
	})
})
