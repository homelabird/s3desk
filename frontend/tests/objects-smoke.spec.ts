import { expect, test, type Page } from '@playwright/test'

type StorageSeed = {
	objectsUIMode: 'simple' | 'advanced'
	apiToken: string
	profileId: string | null
	bucket: string
}

const defaultStorage: StorageSeed = {
	objectsUIMode: 'advanced',
	apiToken: 'change-me',
	profileId: 'playwright-smoke',
	bucket: 'test-bucket',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('objectsUIMode', JSON.stringify(seed.objectsUIMode))
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
	}, storage)
}

async function getToolbarMoreButton(page: Page) {
	const byTestId = page.getByTestId('objects-toolbar-more')
	if (await byTestId.count()) return byTestId.first()
	return page.getByRole('button', { name: /More|Actions/i }).first()
}

async function stubObjectsSmokeApi(page: Page, overrides?: Partial<StorageSeed>) {
	const seed = { ...defaultStorage, ...overrides }
	const now = '2024-01-01T00:00:00Z'

	await page.route('**/api/v1/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())
		const path = url.pathname
		const method = request.method()

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
						id: seed.profileId,
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
				body: JSON.stringify([{ name: seed.bucket, createdAt: now }]),
			})
		}

		if (method === 'GET' && path === `/api/v1/buckets/${seed.bucket}/objects`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					bucket: seed.bucket,
					prefix: '',
					delimiter: '/',
					commonPrefixes: [],
					items: [],
					nextContinuationToken: null,
					isTruncated: false,
				}),
			})
		}

		if (method === 'GET' && path === `/api/v1/buckets/${seed.bucket}/objects/favorites`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					bucket: seed.bucket,
					prefix: '',
					items: [],
				}),
			})
		}

		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	})
}

test.describe('Objects page smoke', () => {
	test('simple mode hides advanced controls', async ({ page }) => {
		await stubObjectsSmokeApi(page, { objectsUIMode: 'simple' })
		await seedStorage(page, { objectsUIMode: 'simple' })
		await page.goto('/objects')

		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await expect(page.getByLabel('Go to path')).toBeVisible()

		const moreButton = await getToolbarMoreButton(page)
		await moreButton.scrollIntoViewIfNeeded()
		await moreButton.click({ force: true })
		await expect(page.getByRole('menuitem', { name: /Advanced mode/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Global search/i })).toHaveCount(0)
	})

	test('advanced mode shows advanced controls', async ({ page }) => {
		await stubObjectsSmokeApi(page, { objectsUIMode: 'advanced' })
		await seedStorage(page, { objectsUIMode: 'advanced' })
		await page.goto('/objects')

		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await expect(page.getByLabel('Go to path')).toBeVisible()

		const moreButton = await getToolbarMoreButton(page)
		await moreButton.scrollIntoViewIfNeeded()
		await moreButton.click({ force: true })
		await expect(page.getByRole('menuitem', { name: /Simple mode/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Global search/i })).toBeVisible()
	})
})
