import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installMockApi,
	seedLocalStorage,
} from './support/apiFixtures'
import { objectsContextMenu } from './support/ui'

const profileId = 'playwright-context-keyboard-profile'
const bucket = 'context-keyboard-bucket'
const now = '2024-01-01T00:00:00Z'

const items = [
	{ key: 'video-1.mp4', size: 1024, lastModified: now, etag: '"video-1"' },
	{ key: 'video-2.mp4', size: 2048, lastModified: now, etag: '"video-2"' },
	{ key: 'video-3.mp4', size: 4096, lastModified: now, etag: '"video-3"' },
]

async function seedStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId,
		bucket,
		prefix: '',
		objectsUIMode: 'advanced',
	})
}

async function stubObjectsApi(page: Page) {
	await installMockApi(page, [
		{
			method: 'GET',
			path: '/events',
			handle: ({ text }) => text('forbidden', 403, 'text/plain'),
		},
		{
			method: 'GET',
			path: '/meta',
			handle: ({ json }) => json(buildMetaFixture()),
		},
		{
			method: 'GET',
			path: '/profiles',
			handle: ({ json }) =>
				json([
					buildProfileFixture({
						id: profileId,
						name: 'Context Keyboard Profile',
						createdAt: now,
						updatedAt: now,
					}),
				]),
		},
		{
			method: 'GET',
			path: '/buckets',
			handle: ({ json }) => json([buildBucketFixture(bucket, { createdAt: now })]),
		},
		{
			method: 'GET',
			path: `/buckets/${bucket}/objects`,
			handle: ({ json }) => json(buildObjectsListFixture({ bucket, items })),
		},
		{
			method: 'GET',
			path: `/buckets/${bucket}/objects/favorites`,
			handle: ({ json }) => json(buildFavoritesFixture({ bucket })),
		},
	])
}

async function createKeyboardRangeSelection(page: Page) {
	const list = page.getByRole('list', { name: 'Objects list' })
	await expect(list).toBeVisible()
	await list.focus()
	await list.press('ArrowDown')
	await expect(page.getByText('1 selected', { exact: true })).toBeVisible()
	await list.press('Shift+ArrowDown')
	await expect(page.getByText('2 selected', { exact: true })).toBeVisible()
	await expect(page.getByRole('checkbox', { name: 'Select video-1.mp4' })).toBeChecked()
	await expect(page.getByRole('checkbox', { name: 'Select video-2.mp4' })).toBeChecked()
	return list
}

test.describe('Objects context menu with keyboard selection', () => {
	test.beforeEach(async ({ page }) => {
		await stubObjectsApi(page)
		await seedStorage(page)
		await page.goto('/objects')
	})

	test('keyboard range selection still opens bulk context actions on a selected row', async ({ page }) => {
		await createKeyboardRangeSelection(page)

		const selectedRow = page.locator('[data-objects-row="true"]', { hasText: 'video-1.mp4' }).first()
		await selectedRow.click({ button: 'right' })

		const menu = objectsContextMenu(page)
		await expect(menu).toBeVisible()
		await expect(page.getByText('2 selected', { exact: true })).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: 'Move selection to…' })).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: 'Details' })).toHaveCount(0)
	})

	test('closing the context menu outside the list keeps the keyboard-created selection intact', async ({ page }) => {
		await createKeyboardRangeSelection(page)

		const selectedRow = page.locator('[data-objects-row="true"]', { hasText: 'video-1.mp4' }).first()
		await selectedRow.click({ button: 'right' })

		const menu = objectsContextMenu(page)
		await expect(menu).toBeVisible()

		await page.getByRole('heading', { name: 'Objects' }).click()

		await expect(menu).toBeHidden()
		await expect(page.getByText('2 selected', { exact: true })).toBeVisible()
		await expect(page.getByRole('checkbox', { name: 'Select video-1.mp4' })).toBeChecked()
		await expect(page.getByRole('checkbox', { name: 'Select video-2.mp4' })).toBeChecked()
	})

	test('pressing Escape closes the context menu without clearing the keyboard-created selection', async ({ page }) => {
		await createKeyboardRangeSelection(page)

		const selectedRow = page.locator('[data-objects-row="true"]', { hasText: 'video-1.mp4' }).first()
		await selectedRow.click({ button: 'right' })

		const menu = objectsContextMenu(page)
		await expect(menu).toBeVisible()

		await page.keyboard.press('Escape')

		await expect(menu).toBeHidden()
		await expect(page.getByText('2 selected', { exact: true })).toBeVisible()
		await expect(page.getByRole('checkbox', { name: 'Select video-1.mp4' })).toBeChecked()
		await expect(page.getByRole('checkbox', { name: 'Select video-2.mp4' })).toBeChecked()
	})

	test('a single keyboard-selected item still opens object actions from the row menu', async ({ page }) => {
		const list = page.getByRole('list', { name: 'Objects list' })
		await expect(list).toBeVisible()
		await list.focus()
		await list.press('ArrowDown')
		await expect(page.getByText('1 selected', { exact: true })).toBeVisible()

		const row = page.locator('[data-objects-row="true"]', { hasText: 'video-1.mp4' }).first()
		await row.getByRole('button', { name: 'Object actions' }).evaluate((element) => {
			;(element as HTMLElement).click()
		})

		const menu = page
			.getByRole('menu')
			.filter({ has: page.getByRole('menuitem', { name: 'Details' }) })
			.last()
		await expect(menu).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: 'Details' })).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: 'Rename (F2)…' })).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: 'Move selection to…' })).toHaveCount(0)
	})
})
