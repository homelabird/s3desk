import { expect, test, type Page } from '@playwright/test'

const now = '2024-01-01T00:00:00Z'
const profileId = 'capability-profile'
const bucket = 'capability-bucket'

async function seedStorage(page: Page) {
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify('playwright-token'))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
		window.localStorage.setItem('objectsUIMode', JSON.stringify('simple'))
	}, { profileId, bucket })
}

async function mockProviderWithUploadDisabled(page: Page) {
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
					capabilities: {
						profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' },
						providers: {
							azure_blob: {
								bucketCrud: true,
								objectCrud: false,
								jobTransfer: false,
								bucketPolicy: false,
								gcsIamPolicy: false,
								azureContainerAccessPolicy: true,
								presignedUpload: false,
								presignedMultipartUpload: false,
								directUpload: false,
							},
						},
					},
					allowedLocalDirs: [],
					jobConcurrency: 2,
					jobLogMaxBytes: null,
					jobRetentionSeconds: null,
					uploadSessionTTLSeconds: 86400,
					uploadMaxBytes: null,
					uploadDirectStream: false,
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
						provider: 'azure_blob',
						name: 'Playwright Azure',
						accountName: 'playwright',
						accountKey: 'secret',
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
					items: [],
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

test('uploads page disables upload controls when provider capability blocks uploads', async ({ page }) => {
	await mockProviderWithUploadDisabled(page)
	await seedStorage(page)
	await page.goto('/uploads')

	await expect(page.getByText('Uploads are not available for this provider')).toBeVisible()
	await expect(page.getByRole('button', { name: 'Select files' })).toBeDisabled()
	await expect(page.getByRole('button', { name: /Queue upload/i })).toBeDisabled()
})

test('objects page disables upload button when provider capability blocks uploads', async ({ page }) => {
	await mockProviderWithUploadDisabled(page)
	await seedStorage(page)
	await page.goto('/objects')

	await expect(page.getByText('Uploads are disabled for this provider')).toBeVisible()
	await expect(page.getByRole('button', { name: 'Upload' }).first()).toBeDisabled()
})
