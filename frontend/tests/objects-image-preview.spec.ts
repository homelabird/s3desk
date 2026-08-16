import { expect, test, type Page } from '@playwright/test'

import { buildProfileFixture, installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'
import { gotoObjectsPage, objectsListRow } from './support/ui'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
	objectsUIMode: 'simple' | 'advanced'
	showThumbnails: boolean
	detailsOpen: boolean
}

type ObjectFixture = {
	key: string
	size: number
	contentType: string
	lastModified: string
	etag: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	profileId: 'playwright-profile',
	bucket: 'test-bucket',
	objectsUIMode: 'advanced',
	showThumbnails: true,
	detailsOpen: true,
}

const visualScreenshotOptions = {
	animations: 'disabled',
	caret: 'hide',
	maxDiffPixelRatio: 0.01,
} as const

const svgPreview = `
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0f766e"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="1200" fill="url(#bg)"/>
  <circle cx="1180" cy="260" r="180" fill="#f8fafc" fill-opacity="0.3"/>
  <circle cx="420" cy="860" r="240" fill="#f97316" fill-opacity="0.35"/>
  <text x="120" y="210" fill="#f8fafc" font-size="132" font-family="Verdana, sans-serif">S3Desk</text>
  <text x="120" y="340" fill="#e2e8f0" font-size="54" font-family="Verdana, sans-serif">Preview Fixture</text>
  <rect x="120" y="470" width="1360" height="510" rx="48" fill="#020617" fill-opacity="0.26"/>
  <text x="180" y="620" fill="#f8fafc" font-size="82" font-family="Verdana, sans-serif">Large Preview</text>
  <text x="180" y="735" fill="#cbd5e1" font-size="44" font-family="Verdana, sans-serif">Zoom, pan, and fallback coverage</text>
</svg>
`.trim()

const transparentContrastPreview = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
  <text x="16" y="72" fill="black" font-size="48">BLACK</text>
  <text x="16" y="144" fill="white" font-size="48">WHITE</text>
</svg>
`.trim())}`

const fixtures: ObjectFixture[] = [
	{
		key: 'hero.png',
		size: 4096,
		contentType: 'image/svg+xml',
		lastModified: '2024-01-01T00:00:00Z',
		etag: '"hero-etag"',
	},
	{
		key: 'oversized.png',
		size: 12 * 1024 * 1024,
		contentType: 'image/svg+xml',
		lastModified: '2024-01-01T00:00:01Z',
		etag: '"oversized-etag"',
	},
	{
		key: 'clip.mp4',
		size: 2048,
		contentType: 'video/mp4',
		lastModified: '2024-01-01T00:00:02Z',
		etag: '"clip-etag"',
	},
]

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, {
		...defaultStorage,
		...overrides,
		prefix: '',
		objectsUIMode: (overrides?.objectsUIMode ?? defaultStorage.objectsUIMode),
		objectsShowThumbnails: overrides?.showThumbnails ?? defaultStorage.showThumbnails,
		objectsDetailsOpen: overrides?.detailsOpen ?? defaultStorage.detailsOpen,
	})
}

