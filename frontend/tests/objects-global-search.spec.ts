import { expect, test, type Page } from '@playwright/test'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	profileId: 'playwright-profile',
	bucket: 'test-bucket',
}

const now = '2024-01-01T00:00:00Z'

const metaResponse = {
	version: 'test',
	serverAddr: '127.0.0.1:8080',
	dataDir: '/data',
	staticDir: '/app/ui',
	apiTokenEnabled: true,
	encryptionEnabled: false,
	capabilities: { profileTls: { enabled: false, reason: 'test' } },
	jobConcurrency: 2,
	uploadSessionTTLSeconds: 3600,
	transferEngine: { name: 'rclone', available: true, path: '/usr/local/bin/rclone', version: 'v1.66.0' },
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
		window.localStorage.setItem('objectsUIMode', JSON.stringify('advanced'))
		window.localStorage.setItem('objectsAutoIndexEnabled', JSON.stringify(false))
	}, storage)
}

async function setupApiMocks(page: Page) {
	const objectItem = {
		key: 'alpha.txt',
		size: 12,
		lastModified: now,
	}
	let favorites = [] as Array<typeof objectItem & { createdAt: string }>

	await page.route('**/api/v1/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())
		const path = url.pathname
		const method = request.method()

		if (method === 'GET' && path === '/api/v1/meta') {
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metaResponse) })
		}
		if (method === 'GET' && path === '/api/v1/profiles') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([
					{
						id: defaultStorage.profileId,
						name: 'Playwright',
						endpoint: 'http://minio:9000',
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
				body: JSON.stringify([{ name: defaultStorage.bucket, createdAt: now }]),
			})
		}
		if (method === 'GET' && path === `/api/v1/buckets/${defaultStorage.bucket}/objects`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					bucket: defaultStorage.bucket,
					prefix: '',
					delimiter: '/',
					commonPrefixes: [],
					items: [objectItem],
					nextContinuationToken: null,
					isTruncated: false,
				}),
			})
		}
		if (method === 'GET' && path === `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					bucket: defaultStorage.bucket,
					prefix: '',
					items: favorites,
				}),
			})
		}
		if (method === 'POST' && path === `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`) {
			const entry = { ...objectItem, createdAt: now }
			favorites = [entry]
			return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(entry) })
		}
		if (method === 'DELETE' && path === `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`) {
			favorites = []
			return route.fulfill({ status: 204 })
		}
		if (method === 'GET' && path === `/api/v1/buckets/${defaultStorage.bucket}/objects/search`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ items: [objectItem], nextCursor: null }),
			})
		}
		if (method === 'GET' && path === '/api/v1/events') {
			return route.fulfill({ status: 403, contentType: 'text/plain', body: 'forbidden' })
		}

		return route.fulfill({
			status: 404,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 'not_found', message: 'not found' } }),
		})
	})
}

test('global search and favorites update from objects UI', async ({ page }) => {
	await seedStorage(page)
	await setupApiMocks(page)

	await page.goto('/objects')
	await expect(page.getByPlaceholder('Search current folder')).toBeVisible()

	const objectRow = page.locator('[data-objects-row="true"]', { hasText: 'alpha.txt' }).first()
	await expect(objectRow).toBeVisible()

	await objectRow.getByRole('button', { name: 'Add favorite' }).click()
	await expect(objectRow.getByRole('button', { name: 'Remove favorite' })).toBeVisible()
	await expect(page.getByRole('button', { name: /alpha\.txt/ })).toBeVisible()

	const favoritesOnly = page.getByRole('switch', { name: 'Favorites only' }).first()
	await favoritesOnly.click()
	await expect(objectRow).toBeVisible()

	await objectRow.getByRole('button', { name: 'Remove favorite' }).click()
	await expect(page.getByText('No favorites yet.')).toBeVisible()

	await page.getByRole('button', { name: 'Global Search (Indexed)' }).click()
	const drawer = page.locator('.ant-drawer').filter({ hasText: 'Global Search (Indexed)' })
	await expect(drawer).toBeVisible()

	await drawer.getByPlaceholder('Search query (substring)').fill('alpha')
	await expect(drawer.getByText('alpha.txt')).toBeVisible({ timeout: 10_000 })
})
