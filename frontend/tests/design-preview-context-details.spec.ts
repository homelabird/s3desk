import { expect, test, type Page } from '@playwright/test'

import {
	installObjectsMobileResponsiveFixtures,
	seedObjectsMobileResponsiveStorage,
} from './support/objectsMobileResponsive'
import { dialogByName, gotoObjectsPage, objectsContextMenu, objectsListRow, objectsSelectionCheckbox } from './support/ui'

const bucket = 'objects-mobile-bucket'

async function openContextAction(page: Page, key: string, action: string) {
	await objectsListRow(page, key).click({ button: 'right' })
	const menu = objectsContextMenu(page)
	await expect(menu).toBeVisible()
	await menu.getByRole('menuitem', { name: action }).click()
}

test.beforeEach(async ({ page }) => {
	await installObjectsMobileResponsiveFixtures(page)
	await seedObjectsMobileResponsiveStorage(page)
})

for (const width of [390, 1280]) {
	test('large preview metadata failures can recover at ' + width + 'px', async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 })
		let failing = true
		let failedResponses = 0
		await page.route('**/api/v1/buckets/' + bucket + '/objects/meta?**', async (route) => {
			if (!failing || new URL(route.request().url()).searchParams.get('key') !== 'preview.png') return route.fallback()
			await route.fulfill({ status: 403, json: { error: { code: 'forbidden', message: 'Preview metadata denied' } } })
			failedResponses += 1
		})
		await gotoObjectsPage(page)
		await openContextAction(page, 'preview.png', 'Open large preview')
		const viewer = dialogByName(page, /Large preview/)
		await expect(viewer).toBeVisible()
		await expect.poll(() => failedResponses).toBeGreaterThan(0)
		await expect(viewer.getByRole('status', { name: 'Loading preview metadata' })).toHaveCount(0)
		await page.screenshot({ path: testInfo.outputPath('large-preview-metadata-error.png'), animations: 'disabled' })

		await expect(viewer.getByRole('alert')).toContainText('Preview metadata denied')
		await expect(viewer.getByRole('status', { name: 'Preview loading' })).toHaveCount(0)
		await expect(viewer.getByText('preview.png', { exact: true })).toBeVisible()
		const retry = viewer.getByRole('button', { name: 'Retry metadata', exact: true })
		await expect(retry).toBeEnabled()
		await expect(retry).toBeInViewport({ ratio: 1 })
		failing = false
		await retry.click()
		await expect(viewer.getByTestId('objects-image-viewer-image')).toBeVisible()
		await expect(viewer.getByRole('alert')).toHaveCount(0)
		await expect(viewer.getByRole('status', { name: 'Preview loading' })).toHaveCount(0)
		await page.screenshot({ path: testInfo.outputPath('large-preview-recovered.png'), animations: 'disabled' })
	})
}

for (const shortcut of ['ContextMenu', 'Shift+F10']) {
	test('Escape returns from ' + shortcut + ' to the object list', async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 1280, height: 900 })
		await gotoObjectsPage(page)
		const list = page.getByRole('list', { name: 'Objects list', exact: true })
		await list.focus()
		await page.keyboard.press('ArrowDown')
		await expect(objectsSelectionCheckbox(page, 'alpha.txt')).toBeChecked()
		await page.keyboard.press(shortcut)
		const menu = objectsContextMenu(page)
		await expect(menu).toBeVisible()
		await expect(menu.getByRole('menuitem').filter({ hasText: /Copy.*Ctrl\/Cmd\+C/ })).toBeFocused()
		await page.keyboard.press('Escape')
		await expect(menu).toBeHidden()
		await expect(objectsSelectionCheckbox(page, 'alpha.txt')).toBeChecked()
		await page.screenshot({ path: testInfo.outputPath('context-menu-escape.png'), animations: 'disabled' })
		await expect(list).toBeFocused()
		await page.keyboard.press('ArrowDown')
		await expect(objectsSelectionCheckbox(page, 'preview.png')).toBeChecked()
		await page.keyboard.press('F2')
		await expect(dialogByName(page, 'Rename object…')).toBeVisible()
	})
}

