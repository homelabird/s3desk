import { expect, test, type Locator, type Page } from '@playwright/test'

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
	])
}

type MenuMetrics = {
	rect: {
		top: number
		left: number
		right: number
		bottom: number
		width: number
		height: number
	}
	viewport: { width: number; height: number; top: number; left: number; right: number; bottom: number }
}

async function getMenuMetrics(
	page: Page,
	menu: Locator,
	viewportSelector?: string,
): Promise<MenuMetrics | null> {
	if (!(await menu.count())) return null
	const rect = await menu.evaluate((el) => {
		const box = el.getBoundingClientRect()
		return {
			top: box.top,
			left: box.left,
			right: box.right,
			bottom: box.bottom,
			width: box.width,
			height: box.height,
		}
	})
	let viewport: MenuMetrics['viewport'] | null = null
	if (viewportSelector) {
		const viewportEl = page.locator(viewportSelector)
		if (await viewportEl.count()) {
			viewport = await viewportEl.evaluate((el) => {
				const box = el.getBoundingClientRect()
				return {
					top: box.top,
					left: box.left,
					right: box.right,
					bottom: box.bottom,
					width: box.width,
					height: box.height,
				}
			})
		}
	}
	if (!viewport) {
		const size = page.viewportSize()
		if (!size) return null
		viewport = {
			top: 0,
			left: 0,
			right: size.width,
			bottom: size.height,
			width: size.width,
			height: size.height,
		}
	}
	return { rect, viewport }
}

async function expectMenuInViewport(page: Page, menu: Locator, options?: { padding?: number; viewportSelector?: string }) {
	const deadline = Date.now() + 5000
	let latest: MenuMetrics | null = null
	const padding = options?.padding ?? 0
	const viewportSelector = options?.viewportSelector
	while (Date.now() < deadline) {
		latest = await getMenuMetrics(page, menu, viewportSelector)
		if (latest) {
			const { rect, viewport } = latest
			if (
				rect.top >= viewport.top - padding &&
				rect.left >= viewport.left - padding &&
				rect.right <= viewport.right + padding &&
				rect.bottom <= viewport.bottom + padding
			) {
				return latest
			}
		}
		await page.waitForTimeout(50)
	}
	if (!latest) {
		throw new Error('Menu metrics unavailable')
	}
	throw new Error(`Menu did not fit viewport: ${JSON.stringify(latest)}`)
}

test.describe('Objects context menus', () => {
	test('list menu caps height and enables scrolling', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(12))
		await seedStorage(page)
		await page.setViewportSize({ width: 780, height: 240 })
		await page.goto('/objects')

		await expect(page.getByTestId('objects-upload-dropzone')).toBeVisible()
		await expect(page.locator('[data-objects-row="true"]').first()).toBeVisible()

		try {
			await page.evaluate(() => {
				document.querySelectorAll<HTMLElement>('[data-objects-row="true"]').forEach((el) => {
					el.style.pointerEvents = 'none'
				})
			})

			const scroller = page.locator('[data-testid="objects-upload-dropzone"] [class*="_listScroller"]')
			await scroller.scrollIntoViewIfNeeded()
			const box = await scroller.boundingBox()
			if (!box) throw new Error('List scroller not found')
			await scroller.evaluate((el, point) => {
				el.dispatchEvent(
					new MouseEvent('contextmenu', {
						bubbles: true,
						cancelable: true,
						view: window,
						clientX: point.x,
						clientY: point.y,
						button: 2,
						buttons: 2,
						detail: 1,
					}),
				)
			}, { x: box.x + 12, y: box.y + 12 })

			const menu = objectsContextMenu(page)
			const menuList = menu.getByRole('menu')
			await expect(menu).toBeVisible()
			await expect(menuList).toBeVisible()

			const styles = await menuList.evaluate((el) => {
				const computed = window.getComputedStyle(el)
				return { maxHeight: computed.maxHeight, overflowY: computed.overflowY }
			})
			const viewport = page.viewportSize()
			if (!viewport) throw new Error('Viewport size unavailable')
			const maxHeight = Number.parseFloat(styles.maxHeight)
			expect(styles.overflowY).toBe('auto')
			expect(maxHeight).toBeGreaterThan(0)
			expect(maxHeight).toBeLessThanOrEqual(viewport.height - 16)
		} finally {
			await page.evaluate(() => {
				document.querySelectorAll<HTMLElement>('[data-objects-row="true"]').forEach((el) => {
					el.style.pointerEvents = ''
				})
			})
		}
	})

	test('object menu stays inside viewport', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(12))
		await seedStorage(page)
		await page.setViewportSize({ width: 780, height: 360 })
		await page.goto('/objects')

		const rows = page.locator('[data-objects-row="true"]')
		await expect(rows.first()).toBeVisible()
		const target = rows.first()
		await target.scrollIntoViewIfNeeded()
		await expect(target).toBeVisible()
		const menuTrigger = target.getByRole('button', { name: 'Object actions' })
		await expect(menuTrigger).toBeVisible()
		await menuTrigger.click()

		const menu = page
			.getByRole('menu')
			.filter({ has: page.getByRole('menuitem', { name: 'Download (client)' }) })
			.last()
		await expect(menu).toBeVisible()
		await expectMenuInViewport(page, menu, {
			padding: 8,
			viewportSelector: '[data-scroll-container="app-content"]',
		})
	})

	test('mobile object menu stays clickable above the selection bar', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(3))
		await seedStorage(page)
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/objects')

		const row = page.locator('[data-objects-row="true"]').first()
		await expect(row).toBeVisible()
		await row.getByRole('checkbox', { name: /Select / }).click()
		await expect(page.getByText('1 selected')).toBeVisible()

		await row.getByRole('button', { name: 'Object actions' }).click()

		const menu = page
			.getByRole('menu')
			.filter({ has: page.getByRole('menuitem', { name: 'Download (client)' }) })
			.last()
		await expect(menu).toBeVisible()
		await expectMenuInViewport(page, menu, {
			padding: 8,
			viewportSelector: '[data-scroll-container="app-content"]',
		})

		await menu.getByRole('menuitem', { name: 'Details' }).click()
		await expect(menu).toBeHidden()
	})
})
