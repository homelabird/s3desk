import { expect, test, type Page } from '@playwright/test'

type StorageSeed = {
	objectsUIMode: 'simple' | 'advanced'
	apiToken: string
	profileId: string | null
}

const defaultStorage: StorageSeed = {
	objectsUIMode: 'advanced',
	apiToken: 'change-me',
	profileId: 'playwright-smoke',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('objectsUIMode', JSON.stringify(seed.objectsUIMode))
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
	}, storage)
}

async function getToolbarMoreButton(page: Page) {
	const byTestId = page.getByTestId('objects-toolbar-more')
	if (await byTestId.count()) return byTestId.first()
	return page.getByRole('button', { name: /More|Actions/i }).first()
}

test.describe('Objects page smoke', () => {
	test('simple mode hides advanced controls', async ({ page }) => {
		await seedStorage(page, { objectsUIMode: 'simple' })
		await page.goto('/objects')

		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await expect(page.getByLabel('Go to path')).toHaveCount(0)

		const moreButton = await getToolbarMoreButton(page)
		await moreButton.scrollIntoViewIfNeeded()
		await moreButton.click({ force: true })
		await expect(page.getByRole('menuitem', { name: /Advanced tools/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Global search/i })).toHaveCount(0)
	})

	test('advanced mode shows advanced controls', async ({ page }) => {
		await seedStorage(page, { objectsUIMode: 'advanced' })
		await page.goto('/objects')

		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await expect(page.getByLabel('Go to path')).toBeVisible()

		const moreButton = await getToolbarMoreButton(page)
		await moreButton.scrollIntoViewIfNeeded()
		await moreButton.click({ force: true })
		await expect(page.getByRole('menuitem', { name: /Basic view/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Global search/i })).toBeVisible()
	})
})
