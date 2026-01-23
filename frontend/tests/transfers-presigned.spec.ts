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

async function dropSingleFile(page: Page, name: string, contents: string, type: string) {
	const dataTransfer = await page.evaluateHandle(
		({ name, contents, type }) => {
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
				fullPath: `/${name}`,
				name,
				file(success) {
					success(new File([contents], name, { type }))
				},
			}
			const item = { webkitGetAsEntry: () => entry }
			Object.defineProperty(dt, 'items', { value: [item] })
			Object.defineProperty(dt, 'files', { value: [] })
			Object.defineProperty(dt, 'types', { value: ['Files'] })
			return dt
		},
		{ name, contents, type },
	)

	const dropZone = page.getByTestId('objects-upload-dropzone')
	await expect(dropZone).toBeVisible()
	await dropZone.dispatchEvent('dragenter', { dataTransfer })
	await dropZone.dispatchEvent('dragover', { dataTransfer })
	await dropZone.dispatchEvent('drop', { dataTransfer })
}

test('falls back to staging when presigned upload is unsupported', async ({ page }) => {
	const now = '2024-01-01T00:00:00Z'
	const uploadId = 'upload-fallback'
	const jobId = 'job-fallback'
	let presignedAttempted = false
	let fallbackAttempted = false
	let commitCalled = false
	let presignedUrlHit = false

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
			const body = request.postDataJSON() as { mode?: string }
			if (body?.mode === 'presigned') {
				presignedAttempted = true
				return route.fulfill({
					status: 400,
					contentType: 'application/json',
					body: JSON.stringify({
						error: {
							code: 'not_supported',
							message: 'presigned uploads require an S3-compatible provider',
						},
					}),
				})
			}
			fallbackAttempted = true
			return route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ uploadId, mode: 'staging', maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }),
			})
		}

		if (method === 'POST' && path === `/api/v1/uploads/${uploadId}/files`) {
			return route.fulfill({ status: 204 })
		}

		if (method === 'POST' && path === `/api/v1/uploads/${uploadId}/commit`) {
			commitCalled = true
			return route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ jobId }),
			})
		}

		if (method === 'GET' && path === `/api/v1/jobs/${jobId}`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ status: 'running' }),
			})
		}

		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	})

	await page.route('https://presigned.example/**', async (route) => {
		presignedUrlHit = true
		return route.fulfill({ status: 200 })
	})

	await seedStorage(page)
	await page.goto('/objects')
	await dropSingleFile(page, 'hello.txt', 'hello', 'text/plain')

	await expect.poll(() => presignedAttempted, { timeout: 5000 }).toBe(true)
	await expect.poll(() => fallbackAttempted, { timeout: 5000 }).toBe(true)
	await expect(page.getByText('Presigned uploads are not supported here. Falling back to staging uploads.')).toBeVisible()
	await expect.poll(() => commitCalled, { timeout: 5000 }).toBe(true)
	expect(presignedUrlHit).toBe(false)
})

test('shows upload error when presigned request fails (CORS-like failure)', async ({ page }) => {
	const now = '2024-01-01T00:00:00Z'
	const uploadId = 'upload-cors'
	const presignedURL = 'https://presigned.example/upload/test'
	let presignRequested = false
	let presignedUploadAttempted = false
	let commitCalled = false

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
				body: JSON.stringify({ uploadId, mode: 'presigned', maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }),
			})
		}

		if (method === 'POST' && path === `/api/v1/uploads/${uploadId}/presign`) {
			presignRequested = true
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					mode: 'single',
					bucket: defaultStorage.bucket,
					key: 'hello.txt',
					method: 'PUT',
					url: presignedURL,
					headers: {},
					expiresAt: '2025-01-01T00:00:00Z',
				}),
			})
		}

		if (method === 'POST' && path === `/api/v1/uploads/${uploadId}/commit`) {
			commitCalled = true
			return route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ jobId: 'job-cors' }),
			})
		}

		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	})

	await page.route(presignedURL, async (route) => {
		presignedUploadAttempted = true
		return route.abort('failed')
	})

	await seedStorage(page)
	await page.goto('/objects')
	await dropSingleFile(page, 'hello.txt', 'hello', 'text/plain')

	await expect.poll(() => presignRequested, { timeout: 5000 }).toBe(true)
	await expect.poll(() => presignedUploadAttempted, { timeout: 5000 }).toBe(true)
	await expect(page.getByText('network error', { exact: true })).toBeVisible()
	expect(commitCalled).toBe(false)
})
