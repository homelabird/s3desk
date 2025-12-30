import { expect, test, type Page } from '@playwright/test'

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
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
		window.localStorage.setItem('prefix', JSON.stringify(''))
		window.localStorage.setItem('objectsUIMode', JSON.stringify(seed.objectsUIMode))
	}, storage)
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

	await page.route('**/api/v1/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())
		const path = url.pathname
		const method = request.method()

		if (method === 'GET' && path === '/api/v1/events') {
			return route.fulfill({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: '',
			})
		}

		if (method === 'GET' && path === '/api/v1/meta') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					version: 'test',
					serverAddr: '127.0.0.1:8080',
					dataDir: '/tmp',
					staticDir: '/tmp',
					apiTokenEnabled: true,
					encryptionEnabled: false,
					capabilities: { profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' } },
					allowedLocalDirs: [],
					jobConcurrency: 2,
					jobLogMaxBytes: null,
					jobRetentionSeconds: null,
					uploadSessionTTLSeconds: 86400,
					uploadMaxBytes: null,
					transferEngine: { name: 'rclone', available: true, path: '/usr/local/bin/rclone', version: 'v1.66.0' },
				}),
			})
		}

		if (method === 'GET' && path === '/api/v1/profiles') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([
					{
						id: profileId,
						name: 'Playwright',
						endpoint: 'http://localhost:9000',
						region: 'us-east-1',
						forcePathStyle: true,
						tlsInsecureSkipVerify: true,
						createdAt: now,
						updatedAt: now,
					},
				]),
			})
		}

		if (method === 'GET' && path === '/api/v1/buckets') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([{ name: bucket, createdAt: now }]),
			})
		}

		if (method === 'GET' && path === `/api/v1/buckets/${bucket}/objects`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					bucket,
					prefix: '',
					delimiter: '/',
					commonPrefixes: [],
					items,
					nextContinuationToken: null,
					isTruncated: false,
				}),
			})
		}

		if (method === 'GET' && path === `/api/v1/buckets/${bucket}/objects/favorites`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					bucket,
					prefix: '',
					items: [],
				}),
			})
		}

		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	})
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
	viewport: { width: number; height: number }
}

async function getMenuMetrics(page: Page): Promise<MenuMetrics | null> {
	const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden) .objects-context-menu')
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
	const viewport = page.viewportSize()
	if (!viewport) return null
	return { rect, viewport }
}

async function expectMenuInViewport(page: Page) {
	const deadline = Date.now() + 5000
	let latest: MenuMetrics | null = null
	while (Date.now() < deadline) {
		latest = await getMenuMetrics(page)
		if (latest) {
			const { rect, viewport } = latest
			if (
				rect.top >= 0 &&
				rect.left >= 0 &&
				rect.right <= viewport.width &&
				rect.bottom <= viewport.height
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
	test('list menu clamps to viewport and scrolls', async ({ page }) => {
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

			await scroller.click({
				button: 'right',
				position: { x: Math.min(20, Math.max(1, box.width - 1)), y: Math.max(5, box.height - 10) },
			})

			const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden) .objects-context-menu')
			await expect(menu).toBeVisible()
			await expectMenuInViewport(page)

			const styles = await menu.evaluate((el) => {
				const computed = window.getComputedStyle(el)
				return { maxHeight: computed.maxHeight, overflowY: computed.overflowY }
			})
			const { viewport } = await expectMenuInViewport(page)
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
		const target = rows.last()
		await target.scrollIntoViewIfNeeded()
		const box = await target.boundingBox()
		if (!box) throw new Error('Object row not found')

		await target.click({
			button: 'right',
			position: { x: Math.min(20, Math.max(1, box.width - 1)), y: Math.min(20, Math.max(1, box.height - 1)) },
		})

		const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden) .objects-context-menu')
		await expect(menu).toBeVisible()
		await expectMenuInViewport(page)
	})
})
