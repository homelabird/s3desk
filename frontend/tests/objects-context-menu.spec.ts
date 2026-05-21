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
import {
	OBJECTS_LIST_ROW_SELECTOR,
	gotoObjectsPage,
	objectsContextMenu,
	objectsListRow,
	objectsListRows,
	objectsSelectionCheckbox,
} from './support/ui'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
	objectsUIMode: 'simple' | 'advanced'
}

type ObjectItem = {
	key: string
	size: number
	lastModified: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	profileId: 'playwright-profile',
	bucket: 'test-bucket',
	objectsUIMode: 'advanced',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, {
		...defaultStorage,
		prefix: '',
		...overrides,
	})
}

function buildObjectItems(count: number): ObjectItem[] {
	const start = Date.parse('2024-01-01T00:00:00Z')
	return Array.from({ length: count }, (_, index) => ({
		key: `video-${index + 1}.mp4`,
		size: 1024 * (index + 1),
		lastModified: new Date(start + index * 1000).toISOString(),
	}))
}

async function stubObjectsApi(page: Page, items: ObjectItem[]) {
	const now = '2024-01-01T00:00:00Z'
	const { bucket, profileId } = defaultStorage

	await installMockApi(page, [
		{
			method: 'GET',
			path: '/events',
			handle: ({ text }) => text('', 200, 'text/event-stream'),
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
		{
			method: 'GET',
			path: `/buckets/${bucket}/objects/meta`,
			handle: ({ url, json }) => {
				const key = url.searchParams.get('key') ?? ''
				const item = items.find((entry) => entry.key === key)
				if (!item) {
					return json({ error: { code: 'not_found', message: 'object not found' } }, 404)
				}
				return json({
					key: item.key,
					size: item.size,
					etag: `"${item.key}"`,
					lastModified: item.lastModified,
					contentType: 'video/mp4',
					metadata: { suite: 'objects-context-menu' },
				})
			},
		},
	])
}

test.describe('Objects context menus', () => {
	test('list menu still launches a real action in a short viewport', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(12))
		await seedStorage(page)
		await page.setViewportSize({ width: 780, height: 240 })
		await gotoObjectsPage(page)

		await expect(page.getByTestId('objects-upload-dropzone')).toBeVisible()
		await expect(objectsListRows(page).first()).toBeVisible()

		try {
			await page.evaluate((rowSelector) => {
				document.querySelectorAll<HTMLElement>(rowSelector).forEach((el) => {
					el.style.pointerEvents = 'none'
				})
			}, OBJECTS_LIST_ROW_SELECTOR)

			const scroller = page.locator('[data-testid="objects-upload-dropzone"] [class*="_listScroller"]')
			await scroller.scrollIntoViewIfNeeded()
			await expect(scroller).toBeVisible()

			const menu = objectsContextMenu(page)
			const newFolderItem = menu.getByRole('menuitem', { name: 'New folder…' })
			await expect(async () => {
				await scroller.click({ button: 'right', position: { x: 12, y: 12 } })
				await expect(menu).toBeVisible({ timeout: 1_000 })
			}).toPass({ timeout: 10_000 })
			await newFolderItem.evaluate((element) => {
				;(element as HTMLElement).click()
			})
			const dialog = page.getByRole('dialog', { name: 'New folder' })
			await expect(dialog).toBeVisible()
			await expect(dialog.getByLabel('Folder name')).toBeVisible()
		} finally {
			if (!page.isClosed()) {
				await page.evaluate((rowSelector) => {
					document.querySelectorAll<HTMLElement>(rowSelector).forEach((el) => {
						el.style.pointerEvents = ''
					})
				}, OBJECTS_LIST_ROW_SELECTOR)
			}
		}
	})

	test('near-bottom object menu still opens details in a constrained desktop viewport', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(12))
		await seedStorage(page)
		await page.setViewportSize({ width: 780, height: 360 })
		await gotoObjectsPage(page)

		const rows = objectsListRows(page)
		await expect(rows.first()).toBeVisible()
		const scroller = page.locator('[data-testid="objects-upload-dropzone"] [class*="_listScroller"]')
		await expect(scroller).toBeVisible()
		await scroller.evaluate((element) => {
			element.scrollTop = element.scrollHeight
		})

		const target = objectsListRow(page, 'video-12.mp4')
		await expect(target).toBeVisible()
		await target.scrollIntoViewIfNeeded()
		const menuTrigger = target.getByRole('button', { name: /Object actions for video-12\.mp4/ })
		await expect(menuTrigger).toBeVisible()

		const menu = page
			.getByRole('menu')
			.filter({ has: page.getByRole('menuitem', { name: 'Download (client)' }) })
			.last()
		const detailsItem = menu.getByRole('menuitem', { name: 'Details' })
		await expect(async () => {
			if (!(await menu.isVisible().catch(() => false))) {
				await menuTrigger.evaluate((element) => {
					;(element as HTMLElement).click()
				})
			}
			await expect(detailsItem).toBeVisible({ timeout: 1_000 })
			await detailsItem.evaluate((element) => {
				;(element as HTMLElement).click()
			})
		}).toPass({ timeout: 15_000 })

		const drawer = page.getByTestId('objects-details-sheet')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByRole('heading', { name: 'Details' })).toBeVisible()
		await expect(drawer.getByRole('button', { name: 'Copy key' })).toBeVisible()
		await expect(drawer.getByRole('button', { name: 'Download (client)' })).toBeVisible()
		await drawer.getByRole('button', { name: 'Close', exact: true }).click()
		await expect(drawer).toHaveCount(0)
	})

	test('mobile object menu still opens details while the selection bar is visible', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(3))
		await seedStorage(page)
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoObjectsPage(page)

		const row = objectsListRow(page, 'video-1.mp4')
		await expect(row).toBeVisible()
		await objectsSelectionCheckbox(page, 'video-1.mp4').click()
		await expect(page.getByText('1 selected')).toBeVisible()

		await row.getByRole('button', { name: /Object actions/ }).evaluate((element) => {
			;(element as HTMLElement).click()
		})

		const menu = page
			.getByRole('menu')
			.filter({ has: page.getByRole('menuitem', { name: 'Download (client)' }) })
			.last()
		await expect(menu).toBeVisible()

		await menu.getByRole('menuitem', { name: 'Details' }).click()
		const drawer = page.getByTestId('objects-details-sheet')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByRole('heading', { name: 'Details' })).toBeVisible()
		await expect(drawer.getByRole('cell', { name: 'video-1.mp4', exact: true })).toBeVisible()
		await drawer.getByRole('button', { name: 'Close', exact: true }).click()
		await expect(drawer).toHaveCount(0)
	})

	test('right-clicking a selected object keeps the bulk selection and opens selection actions', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(3))
		await seedStorage(page)
		await gotoObjectsPage(page)

		await objectsSelectionCheckbox(page, 'video-1.mp4').click()
		await objectsSelectionCheckbox(page, 'video-2.mp4').click()
		await expect(page.getByText('2 selected')).toBeVisible()

		const selectedRow = objectsListRow(page, 'video-1.mp4')
		await selectedRow.click({ button: 'right' })

		const menu = objectsContextMenu(page)
		await expect(menu).toBeVisible()
		await expect(page.getByText('2 selected')).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'video-1.mp4')).toBeChecked()
		await expect(objectsSelectionCheckbox(page, 'video-2.mp4')).toBeChecked()
		await expect(menu.getByRole('menuitem', { name: 'Move selection to…' })).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: 'Details' })).toHaveCount(0)
	})

	test('right-clicking an unselected object retargets selection before opening object actions', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(3))
		await seedStorage(page)
		await gotoObjectsPage(page)

		await objectsSelectionCheckbox(page, 'video-1.mp4').click()
		await objectsSelectionCheckbox(page, 'video-2.mp4').click()
		await expect(page.getByText('2 selected')).toBeVisible()

		const targetRow = objectsListRow(page, 'video-3.mp4')
		await targetRow.click({ button: 'right' })

		const menu = objectsContextMenu(page)
		await expect(menu).toBeVisible()
		await expect(page.getByText('1 selected')).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'video-1.mp4')).not.toBeChecked()
		await expect(objectsSelectionCheckbox(page, 'video-2.mp4')).not.toBeChecked()
		await expect(objectsSelectionCheckbox(page, 'video-3.mp4')).toBeChecked()
		await expect(menu.getByRole('menuitem', { name: 'Details' })).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: 'Move selection to…' })).toHaveCount(0)
	})
})