async function stubObjectsImagePreviewApi(page: Page, items: ObjectFixture[]) {
	const { bucket, profileId } = defaultStorage
	const metaByKey = new Map(items.map((item) => [item.key, item]))

	await page.route('**/__test__/preview/**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'image/svg+xml',
			body: svgPreview,
		})
	})

	await installApiFixtures(page, [
		textFixture('GET', '/api/v1/events', '', { status: 200, contentType: 'text/event-stream' }),
		jsonFixture(
			'GET',
			'/api/v1/meta',
			metaJson({
				dataDir: '/tmp',
				staticDir: '/tmp',
				capabilities: { profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' } },
				allowedLocalDirs: [],
				jobLogMaxBytes: null,
				jobRetentionSeconds: null,
				uploadSessionTTLSeconds: 86400,
				uploadMaxBytes: null,
			}),
		),
		jsonFixture('GET', '/api/v1/profiles', [
			buildProfileFixture({
				id: profileId,
				name: 'Playwright',
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				tlsInsecureSkipVerify: true,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
			}),
		]),
		jsonFixture('GET', '/api/v1/buckets', [{ name: bucket, createdAt: '2024-01-01T00:00:00Z' }]),
		jsonFixture('GET', `/api/v1/buckets/${bucket}/objects`, {
			bucket,
			prefix: '',
			delimiter: '/',
			commonPrefixes: [],
			items: items.map(({ key, size, lastModified, etag }) => ({ key, size, lastModified, etag })),
			nextContinuationToken: null,
			isTruncated: false,
		}),
		jsonFixture('GET', `/api/v1/buckets/${bucket}/objects/favorites`, { bucket, prefix: '', items: [] }),
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/meta`,
			handler: ({ url }) => {
				const key = url.searchParams.get('key') ?? ''
				const item = metaByKey.get(key)
				if (!item) return { status: 404, json: { error: 'not found' } }
				return {
					json: {
						key: item.key,
						size: item.size,
						etag: item.etag,
						lastModified: item.lastModified,
						contentType: item.contentType,
						metadata: {},
					},
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/download-url`,
			handler: ({ url }) => {
				const key = url.searchParams.get('key') ?? ''
				return {
					json: {
						url: `${url.origin}/__test__/preview/${encodeURIComponent(key)}`,
						expiresAt: '2024-01-01T01:00:00Z',
					},
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/thumbnail`,
			handler: () => ({ contentType: 'image/svg+xml', body: svgPreview }),
		},
	], { status: 200, json: {} })
}

function rowFor(page: Page, key: string) {
	return objectsListRow(page, key)
}

test.describe('Objects image preview', () => {
	test('details panel viewer supports zoom and reset controls', async ({ page }) => {
		const passiveListenerErrors: string[] = []
		page.on('console', (message) => {
			if (message.text().includes('Unable to preventDefault inside passive event listener')) {
				passiveListenerErrors.push(message.text())
			}
		})
		await stubObjectsImagePreviewApi(page, fixtures)
		await seedStorage(page)
		await gotoObjectsPage(page)

		const heroRow = rowFor(page, 'hero.png')
		await expect(heroRow).toBeVisible()
		await heroRow.click()

		await heroRow.getByRole('button', { name: /Object actions/ }).evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await page.getByRole('menuitem', { name: /Open large preview/i }).click()

		await expect(page.getByTestId('objects-image-viewer-modal')).toBeVisible()
		const image = page.getByTestId('objects-image-viewer-image')
		await expect(image).toBeVisible()

		await page.getByTestId('objects-image-viewer-zoom-in').click()
		await expect.poll(async () => image.evaluate((node) => (node as HTMLImageElement).style.transform)).toContain('scale(1.5)')
		await page.getByTestId('objects-image-viewer-reset').click()
		await expect.poll(async () => image.evaluate((node) => (node as HTMLImageElement).style.transform)).toContain('scale(1)')

		const stage = page.getByTestId('objects-image-viewer-stage')
		await stage.hover()
		await page.mouse.wheel(0, -100)
		await expect.poll(async () => image.evaluate((node) => (node as HTMLImageElement).style.transform)).toContain('scale(1.5)')
		expect(passiveListenerErrors).toEqual([])
	})

	test('mobile viewer keeps the stage focusable and supports keyboard panning @visual', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await stubObjectsImagePreviewApi(page, fixtures)
		await seedStorage(page)
		await gotoObjectsPage(page)

		await page.getByRole('button', { name: /Grid/i }).click()
		await expect(page.getByTestId('objects-grid-content')).toBeVisible()

		const card = rowFor(page, 'hero.png')
		await expect(card).toBeVisible()
		await card.getByRole('button', { name: 'Object actions for hero.png' }).click()
		await page.getByRole('menuitem', { name: 'Open large preview' }).click()

		const modal = page.getByTestId('objects-image-viewer-modal')
		const stage = modal.getByTestId('objects-image-viewer-stage')
		const image = modal.getByTestId('objects-image-viewer-image')
		const footer = modal.getByTestId('objects-image-viewer-footer')
		await expect(modal).toBeVisible()
		await expect(stage).toBeVisible()
		await expect(image).toBeVisible()
		await expect(footer).toBeVisible()
		await expect(stage).toHaveAttribute('role', 'region')
		await expect(stage).toHaveAttribute('aria-label', 'Preview stage for hero.png')
		await expect(stage).toHaveAttribute('tabindex', '0')

		await modal.getByTestId('objects-image-viewer-zoom-in').click()
		await expect.poll(async () => image.evaluate((node) => (node as HTMLImageElement).style.transform)).toContain('scale(1.5)')

		await stage.focus()
		await expect(stage).toBeFocused()
		await page.keyboard.press('ArrowRight')
		await expect.poll(async () => image.evaluate((node) => (node as HTMLImageElement).style.transform)).toContain('translate3d(40px, 0px, 0px) scale(1.5)')

		await expect(modal).toHaveScreenshot('objects-image-viewer-mobile-pan-focus.png', visualScreenshotOptions)
	})

	test('object actions can open the shared large preview viewer', async ({ page }) => {
		await stubObjectsImagePreviewApi(page, fixtures)
		await seedStorage(page)
		await gotoObjectsPage(page)

		const heroRow = rowFor(page, 'hero.png')
		await expect(heroRow).toBeVisible()
		await heroRow.getByRole('button', { name: /Object actions/ }).evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await page.getByRole('menuitem', { name: /Open large preview/i }).click()

		await expect(page.getByTestId('objects-image-viewer-modal')).toBeVisible()
		await expect(page.getByTestId('objects-image-viewer-image')).toBeVisible()
	})

	test('transparent previews keep the same neutral canvas in both themes', async ({ page }) => {
		await stubObjectsImagePreviewApi(page, fixtures)
		await seedStorage(page)
		await gotoObjectsPage(page)

		const heroRow = rowFor(page, 'hero.png')
		await expect(heroRow).toBeVisible()
		await heroRow.getByRole('button', { name: /Object actions/ }).evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await page.getByRole('menuitem', { name: /Open large preview/i }).click()

		const stage = page.getByTestId('objects-image-viewer-stage')
		const image = page.getByTestId('objects-image-viewer-image')
		await expect(image).toBeVisible()
		await image.evaluate((element, src) => {
			;(element as HTMLImageElement).src = src
		}, transparentContrastPreview)
		await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).complete)).toBe(true)
		const lightCanvas = await stage.evaluate((element) => getComputedStyle(element).backgroundImage)
		expect(lightCanvas).toContain('rgb(133, 141, 150)')
		expect(lightCanvas).toContain('rgb(116, 124, 134)')
		await expect(image).toHaveCSS('filter', 'none')

		await page.getByRole('button', { name: 'Close', exact: true }).click()
		await page.getByRole('button', { name: 'App menu' }).click()
		await page.getByRole('menuitem', { name: /Dark mode/i }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

		await heroRow.getByRole('button', { name: /Object actions/ }).evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await page.getByRole('menuitem', { name: /Open large preview/i }).click()
		await expect(image).toBeVisible()
		await image.evaluate((element, src) => {
			;(element as HTMLImageElement).src = src
		}, transparentContrastPreview)
		await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).complete)).toBe(true)
		expect(await stage.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(lightCanvas)
		await expect(image).toHaveCSS('filter', 'none')
	})

	test('mobile object actions open an actionable fallback for oversized images', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await stubObjectsImagePreviewApi(page, fixtures)
		await seedStorage(page)
		await gotoObjectsPage(page)

		const oversizedRow = rowFor(page, 'oversized.png')
		await oversizedRow.getByRole('button', { name: 'Object actions for oversized.png' }).click()
		await page.getByRole('menuitem', { name: 'Open large preview' }).click()

		const modal = page.getByTestId('objects-image-viewer-modal')
		await expect(modal).toBeVisible()
		await expect(modal.getByText('Preview too large')).toBeVisible()
		await expect(modal.getByText('Fallback thumbnail shown')).toBeVisible()
		await expect(modal.getByRole('button', { name: 'Download' })).toBeVisible()
		await expect(modal.getByText('Use Download or URL to view the original file.')).toBeVisible()
		await expect(modal.getByTestId('objects-image-viewer-zoom-in')).toHaveCount(0)
		await modal.getByRole('button', { name: 'Close', exact: true }).click()
		await expect(modal).toHaveCount(0)
	})

	test('video objects reuse the details preview fallback until the user explicitly loads a larger frame', async ({ page }) => {
		await stubObjectsImagePreviewApi(page, fixtures)
		await seedStorage(page)
		const listThumbnailResponse = page.waitForResponse((response) => {
			return response.url().includes('/api/v1/buckets/test-bucket/objects/thumbnail') && response.url().includes('key=clip.mp4') && response.status() === 200
		})
		await gotoObjectsPage(page)
		await listThumbnailResponse

		const listThumbnail = page.getByAltText('Thumbnail of clip.mp4').first()
		await expect(listThumbnail).toBeVisible()

		const videoRow = rowFor(page, 'clip.mp4')
		await expect(videoRow).toBeVisible()
		await videoRow.click()
		await videoRow.getByRole('button', { name: /Object actions/ }).evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await page.getByRole('menuitem', { name: 'Details' }).click()

		await expect(page.getByTestId('objects-details-preview-section')).toBeVisible()
		await expect(page.getByTestId('objects-details-preview-open-large')).toBeVisible()
		await expect(page.getByText('Use Load preview to fetch a larger thumbnail frame.')).toBeVisible()

		await page.getByTestId('objects-details-preview-load').click()

		await expect(page.getByAltText('Thumbnail preview of clip.mp4')).toBeVisible()
	})
})
