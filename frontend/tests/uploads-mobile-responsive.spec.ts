import { expect, test } from '@playwright/test'

import { installUploadsMobileResponsiveFixtures, seedUploadsMobileResponsiveStorage } from './support/uploadsMobileResponsive'
import { expectMinTouchTarget } from './support/geometry'
import { readProfileScopedLocalStorage } from './support/storage'
import { addUploadSourceFromDevice, dialogByName, gotoUploadsPage, openTransfersUploadRow, queueSelectedUpload } from './support/ui'

test.describe('@mobile-responsive Uploads mobile workflows', () => {
	test.beforeEach(async ({ page }) => {
		await installUploadsMobileResponsiveFixtures(page)
		await seedUploadsMobileResponsiveStorage(page)
	})

	test('bucket loading is announced before destination choices are ready', async ({ page }) => {
		let releaseBuckets!: () => void
		const bucketsReady = new Promise<void>((resolve) => { releaseBuckets = resolve })
		await page.route('**/api/v1/buckets', async (route) => {
			await bucketsReady
			await route.fallback()
		})
		await gotoUploadsPage(page)
		await expect(page.getByRole('status', { name: 'Loading buckets' })).toBeVisible()
		await expect(page.getByLabel('Bucket', { exact: true })).toBeDisabled()

		releaseBuckets()
		await expect(page.getByRole('status', { name: 'Loading buckets' })).toHaveCount(0)
		await page.getByLabel('Bucket', { exact: true }).fill('')
		await expect(page.getByRole('button', { name: /Add from device/i })).toBeDisabled()
		await page.getByLabel('Bucket', { exact: true }).fill('uploads-mobile-bucket')
		await expect(page.getByRole('button', { name: /Add from device/i })).toBeEnabled()
	})

	test('destination and queue controls precede long source previews on narrow screens', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 740 })
		await gotoUploadsPage(page)
		const destinationHeading = page.getByRole('heading', { name: 'Destination', exact: true })
		const selectionHeading = page.getByRole('heading', { name: 'Selection', exact: true })
		const destinationBox = await destinationHeading.boundingBox() // e2e-geometry-allow verifies prerequisite fields precede source selection
		const selectionBox = await selectionHeading.boundingBox() // e2e-geometry-allow compares workflow section order
		expect(destinationBox!.y).toBeLessThan(selectionBox!.y)

		const prefix = 'archive/' + 'long-destination-segment/'.repeat(9)
		await page.getByLabel('Upload prefix (optional)').fill(prefix)
		const names = Array.from({ length: 6 }, (_, index) => `${index + 1}-${'very-long-filename-'.repeat(9)}.txt`)
		await addUploadSourceFromDevice(page, names.map((name) => ({ name, mimeType: 'text/plain', buffer: Buffer.from('alpha') })))

		const queueButton = page.getByRole('button', { name: 'Queue upload (6)' })
		await expect(queueButton).toBeEnabled()
		const queueBox = await queueButton.boundingBox() // e2e-geometry-allow keeps queue action ahead of lengthy file previews
		const firstPreviewBox = await page.getByText(names[0], { exact: true }).boundingBox() // e2e-geometry-allow compares action and preview positions
		expect(queueBox!.y + queueBox!.height).toBeLessThan(firstPreviewBox!.y)

		for (const button of [queueButton, page.getByRole('button', { name: 'Open Transfers', exact: true }), page.getByRole('button', { name: 'Clear selection' })]) {
			await expectMinTouchTarget(button)
			const box = await button.boundingBox() // e2e-geometry-allow verifies full-width narrow-screen actions remain within the viewport
			expect(box!.width).toBeGreaterThanOrEqual(260)
			expect(box!.x + box!.width).toBeLessThanOrEqual(320)
		}
		await expect(page.getByText(`s3://uploads-mobile-bucket/${prefix.replace(/\/+$/, '')}`, { exact: true })).toBeVisible()
		await expect(page.getByText(names[5], { exact: true })).toBeVisible()
		await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true) // e2e-geometry-allow checks long target and file names do not introduce horizontal scrolling
	})

	test('upload destination prefix persists across a mobile reload', async ({ page }) => {
		await gotoUploadsPage(page)

		await expect(page.getByRole('button', { name: /^Queue upload/ })).toHaveCount(0)
		await expectMinTouchTarget(page.getByRole('button', { name: /Add from device/i }))
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

	test('selected files can be cleared beside the mobile upload destination', async ({ page }) => {
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
		await expect(page.getByText('Add files or a folder first.')).toHaveCount(0)
	})

	test('a whitespace-only bucket keeps the selected upload staged', async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoUploadsPage(page)
		await addUploadSourceFromDevice(page, {
			name: 'keep-selection.txt', mimeType: 'text/plain', buffer: Buffer.from('keep'),
		})
		const bucket = page.getByRole('combobox', { name: 'Bucket', exact: true })
		await bucket.fill('   ')
		await page.screenshot({ path: testInfo.outputPath('uploads-whitespace-bucket.png') })
		await expect(bucket).toHaveValue('   ')
		await expect(page.getByRole('button', { name: 'Queue upload (1)', exact: true })).toBeDisabled()
		await expect(page.getByRole('button', { name: /Replace selection/i })).toBeDisabled()
		await expect(page.getByText('keep-selection.txt', { exact: true })).toBeVisible()
		await bucket.fill(' uploads-mobile-bucket ')
		await expect(bucket).toHaveValue(' uploads-mobile-bucket ')
		await expect(page.getByRole('button', { name: 'Queue upload (1)', exact: true })).toBeEnabled()
		await expect(page.getByText('keep-selection.txt', { exact: true })).toBeVisible()
	})

	test('the upload destination matches the normalized request without changing the input', async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 })
		const requests: Array<Record<string, unknown>> = []
		await page.route('**/api/v1/uploads', async route => {
			requests.push(route.request().postDataJSON() as Record<string, unknown>)
			await route.fulfill({
				status: 400, contentType: 'application/json',
				body: JSON.stringify({ error: { code: 'test_complete', message: 'Destination request captured' } }),
			})
		})
		await gotoUploadsPage(page)
		const bucket = page.getByRole('combobox', { name: 'Bucket', exact: true })
		const prefix = page.getByLabel('Upload prefix (optional)')
		const rawPrefix = ' /incoming\\photos/../reports/./2026/ '
		await bucket.fill(' uploads-mobile-bucket ')
		await prefix.fill(rawPrefix)
		await addUploadSourceFromDevice(page, {
			name: 'destination.txt', mimeType: 'text/plain', buffer: Buffer.from('target'),
		})
		await page.screenshot({ path: testInfo.outputPath('uploads-normalized-destination.png') })
		await expect(page.getByText('s3://uploads-mobile-bucket/incoming/reports/2026', { exact: true })).toBeVisible()
		await expect(bucket).toHaveValue(' uploads-mobile-bucket ')
		await expect(prefix).toHaveValue(rawPrefix)
		await queueSelectedUpload(page, { count: 1 })
		await expect.poll(() => requests.at(-1)).toMatchObject({ bucket: 'uploads-mobile-bucket', prefix: 'incoming/reports/2026' })
	})

	test('queueing a mobile upload exposes the queued file in Transfers', async ({ page }) => {
		test.setTimeout(45_000)
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
