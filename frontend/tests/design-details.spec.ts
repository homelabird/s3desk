import { expect, test } from '@playwright/test'

import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import { installObjectsMobileResponsiveFixtures, seedObjectsMobileResponsiveStorage } from './support/objectsMobileResponsive'
import { gotoJobsPage, gotoObjectsPage } from './support/ui'

test('dialog close button has a visible keyboard focus and restores its trigger', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 900 })
	await installObjectsMobileResponsiveFixtures(page)
	await seedObjectsMobileResponsiveStorage(page)
	await gotoObjectsPage(page)
	const trigger = page.getByRole('button', { name: /^New folder/ })
	await trigger.click()
	const dialog = page.getByRole('dialog', { name: 'New folder', exact: true })
	await expect(dialog.getByRole('textbox', { name: 'Folder name' })).toBeFocused()
	const close = dialog.getByRole('button', { name: 'Close', exact: true })
	await close.focus()
	await page.keyboard.press('Tab')
	await page.keyboard.press('Shift+Tab')
	await expect(close).toBeFocused()
	await dialog.screenshot({ path: testInfo.outputPath('dialog-close-focus.png') })
	await expect(close).toHaveCSS('outline-style', 'solid')
	await expect(close).toHaveCSS('outline-width', '2px')
	await page.keyboard.press('Escape')
	await expect(dialog).toHaveCount(0)
	await expect(trigger).toBeFocused()
})

for (const width of [320, 768]) {
	test(`transfer errors and history actions fit at ${width}px`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 })
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
		const error = `Connection failed: ${'upstream-endpoint-'.repeat(12)}timeout`
		await page.addInitScript(({ error }) => {
			const task = {
				id: 'design-transfer', profileId: 'jobs-mobile-profile', label: 'annual-report.pdf',
				status: 'failed', error, createdAtMs: 1, finishedAtMs: Date.now(),
				loadedBytes: 0, totalBytes: 1024, speedBps: 0, etaSeconds: 0,
			}
			sessionStorage.setItem('transfersHistoryV1', JSON.stringify({
				version: 1, savedAtMs: Date.now(),
				downloads: [{ ...task, kind: 'object', bucket: 'jobs-mobile-bucket', key: 'annual-report.pdf' }],
				uploads: [{ ...task, bucket: 'jobs-mobile-bucket', prefix: 'reports/', fileCount: 1 }],
			}))
		}, { error })
		await gotoJobsPage(page)
		const trigger = page.getByRole('button', { name: 'Transfers', exact: true })
		await trigger.click()
		const drawer = page.getByRole('dialog', { name: 'Transfers', exact: true })
		const close = drawer.getByRole('button', { name: 'Close', exact: true })
		await close.focus()
		await page.keyboard.press('Tab')
		await page.keyboard.press('Shift+Tab')
		await expect(close).toBeFocused()
		await drawer.screenshot({ path: testInfo.outputPath('transfer-close-focus.png') })
		for (const tab of ['Downloads', 'Uploads']) {
			await drawer.getByRole('tab', { name: new RegExp(tab) }).click()
			const row = drawer.getByRole('listitem')
			await expect(row.getByText(error, { exact: true })).toBeVisible()
			await drawer.screenshot({ path: testInfo.outputPath(`transfer-${tab.toLowerCase()}-error.png`) })
			const dimensions = await row.evaluate(element => ({
				width: element.clientWidth, // e2e-geometry-allow checks the transfer card's horizontal bounds
				content: element.scrollWidth, // e2e-geometry-allow detects unbroken error text overflowing the card
			}))
			expect(dimensions.content).toBeLessThanOrEqual(dimensions.width) // e2e-geometry-allow requires all error text to remain inside the card
			const remove = row.getByRole('button', { name: /^Remove/ })
			await expect(row.getByRole('button', { name: /^Retry/ })).toBeInViewport({ ratio: 1 })
			await expect(remove).toHaveAttribute('title', 'Remove from transfer history')
			await expect(remove).not.toHaveClass(/ant-btn-dangerous/)
			await remove.click()
			await expect(row).toHaveCount(0)
		}
		await close.focus()
		await page.keyboard.press('Tab')
		await page.keyboard.press('Shift+Tab')
		await expect(close).toBeFocused()
		await expect(close).toHaveCSS('outline-style', 'solid')
		await expect(close).toHaveCSS('outline-width', '2px')
		await page.keyboard.press('Escape')
		await expect(drawer).toHaveCount(0)
		await expect(trigger).toBeFocused()
	})
}