test('object Copy and Move buttons match destination and exact confirmation rules', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 900 })
	let jobsCreated = 0
	await page.route('**/api/v1/jobs', async (route) => {
		if (route.request().method() !== 'POST') return route.fallback()
		jobsCreated += 1
		await route.fulfill({ status: 403, json: { error: { code: 'forbidden', message: 'Invalid form must not create a job' } } })
	})
	await gotoObjectsPage(page)
	for (const mode of ['copy', 'move'] as const) {
		await openContextAction(page, 'alpha.txt', mode === 'copy' ? 'Copy…' : 'Move/Rename…')
		const dialog = dialogByName(page, mode === 'copy' ? 'Copy object…' : 'Move/Rename object…')
		const submit = dialog.getByRole('button', { name: mode === 'copy' ? 'Start copy' : 'Start move', exact: true })
		const destinationBucket = dialog.getByRole('combobox', { name: 'Destination bucket', exact: true })
		const destinationKey = dialog.getByRole('textbox', { name: 'Destination key', exact: true })
		await expect(dialog).toBeVisible()
		await page.screenshot({ path: testInfo.outputPath('object-' + mode + '-initial.png'), animations: 'disabled' })
		await expect(submit).toBeDisabled()
		const disabledBackground = await submit.evaluate(button => getComputedStyle(button).backgroundColor)
		await destinationKey.press('Enter')
		await expect(dialog).toBeVisible()

		await destinationKey.fill('archive/alpha.txt')
		if (mode === 'move') {
			const confirm = dialog.getByRole('textbox', { name: 'Type "MOVE" to confirm', exact: true })
			for (const value of ['', 'move', 'MOVE ']) {
				await confirm.fill(value)
				await expect(submit).toBeDisabled()
				await confirm.press('Enter')
				await expect(dialog).toBeVisible()
			}
			await confirm.fill('MOVE')
		}
		await expect(submit).toBeEnabled()
		await expect.poll(() => submit.evaluate(button => getComputedStyle(button).backgroundColor)).not.toBe(disabledBackground)
		await destinationBucket.fill(' ')
		await expect(submit).toBeDisabled()
		await destinationKey.press('Enter')
		await destinationBucket.fill(' ' + bucket + ' ')
		for (const value of [' ', 'archive/*.txt', ' /alpha.txt ']) {
			await destinationKey.fill(value)
			await expect(submit).toBeDisabled()
			await destinationKey.press('Enter')
			await expect(dialog).toBeVisible()
		}
		await destinationKey.fill(' /archive/alpha.txt ')
		await expect(submit).toBeEnabled()

		if (mode === 'move') {
			const confirm = dialog.getByRole('textbox', { name: 'Type "MOVE" to confirm', exact: true })
			await confirm.fill('move')
			await dialog.getByRole('switch', { name: 'Dry run', exact: true }).click()
			await expect(submit).toBeEnabled()
			await destinationKey.fill('alpha.txt')
			await expect(submit).toBeDisabled()
			await destinationKey.press('Enter')
			await destinationKey.fill('archive/alpha.txt')
			await dialog.getByRole('switch', { name: 'Dry run', exact: true }).click()
			await expect(submit).toBeDisabled()
			await confirm.fill('MOVE')
			await expect(submit).toBeEnabled()
		}
		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	}
	expect(jobsCreated).toBe(0)
})

test('folder Copy and Move reject empty, same, and nested destinations', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 900 })
	await page.route('**/objects/index-summary**', (route) => route.fulfill({
		json: { bucket, prefix: 'reports/', objectCount: 3, totalBytes: 6144, indexedAt: '2024-01-01T00:00:00Z', sampleKeys: [] },
	}))
	let jobsCreated = 0
	await page.route('**/api/v1/jobs', async (route) => {
		if (route.request().method() !== 'POST') return route.fallback()
		jobsCreated += 1
		await route.fulfill({ status: 403, json: { error: { code: 'forbidden', message: 'Invalid form must not create a job' } } })
	})
	await gotoObjectsPage(page)
	for (const mode of ['copy', 'move'] as const) {
		await openContextAction(page, 'reports/', mode === 'copy' ? 'Copy folder…' : 'Move folder…')
		const dialog = dialogByName(page, mode === 'copy' ? 'Copy folder…' : 'Move folder…')
		const submit = dialog.getByRole('button', { name: mode === 'copy' ? 'Start copy' : 'Start move', exact: true })
		const destinationBucket = dialog.getByRole('combobox', { name: 'Destination bucket', exact: true })
		const destinationFolder = dialog.getByRole('textbox', { name: 'Destination folder', exact: true })
		await expect(dialog).toBeVisible()
		await expect(dialog.getByText('Objects', { exact: true })).toBeVisible()
		await destinationFolder.fill('')
		await page.screenshot({ path: testInfo.outputPath('folder-' + mode + '-empty-destination.png'), animations: 'disabled' })
		await expect(submit).toBeDisabled()
		const disabledBackground = await submit.evaluate(button => getComputedStyle(button).backgroundColor)
		await destinationFolder.press('Enter')
		await expect(dialog).toBeVisible()

		await destinationFolder.fill(' archive ')
		if (mode === 'move') {
			const confirm = dialog.getByRole('textbox', { name: 'Type "MOVE" to confirm', exact: true })
			for (const value of ['', 'move', 'MOVE ']) {
				await confirm.fill(value)
				await expect(submit).toBeDisabled()
				await confirm.press('Enter')
				await expect(dialog).toBeVisible()
			}
			await confirm.fill('MOVE')
		}
		await expect(submit).toBeEnabled()
		await expect.poll(() => submit.evaluate(button => getComputedStyle(button).backgroundColor)).not.toBe(disabledBackground)
		await destinationBucket.fill(' ')
		await expect(submit).toBeDisabled()
		await destinationFolder.press('Enter')
		await destinationBucket.fill(' ' + bucket + ' ')
		for (const value of [' ', 'archive/*', ' reports ', 'reports/nested/']) {
			await destinationFolder.fill(value)
			await expect(submit).toBeDisabled()
			await destinationFolder.press('Enter')
			await expect(dialog).toBeVisible()
		}
		await destinationBucket.fill('other-bucket')
		await expect(submit).toBeEnabled()
		await destinationBucket.fill(bucket)
		await destinationFolder.fill(' archive ')
		await expect(submit).toBeEnabled()
		if (mode === 'move') {
			const confirm = dialog.getByRole('textbox', { name: 'Type "MOVE" to confirm', exact: true })
			await confirm.fill('move')
			await dialog.getByRole('switch', { name: 'Dry run', exact: true }).click()
			await expect(submit).toBeEnabled()
			await destinationFolder.fill('reports/nested/')
			await expect(submit).toBeDisabled()
			await destinationFolder.press('Enter')
			await destinationFolder.fill('archive/')
			await dialog.getByRole('switch', { name: 'Dry run', exact: true }).click()
			await expect(submit).toBeDisabled()
			await confirm.fill('MOVE')
			await expect(submit).toBeEnabled()
		}
		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
	}
	expect(jobsCreated).toBe(0)
})
