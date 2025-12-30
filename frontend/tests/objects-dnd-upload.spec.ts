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

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
		window.localStorage.setItem('objectsUIMode', JSON.stringify('simple'))
	}, storage)
}

test('objects drag and drop does not throw Illegal invocation', async ({ page }) => {
	const now = '2024-01-01T00:00:00Z'
	const uploadId = 'upload-test'
	let uploadCommitted = false

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
						id: defaultStorage.profileId,
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
					items: [],
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
					items: [],
				}),
			})
		}

		if (method === 'POST' && path === '/api/v1/uploads') {
			return route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ uploadId, maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }),
			})
		}

		if (method === 'POST' && path === `/api/v1/uploads/${uploadId}/files`) {
			return route.fulfill({ status: 204 })
		}

		if (method === 'POST' && path === `/api/v1/uploads/${uploadId}/commit`) {
			uploadCommitted = true
			return route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ jobId: 'job-test' }),
			})
		}

		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	})

	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))

	await seedStorage(page)
	await page.goto('/objects')

	await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
	const dropZone = page.getByTestId('objects-upload-dropzone')
	await expect(dropZone).toBeVisible()

	const dataTransfer = await page.evaluateHandle(() => {
		const dt = new DataTransfer()
		const entry: {
			isFile: boolean
			isDirectory: boolean
			fullPath: string
			name: string
			file: (success: (file: File) => void, error?: (err: unknown) => void) => void
		} = {
			isFile: true,
			isDirectory: false,
			fullPath: '/dir/hello.txt',
			name: 'hello.txt',
			file(success) {
				if (this !== entry) {
					throw new Error('Illegal invocation')
				}
				success(new File(['hello'], 'hello.txt', { type: 'text/plain' }))
			},
		}
		const item = { webkitGetAsEntry: () => entry }
		Object.defineProperty(dt, 'items', { value: [item] })
		Object.defineProperty(dt, 'files', { value: [] })
		Object.defineProperty(dt, 'types', { value: ['Files'] })
		dt.dropEffect = 'none'
		return dt
	})

	await dropZone.dispatchEvent('dragenter', { dataTransfer })
	await dropZone.dispatchEvent('dragover', { dataTransfer })
	await dropZone.dispatchEvent('drop', { dataTransfer })

	await expect.poll(() => uploadCommitted, { timeout: 5000 }).toBe(true)
	expect(errors).toEqual([])
})
