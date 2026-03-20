import { expect, test } from '@playwright/test'

import { installUploadsMobileResponsiveFixtures, seedUploadsMobileResponsiveStorage } from './support/uploadsMobileResponsive'
import { expectLocatorWithinViewport, expectNoPageHorizontalOverflow } from './support/mobileResponsive'

test.describe('@mobile-responsive Uploads mobile responsive draft', () => {
	test.beforeEach(async ({ page }) => {
		await installUploadsMobileResponsiveFixtures(page)
		await seedUploadsMobileResponsiveStorage(page)
	})

	test('avoids page-level horizontal overflow on narrow mobile widths', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 568 })
		await page.goto('/uploads')

		await expect(page.getByRole('heading', { name: 'Uploads' })).toBeVisible()
		await expect(page.getByRole('combobox', { name: 'Bucket' })).toBeVisible()
		await expectNoPageHorizontalOverflow(page)
	})

	test('opens the upload source sheet within the mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/uploads')

		await page.getByRole('button', { name: 'Add from device…' }).click()
		const sheet = page.getByRole('dialog', { name: 'Add upload source' })
		await expect(sheet).toBeVisible()
		await expectLocatorWithinViewport(sheet)
	})

	test('stacks header actions after file selection on narrow widths', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 568 })
		await page.goto('/uploads')

		await page.getByRole('button', { name: 'Add from device…' }).click()
		const chooserPromise = page.waitForEvent('filechooser')
		await page.getByRole('button', { name: 'Choose files' }).click()
		const chooser = await chooserPromise
		await chooser.setFiles({
			name: 'alpha.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('alpha'),
		})

		const queueButton = page.getByRole('button', { name: /Queue upload \(1\)/i })
		const transfersButton = page.getByRole('button', { name: 'Open Transfers' })
		const clearButton = page.getByRole('button', { name: 'Clear selection' })

		await expect(queueButton).toBeVisible()
		await expect(transfersButton).toBeVisible()
		await expect(clearButton).toBeVisible()

		const queueBox = await queueButton.boundingBox()
		const transfersBox = await transfersButton.boundingBox()
		const clearBox = await clearButton.boundingBox()

		expect(transfersBox?.y ?? 0).toBeGreaterThan((queueBox?.y ?? 0) + (queueBox?.height ?? 0) - 1)
		expect(clearBox?.y ?? 0).toBeGreaterThan((transfersBox?.y ?? 0) + (transfersBox?.height ?? 0) - 1)
		await expectNoPageHorizontalOverflow(page)
	})

	test('opens transfers drawer from the uploads header on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/uploads')

		await page.getByRole('button', { name: 'Open Transfers' }).click()
		const drawer = page.getByRole('dialog', { name: /Transfers/i })
		await expect(drawer).toBeVisible()
		await expectLocatorWithinViewport(drawer)
	})
})
