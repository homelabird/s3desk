import { expect, test } from '@playwright/test'

import {
	expectLocatorWithinViewport,
	expectNoPageHorizontalOverflow,
	installObjectsMobileResponsiveFixtures,
	seedObjectsMobileResponsiveStorage,
} from './support/objectsMobileResponsive'

test.describe('@mobile-responsive Objects mobile responsive draft', () => {
	test.beforeEach(async ({ page }) => {
		await installObjectsMobileResponsiveFixtures(page)
		await seedObjectsMobileResponsiveStorage(page)
	})

	test('avoids page-level horizontal overflow at 320px width', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 568 })
		await page.goto('/objects')

		await expect(page.getByTestId('objects-upload-dropzone')).toBeVisible()
		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await expectNoPageHorizontalOverflow(page)
	})

	test('opens the folders drawer within the mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/objects')

		await page.getByRole('button', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByTestId('objects-folders-pane')).toBeVisible()
		await expectLocatorWithinViewport(drawer)

		await drawer.getByRole('button', { name: 'Close' }).click()
		await expect(drawer).toHaveCount(0)
	})

	test('opens the details drawer from object actions within the mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/objects')

		const row = page.locator('[data-objects-row="true"]', { hasText: 'alpha.txt' }).first()
		await expect(row).toBeVisible()
		await row.getByRole('button', { name: 'Object actions' }).click()

		const menu = page
			.getByRole('menu')
			.filter({ has: page.getByRole('menuitem', { name: 'Details' }) })
			.last()
		await expect(menu).toBeVisible()
		await menu.getByRole('menuitem', { name: 'Details' }).click()

		const drawer = page.getByTestId('objects-details-sheet')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByText('Content Type')).toBeVisible()
		await expectLocatorWithinViewport(drawer)

		await drawer.getByRole('button', { name: 'Close' }).click()
		await expect(drawer).toHaveCount(0)
	})

	test('keeps global search viewport-safe and stacks result actions on narrow screens', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/objects')

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()

		const drawer = page.getByRole('dialog', { name: 'Global Search (Indexed)' })
		await expect(drawer).toBeVisible()
		await expectLocatorWithinViewport(drawer)

		await drawer.getByPlaceholder('Search query (substring)').fill('wrap')
		await expect(drawer.getByText('should-wrap-on-mobile')).toBeVisible()

		const openButton = drawer.getByRole('button', { name: 'Open' }).first()
		const copyButton = drawer.getByRole('button', { name: 'Copy key' }).first()
		const openBox = await openButton.boundingBox()
		const copyBox = await copyButton.boundingBox()

		expect(copyBox?.y ?? 0).toBeGreaterThanOrEqual((openBox?.y ?? 0) + (openBox?.height ?? 0) - 1)
		await expectNoPageHorizontalOverflow(page)
	})

	test('keeps the global search drawer inside the viewport at tablet width', async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 1024 })
		await page.goto('/objects')

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()

		const drawer = page.getByRole('dialog', { name: 'Global Search (Indexed)' })
		await expect(drawer).toBeVisible()
		await expectLocatorWithinViewport(drawer)
	})
})
