import { expect, test, type Page } from '@playwright/test'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
	recentBuckets: string[]
	objectsUIMode: 'simple' | 'advanced'
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	profileId: 'playwright-profile',
	bucket: 'alpha-bucket',
	recentBuckets: ['charlie-bucket', 'bravo-bucket', 'alpha-bucket'],
	objectsUIMode: 'advanced',
}

const buckets = ['alpha-bucket', 'bravo-bucket', 'charlie-bucket']

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
		window.localStorage.setItem('prefix', JSON.stringify(''))
		window.localStorage.setItem('objectsUIMode', JSON.stringify(seed.objectsUIMode))
		window.localStorage.setItem('objectsRecentBuckets', JSON.stringify(seed.recentBuckets))
	}, storage)
}

async function stubBucketPickerApi(page: Page) {
	const { profileId } = defaultStorage
	const now = '2024-01-01T00:00:00Z'
	const objectsByBucket: Record<string, { key: string; size: number; lastModified: string; etag: string }[]> = {
		'alpha-bucket': [{ key: 'alpha.txt', size: 128, lastModified: now, etag: '"alpha"' }],
		'bravo-bucket': [{ key: 'bravo.txt', size: 256, lastModified: now, etag: '"bravo"' }],
		'charlie-bucket': [{ key: 'charlie.txt', size: 512, lastModified: now, etag: '"charlie"' }],
	}

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
				body: JSON.stringify(buckets.map((name) => ({ name, createdAt: now }))),
			})
		}

		const bucketMatch = path.match(/^\/api\/v1\/buckets\/([^/]+)\/objects$/)
		if (method === 'GET' && bucketMatch) {
			const bucket = decodeURIComponent(bucketMatch[1] ?? '')
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					bucket,
					prefix: '',
					delimiter: '/',
					commonPrefixes: [],
					items: objectsByBucket[bucket] ?? [],
					nextContinuationToken: null,
					isTruncated: false,
				}),
			})
		}

		const favoritesMatch = path.match(/^\/api\/v1\/buckets\/([^/]+)\/objects\/favorites$/)
		if (method === 'GET' && favoritesMatch) {
			const bucket = decodeURIComponent(favoritesMatch[1] ?? '')
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

function rowFor(page: Page, key: string) {
	return page.locator('[data-objects-row="true"]').filter({ hasText: key }).first()
}

test.describe('Objects bucket picker', () => {
	test('desktop picker shows current and recent buckets, then switches on click', async ({ page }) => {
		await stubBucketPickerApi(page)
		await seedStorage(page)
		await page.goto('/objects')

		await expect(rowFor(page, 'alpha.txt')).toBeVisible()

		const picker = page.getByTestId('objects-bucket-picker-desktop')
		await picker.click()

		await expect(page.getByTestId('objects-bucket-picker-option-alpha-bucket')).toContainText('Current')
		await expect(page.getByTestId('objects-bucket-picker-option-charlie-bucket')).toContainText('Recent')
		await expect(page.getByTestId('objects-bucket-picker-option-bravo-bucket')).toContainText('Recent')

		await page.getByTestId('objects-bucket-picker-option-charlie-bucket').click()
		await expect(rowFor(page, 'charlie.txt')).toBeVisible()
		await expect(page.getByText('s3://charlie-bucket/')).toBeVisible()
	})

	test('desktop picker does not navigate while typing and supports keyboard commit', async ({ page }) => {
		await stubBucketPickerApi(page)
		await seedStorage(page)
		await page.goto('/objects')

		await expect(rowFor(page, 'alpha.txt')).toBeVisible()

		const picker = page.getByTestId('objects-bucket-picker-desktop')
		await picker.click()
		await page.keyboard.type('bravo-bucket')

		await expect(rowFor(page, 'alpha.txt')).toBeVisible()
		await page.keyboard.press('Enter')

		await expect(rowFor(page, 'bravo.txt')).toBeVisible()
		await expect(page.getByText('s3://bravo-bucket/')).toBeVisible()
	})

	test('mobile drawer supports tap selection and clear', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await stubBucketPickerApi(page)
		await seedStorage(page)
		await page.goto('/objects')

		const trigger = page.getByTestId('objects-bucket-picker-mobile-trigger')
		await expect(trigger).toContainText('alpha-bucket')
		await trigger.click()

		const drawer = page.getByTestId('objects-bucket-picker-mobile-drawer')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByText('Current', { exact: true }).first()).toBeVisible()
		await expect(drawer.getByText('Recent', { exact: true }).first()).toBeVisible()

		await page.getByTestId('objects-bucket-picker-option-charlie-bucket').click()
		await expect(drawer).toBeHidden()
		await expect(rowFor(page, 'charlie.txt')).toBeVisible()

		await trigger.click()
		await page.getByTestId('objects-bucket-picker-mobile-clear').click()

		await expect(page.getByText('Select a bucket to browse objects.')).toBeVisible()
		await expect(trigger).toContainText('Bucket…')
	})
})
