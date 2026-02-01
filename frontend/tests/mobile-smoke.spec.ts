import { expect, test, type Page } from '@playwright/test'

type StorageSeed = {
	apiToken: string
	profileId: string | null
	bucket: string
	objectsUIMode: 'simple' | 'advanced'
}

const defaultStorage: StorageSeed = {
	apiToken: 'change-me',
	profileId: 'playwright-mobile',
	bucket: 'mobile-bucket',
	objectsUIMode: 'simple',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
		window.localStorage.setItem('objectsUIMode', JSON.stringify(seed.objectsUIMode))
	}, storage)
}

async function stubCoreApi(page: Page, overrides?: Partial<StorageSeed>) {
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
					uploadDirectStream: false,
					transferEngine: {
						name: 'rclone',
						available: true,
						compatible: true,
						minVersion: 'v1.66.0',
						path: '/usr/local/bin/rclone',
						version: 'v1.66.0',
					},
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
						name: 'Playwright Mobile',
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

		if (method === 'GET' && path === '/api/v1/jobs') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ items: [], nextCursor: null }),
			})
		}

		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	})
}

test.describe('mobile smoke', () => {
	test.beforeEach(async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
	})

	test('profiles page renders', async ({ page }) => {
		await page.goto('/profiles')
		await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'New Profile' })).toBeVisible()
	})

	test('objects page renders', async ({ page }) => {
		await page.goto('/objects')
		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await expect(page.getByTestId('objects-upload-dropzone')).toBeVisible()
	})

	test('jobs page renders', async ({ page }) => {
		await page.goto('/jobs')
		await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
		await expect(page.getByRole('button', { name: /Upload folder/i })).toBeVisible()
	})

	test('uploads page renders', async ({ page }) => {
		await page.goto('/uploads')
		await expect(page.getByRole('heading', { name: 'Uploads' })).toBeVisible()
		await expect(page.getByRole('combobox', { name: 'Bucket' })).toBeVisible()
	})
})
