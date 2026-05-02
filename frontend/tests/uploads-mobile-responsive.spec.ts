import { expect, test } from '@playwright/test'

import { installUploadsMobileResponsiveFixtures, seedUploadsMobileResponsiveStorage } from './support/uploadsMobileResponsive'
import { readProfileScopedLocalStorage } from './support/storage'
import { addUploadSourceFromDevice, gotoUploadsPage, openTransfersUploadRow, queueSelectedUpload } from './support/ui'

test.describe('@mobile-responsive Uploads mobile workflows', () => {
	test.beforeEach(async ({ page }) => {
		await installUploadsMobileResponsiveFixtures(page)
		await seedUploadsMobileResponsiveStorage(page)
	})

	test('upload destination prefix persists across a mobile reload', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoUploadsPage(page)

		const prefixInput = page.getByLabel('Upload prefix (optional)')
		await prefixInput.fill('photos/mobile')

		await expect(page.locator('strong').filter({ hasText: 's3://uploads-mobile-bucket/photos/mobile' }).first()).toBeVisible()
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
		await expect(page.locator('strong').filter({ hasText: 's3://uploads-mobile-bucket/photos/mobile' }).first()).toBeVisible()
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

		await expect(page.getByRole('button', { name: /Queue upload/i })).toBeDisabled()
		await expect(page.getByText('No files or folders selected.')).toBeVisible()
	})

	test('queueing a mobile upload exposes the queued file in Transfers', async ({ page }) => {
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
	})
})
