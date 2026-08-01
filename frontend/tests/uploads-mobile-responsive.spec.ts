import { expect, test, type Locator } from '@playwright/test'

import { installUploadsMobileResponsiveFixtures, seedUploadsMobileResponsiveStorage } from './support/uploadsMobileResponsive'
import { readProfileScopedLocalStorage } from './support/storage'
import { addUploadSourceFromDevice, dialogByName, gotoUploadsPage, openTransfersUploadRow, queueSelectedUpload } from './support/ui'

async function expectMinTouchHeight(locator: Locator, minHeight = 44) {
	await expect.poll(() => locator.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(minHeight) // e2e-geometry-allow validates upload primary action touch-target height
}

test.describe('@mobile-responsive Uploads mobile workflows', () => {
	test.beforeEach(async ({ page }) => {
		await installUploadsMobileResponsiveFixtures(page)
		await seedUploadsMobileResponsiveStorage(page)
	})

	test('upload destination prefix persists across a mobile reload', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoUploadsPage(page)

		await expect(page.getByRole('button', { name: /^Queue upload/ })).toHaveCount(0)
		await expectMinTouchHeight(page.getByRole('button', { name: /Add from device/i }))
		const prefixInput = page.getByLabel('Upload prefix (optional)')
		await prefixInput.fill('photos/mobile')

		await expect(page.getByText('s3://uploads-mobile-bucket/photos/mobile')).toBeVisible()
		await expect
			.poll(() =>
				readProfileScopedLocalStorage(page, {
					apiToken: 'uploads-mobile-token',
					name: 'prefix',
					namespace: 'uploads',
					profileId: 'uploads-mobile-profile',
				}, ''),
			)
			.toBe('photos/mobile')

		await page.reload({ waitUntil: 'load' })
		await expect(page.getByLabel('Upload prefix (optional)')).toHaveValue('photos/mobile')
		await expect(page.getByText('s3://uploads-mobile-bucket/photos/mobile')).toBeVisible()
	})

	test('upload source sheet opens from the mobile page', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoUploadsPage(page)

		await page.getByRole('button', { name: /Add from device/i }).click()

		const dialog = dialogByName(page, 'Add upload source')
		await expect(dialog).toBeVisible()
		await expect(dialog.getByRole('button', { name: 'Choose files' })).toBeVisible()
		await expect(dialog.getByRole('button', { name: 'Choose folder' })).toBeVisible()
		await expect(dialog.getByText('s3://uploads-mobile-bucket')).toBeVisible()

		await dialog.getByLabel('Close', { exact: true }).click()
		await expect(dialog).toHaveCount(0)
	})

	test('selected files can be cleared from the mobile uploads header', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoUploadsPage(page)

		await addUploadSourceFromDevice(page, {
			name: 'alpha.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('alpha'),
		})

		await expect(page.getByText('alpha.txt')).toBeVisible()
		await expect(page.getByRole('button', { name: /Queue upload \(1\)/i })).toBeEnabled()
		await page.getByRole('button', { name: 'Clear selection' }).click()

		await expect(page.getByRole('button', { name: /^Queue upload/ })).toHaveCount(0)
		await expect(page.getByText('Add files or a folder first.')).toBeVisible()
	})

	test('queueing a mobile upload exposes the queued file in Transfers', async ({ page }) => {
		test.setTimeout(45_000)
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoUploadsPage(page)

		await addUploadSourceFromDevice(page, {
			name: 'alpha.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('alpha'),
		})

		await queueSelectedUpload(page, { count: 1 })
		const { dialog: transfersDialog, row } = await openTransfersUploadRow(page, 'alpha.txt', {
			triggerButtonName: 'Open Transfers',
		})
		await expect(transfersDialog.getByRole('tab', { name: /Uploads/i })).toHaveAttribute('aria-selected', 'true')
		await expect(row).toContainText('alpha.txt')
		await expect
			.poll(() =>
				row.evaluate((element) => {
					const dialog = element.closest('[role="dialog"]')
					if (!dialog) return false
					const rowRect = element.getBoundingClientRect() // e2e-geometry-allow verifies upload source rows fit the dialog viewport
					const dialogRect = dialog.getBoundingClientRect() // e2e-geometry-allow bounds row/button checks to dialog viewport
					const buttons = Array.from(element.querySelectorAll('button'))
					const buttonsFit = buttons.every((button) => {
						const rect = button.getBoundingClientRect() // e2e-geometry-allow validates mobile button hit area and containment
						return rect.left >= dialogRect.left - 1 && rect.right <= dialogRect.right + 1 && rect.height >= 44
					})
					return rowRect.left >= dialogRect.left - 1 && rowRect.right <= dialogRect.right + 1 && element.scrollWidth <= element.clientWidth + 1 && buttonsFit // e2e-geometry-allow verifies row has no horizontal overflow
				}),
			)
			.toBe(true)
	})
})
