import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	jsonFixture,
	seedLocalStorage,
	textFixture,
} from './support/apiFixtures'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
	prefix: string
	objectsUIMode: 'simple' | 'advanced'
}

const now = '2024-01-01T00:00:00Z'

const defaultStorage: StorageSeed = {
	apiToken: 'webview-token',
	profileId: 'webview-profile',
	bucket: 'webview-bucket',
	prefix: 'reports/2024/',
	objectsUIMode: 'advanced',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

async function installWebviewFixtures(page: Page, overrides?: Partial<StorageSeed>) {
	const seed = { ...defaultStorage, ...overrides }

	await installApiFixtures(page, [
		jsonFixture(
			'GET',
			'/api/v1/meta',
			buildMetaFixture({
				capabilities: { profileTls: { enabled: false, reason: 'test' }, providers: {} },
				allowedLocalDirs: [],
				uploadDirectStream: false,
			}),
		),
		jsonFixture('GET', '/api/v1/profiles', [
			buildProfileFixture({
				id: seed.profileId,
				name: 'Webview QA Profile',
				createdAt: now,
				updatedAt: now,
			}),
		]),
		jsonFixture('GET', '/api/v1/buckets', [buildBucketFixture(seed.bucket, { createdAt: now })]),
		{
			method: 'GET',
			path: `/api/v1/buckets/${seed.bucket}/objects`,
			handler: ({ request }) => {
				const url = new URL(request.url())
				const prefix = url.searchParams.get('prefix') ?? ''
				const items = prefix === seed.prefix
					? [
							{
								key: `${seed.prefix}summary.csv`,
								size: 512,
								lastModified: now,
								etag: '"summary"',
							},
						]
					: []
				return {
					json: buildObjectsListFixture({
						bucket: seed.bucket,
						prefix,
						commonPrefixes: prefix ? [] : [seed.prefix],
						items,
					}),
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${seed.bucket}/objects/favorites`,
			handler: ({ request }) => {
				const url = new URL(request.url())
				return {
					json: buildFavoritesFixture({
						bucket: seed.bucket,
						prefix: url.searchParams.get('prefix') ?? '',
						items: [],
					}),
				}
			},
		},
		jsonFixture('GET', '/api/v1/jobs', { items: [], nextCursor: null }),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	], { status: 200, json: {} })
}

async function emulateInsecureBrowser(page: Page) {
	await page.addInitScript(() => {
		Object.defineProperty(window, 'isSecureContext', {
			value: false,
			configurable: true,
		})

		Object.defineProperty(window, 'showDirectoryPicker', {
			value: async () => {
				throw new DOMException('Directory picker unavailable', 'SecurityError')
			},
			configurable: true,
		})

		if (navigator.clipboard) {
			Object.defineProperty(navigator.clipboard, 'writeText', {
				value: async () => {
					throw new DOMException('Clipboard access blocked', 'NotAllowedError')
				},
				configurable: true,
			})
		}

		Object.defineProperty(document, 'execCommand', {
			value: () => false,
			configurable: true,
		})
	})
}

async function openJobsDownloadDrawer(page: Page) {
	const downloadButton = page.getByRole('button', { name: /^Download/ }).first()
	await downloadButton.scrollIntoViewIfNeeded()
	await downloadButton.click()

	const dialog = page.getByRole('dialog', { name: 'Download folder (S3 → device)' })
	await expect(dialog).toBeVisible()
	return dialog
}

test.describe('Webview environment and posture coverage', () => {
	test('jobs download drawer stays reachable in a short landscape split-view posture', async ({ page }) => {
		await page.setViewportSize({ width: 780, height: 420 })
		await installWebviewFixtures(page)
		await seedStorage(page)

		await page.goto('/jobs')
		const dialog = await openJobsDownloadDrawer(page)
		await expect(dialog.getByLabel('Bucket')).toBeVisible()
		await expect(dialog.getByText('Downloads to this device')).toBeVisible()
		await expect(dialog.getByLabel('Close', { exact: true })).toBeVisible()
		await expect(dialog.getByRole('button', { name: 'Download' })).toBeVisible()

		const viewport = await page.evaluate(() => ({
			width: window.innerWidth,
			height: window.innerHeight,
			scrollWidth: document.documentElement.scrollWidth,
		}))
		const dialogBox = await dialog.boundingBox()
		const downloadBox = await dialog.getByRole('button', { name: 'Download' }).boundingBox()

		expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width)
		expect(dialogBox).not.toBeNull()
		expect(downloadBox).not.toBeNull()
		expect(dialogBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(viewport.height + 1)
		expect((dialogBox?.x ?? Number.POSITIVE_INFINITY) + (dialogBox?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(
			viewport.width + 1,
		)
		expect((downloadBox?.y ?? Number.POSITIVE_INFINITY) + (downloadBox?.height ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(
			viewport.height + 1,
		)
	})

	test('jobs download drawer warns when secure-context folder access is unavailable', async ({ page }) => {
		await emulateInsecureBrowser(page)
		await installWebviewFixtures(page)
		await seedStorage(page)

		await page.goto('/jobs')
		const dialog = await openJobsDownloadDrawer(page)

		await expect(dialog.getByText('Local folder access is not available')).toBeVisible()
		await expect(dialog.getByText('Directory picker requires HTTPS or localhost.')).toBeVisible()
		await expect(dialog.getByRole('button', { name: /^Browse/ })).toBeDisabled()
		await expect(dialog.getByRole('button', { name: 'Download' })).toBeDisabled()
	})

	test('objects copy-location feedback surfaces the insecure-origin clipboard hint', async ({ page }) => {
		await emulateInsecureBrowser(page)
		await installWebviewFixtures(page)
		await seedStorage(page)

		await page.goto('/objects')
		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await page.getByRole('button', { name: 'Copy location' }).click()

		await expect(
			page.getByText('Copy failed. Clipboard access is restricted on insecure origins (try HTTPS or localhost).'),
		).toBeVisible()
		await expect(page.getByText(`s3://${defaultStorage.bucket}/${defaultStorage.prefix}`)).toBeVisible()
	})
})
