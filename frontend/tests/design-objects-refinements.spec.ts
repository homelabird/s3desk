import { expect, test, type Page } from '@playwright/test'

import {
	installObjectsMobileResponsiveFixtures,
	seedObjectsMobileResponsiveStorage,
} from './support/objectsMobileResponsive'
import { dialogByName, gotoObjectsPage, objectsListRow, objectsSelectionCheckbox } from './support/ui'

const longKey =
	'reports/mobile/a-very-long-object-key-that-should-wrap-on-mobile-without-causing-horizontal-overflow-or-clipped-actions.log'

async function openObjectAction(page: Page, key: string, action: string) {
	const row = objectsListRow(page, key)
	await expect(row).toBeVisible()
	await row.getByRole('button', { name: /Object actions/ }).click()
	const menu = page.getByRole('menu').filter({ has: page.getByRole('menuitem', { name: action }) }).last()
	await expect(menu).toBeVisible()
	await menu.getByRole('menuitem', { name: action }).click()
}

test.describe('Objects detail refinements', () => {
	test.beforeEach(async ({ page }) => {
		await installObjectsMobileResponsiveFixtures(page)
	})

	test('mobile metadata loading and failure retain the selected object key before actions', async ({ page }, testInfo) => {
		await seedObjectsMobileResponsiveStorage(page)
		await page.setViewportSize({ width: 320, height: 844 })
		let releaseMetadata: () => void = () => {}
		const metadataGate = new Promise<void>((resolve) => {
			releaseMetadata = resolve
		})
		let recoverMetadata = false
		await page.route('**/api/v1/buckets/objects-mobile-bucket/objects/meta?**', async (route) => {
			if (recoverMetadata) return route.fallback()
			await metadataGate
			await route.fulfill({
				status: 503,
				contentType: 'application/json',
				body: JSON.stringify({ error: { code: 'unavailable', message: 'Metadata temporarily unavailable' } }),
			})
		})

		try {
			await gotoObjectsPage(page)
			await openObjectAction(page, longKey, 'Details')
			const drawer = page.getByTestId('objects-details-sheet')
			const target = drawer.getByTestId('objects-details-target')
			await expect(drawer).toBeVisible()
			await expect(target.getByText(longKey, { exact: true })).toBeVisible()
			await expect(drawer.getByRole('status', { name: 'Loading object metadata' })).toBeVisible()
			expect(await drawer.evaluate((element) => {
				const target = element.querySelector('[data-testid="objects-details-target"]')!
				const actions = element.querySelector('[data-testid="objects-details-action-row"]')!
				return Boolean(target.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING)
			})).toBe(true)
			await page.screenshot({ path: testInfo.outputPath('objects-details-loading-320.png'), fullPage: true })

			releaseMetadata()
			await expect(drawer.getByRole('alert')).toContainText('Metadata temporarily unavailable')
			await expect(target.getByText(longKey, { exact: true })).toBeVisible()
			await expect(drawer.getByRole('button', { name: 'Copy key' })).toBeEnabled()
			await expect(drawer.getByRole('status', { name: 'Loading object metadata' })).toHaveCount(0)
			await page.screenshot({ path: testInfo.outputPath('objects-details-error-320.png'), fullPage: true })

			recoverMetadata = true
			await drawer.getByRole('button', { name: 'Retry', exact: true }).click()
			await expect(drawer.getByText('Content Type', { exact: true })).toBeVisible()
			await expect(target).toHaveCount(0)
			await expect(drawer.getByText(longKey, { exact: true })).toHaveCount(1)
		} finally {
			releaseMetadata()
		}
	})

	test('rename becomes available only after an exact confirmation', async ({ page }) => {
		await seedObjectsMobileResponsiveStorage(page)
		await gotoObjectsPage(page)
		await openObjectAction(page, 'alpha.txt', 'Rename (F2)…')
		const dialog = dialogByName(page, 'Rename object…')
		const submit = dialog.getByRole('button', { name: 'Rename', exact: true })
		const confirmation = dialog.getByRole('textbox', { name: 'Type "RENAME" to confirm', exact: true })
		await expect(dialog).toBeVisible()
		await dialog.getByRole('textbox', { name: 'New name', exact: true }).fill('renamed.txt')
		await expect(submit).toBeDisabled()
		for (const value of ['rename', 'RENAME ']) {
			await confirmation.fill(value)
			await expect(submit).toBeDisabled()
			await confirmation.press('Enter')
			await expect(dialog).toBeVisible()
		}
		await confirmation.fill('RENAME')
		await expect(submit).toBeEnabled()
		await dialog.getByRole('textbox', { name: 'New name', exact: true }).fill(' ')
		await expect(submit).toBeDisabled()
	})

	test('mobile move requires a destination and exact confirmation while the root folder remains valid', async ({ page }, testInfo) => {
		await seedObjectsMobileResponsiveStorage(page, { objectsUIMode: 'simple' })
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoObjectsPage(page)
		await objectsSelectionCheckbox(page, 'alpha.txt').click()
		await page.getByRole('button', { name: 'Move to…', exact: true }).click()
		const sheet = page.getByTestId('objects-move-selection-sheet')
		const submit = sheet.getByRole('button', { name: 'Start move', exact: true })
		const confirmation = sheet.getByRole('textbox', { name: 'Type "MOVE" to confirm', exact: true })
		const destinationBucket = sheet.getByLabel('Destination bucket', { exact: true })
		await expect(sheet).toBeVisible()
		await expect(submit).toBeDisabled()
		for (const value of ['move', 'MOVE ']) {
			await confirmation.fill(value)
			await expect(submit).toBeDisabled()
			await confirmation.press('Enter')
			await expect(sheet).toBeVisible()
		}
		await confirmation.fill('MOVE')
		await destinationBucket.fill(' ')
		await expect(submit).toBeDisabled()
		await destinationBucket.fill('archive-bucket')
		await expect(sheet.getByRole('textbox', { name: 'Destination folder', exact: true })).toHaveValue('')
		await expect(submit).toBeEnabled()
		await page.screenshot({ path: testInfo.outputPath('objects-move-ready-mobile.png'), fullPage: true })
	})
})
