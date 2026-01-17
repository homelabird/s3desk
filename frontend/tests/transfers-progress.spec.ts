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

test('upload transfer shows job progress from events', async ({ page }) => {
	const now = '2024-01-01T00:00:00Z'
	const uploadId = 'upload-test'
	const jobId = 'job-test'
	let uploadCommitted = false

	const sseBody = `id: 1\ndata: ${JSON.stringify({
		type: 'job.progress',
		jobId,
		payload: {
			status: 'running',
			progress: { bytesDone: 2048, bytesTotal: 4096, speedBps: 1024, etaSeconds: 2 },
		},
	})}\n\n`

	await page.route('**/api/v1/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())
		const path = url.pathname
		const method = request.method()

		if (method === 'GET' && path === '/api/v1/events') {
			return route.fulfill({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: sseBody,
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
				body: JSON.stringify({ jobId }),
			})
		}

		if (method === 'GET' && path === `/api/v1/jobs/${jobId}`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ status: 'running', progress: { bytesDone: 2048, bytesTotal: 4096, speedBps: 1024, etaSeconds: 2 } }),
			})
		}

		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	})

	await seedStorage(page)
	await page.goto('/objects')

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
			fullPath: '/hello.txt',
			name: 'hello.txt',
			file(success) {
				success(new File(['hello'], 'hello.txt', { type: 'text/plain' }))
			},
		}
		const item = { webkitGetAsEntry: () => entry }
		Object.defineProperty(dt, 'items', { value: [item] })
		Object.defineProperty(dt, 'files', { value: [] })
		Object.defineProperty(dt, 'types', { value: ['Files'] })
		return dt
	})

	await dropZone.dispatchEvent('dragenter', { dataTransfer })
	await dropZone.dispatchEvent('dragover', { dataTransfer })
	await dropZone.dispatchEvent('drop', { dataTransfer })

	await expect.poll(() => uploadCommitted, { timeout: 5000 }).toBe(true)

	const drawerMask = page.locator('.ant-drawer-mask').first()
	const drawerOpen = await drawerMask.isVisible().catch(() => false)
	if (!drawerOpen) {
		await page.getByRole('button', { name: /Transfers/i }).first().click()
	}
	await page.getByRole('tab', { name: /Uploads/i }).click()

	const labelNode = page.getByText('Upload: hello.txt', { exact: true })
	await labelNode.waitFor({ timeout: 5000 })
	const row = labelNode.locator('xpath=ancestor::div[contains(@style, "border: 1px solid")]').first()
	await expect(row.getByText(/eta/)).toBeVisible()
})

test('upload transfer shows failure and allows retry', async ({ page }) => {
	const now = '2024-01-01T00:00:00Z'
	const uploadId = 'upload-failed'
	const jobId = 'job-failed'
	const retryJobId = 'job-retry'
	let uploadCommitted = false
	let commitCount = 0

	const sseBody = `id: 1\ndata: ${JSON.stringify({
		type: 'job.progress',
		jobId,
		payload: {
			status: 'running',
			progress: { bytesDone: 1024, bytesTotal: 4096, speedBps: 512, etaSeconds: 6 },
		},
	})}\n\nid: 2\ndata: ${JSON.stringify({
		type: 'job.completed',
		jobId,
		payload: { status: 'failed', error: 'simulated failure' },
	})}\n\n`

	await page.route('**/api/v1/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())
		const path = url.pathname
		const method = request.method()

		if (method === 'GET' && path === '/api/v1/events') {
			return route.fulfill({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: sseBody,
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
			commitCount += 1
			const commitJobId = commitCount === 1 ? jobId : retryJobId
			uploadCommitted = true
			return route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ jobId: commitJobId }),
			})
		}

		if (method === 'GET' && path === `/api/v1/jobs/${jobId}`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					status: 'failed',
					error: 'simulated failure',
					progress: { bytesDone: 1024, bytesTotal: 4096, speedBps: 512, etaSeconds: 6 },
				}),
			})
		}

		if (method === 'GET' && path === `/api/v1/jobs/${retryJobId}`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					status: 'running',
					progress: { bytesDone: 2048, bytesTotal: 4096, speedBps: 1024, etaSeconds: 2 },
				}),
			})
		}

		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	})

	await seedStorage(page)
	await page.goto('/objects')

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
			fullPath: '/broken.txt',
			name: 'broken.txt',
			file(success) {
				success(new File(['broken'], 'broken.txt', { type: 'text/plain' }))
			},
		}
		const item = { webkitGetAsEntry: () => entry }
		Object.defineProperty(dt, 'items', { value: [item] })
		Object.defineProperty(dt, 'files', { value: [] })
		Object.defineProperty(dt, 'types', { value: ['Files'] })
		return dt
	})

	await dropZone.dispatchEvent('dragenter', { dataTransfer })
	await dropZone.dispatchEvent('dragover', { dataTransfer })
	await dropZone.dispatchEvent('drop', { dataTransfer })

	await expect.poll(() => uploadCommitted, { timeout: 5000 }).toBe(true)

	const drawerMask = page.locator('.ant-drawer-mask').first()
	const drawerOpen = await drawerMask.isVisible().catch(() => false)
	if (!drawerOpen) {
		await page.getByRole('button', { name: /Transfers/i }).first().click()
	}
	await page.getByRole('tab', { name: /Uploads/i }).click()

	const labelNode = page.getByText('Upload: broken.txt', { exact: true })
	await labelNode.waitFor({ timeout: 5000 })
	const row = labelNode.locator('xpath=ancestor::div[contains(@style, "border: 1px solid")]').first()
	await expect(row.getByText('Failed', { exact: true })).toBeVisible()
	await expect(row.getByText('simulated failure')).toBeVisible()

	await row.getByRole('button', { name: 'Retry' }).click()
	const fileInput = page.locator('input[type="file"]').first()
	const inputReady = await fileInput
		.waitFor({ state: 'attached', timeout: 1000 })
		.then(() => true)
		.catch(() => false)
	if (inputReady) {
		await fileInput.setInputFiles({ name: 'broken.txt', mimeType: 'text/plain', buffer: Buffer.from('broken') })
	}
	await expect(row.getByText('Transferring', { exact: true })).toBeVisible()
})
