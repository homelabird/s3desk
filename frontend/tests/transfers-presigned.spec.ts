import { expect, test, type Page } from '@playwright/test'

import { installMockApi, type MockApiContext, type MockApiRoute } from './support/apiFixtures'
import { dropFileIntoObjectsUploadZone, expectTransferRowState, gotoObjectsUploadBucketPage, openTransfersUploadRow } from './support/ui'

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
const presignedPageReadyTimeoutMs = 30_000
const presignedPageReadyAttempts = 3
const presignedUploadTestTimeoutMs = 120_000

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
		window.localStorage.setItem('objectsUIMode', JSON.stringify('simple'))
	}, storage)
}

const now = '2024-01-01T00:00:00Z'

function baseObjectRoutes(): MockApiRoute[] {
	return [
		{
			method: 'GET',
			path: '/events',
			handle: (ctx: MockApiContext) =>
				ctx.route.fulfill({
					status: 200,
					headers: { 'content-type': 'text/event-stream' },
					body: '',
				}),
		},
		{
			method: 'GET',
			path: '/meta',
			handle: (ctx: MockApiContext) =>
				ctx.json({
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
		},
		{
			method: 'GET',
			path: '/profiles',
			handle: (ctx: MockApiContext) =>
				ctx.json([
					{
						id: defaultStorage.profileId,
						provider: 's3_compatible',
						name: 'Playwright',
						endpoint: 'http://localhost:9000',
						region: 'us-east-1',
						forcePathStyle: true,
						preserveLeadingSlash: false,
						tlsInsecureSkipVerify: true,
						createdAt: now,
						updatedAt: now,
					},
				]),
		},
		{
			method: 'GET',
			path: '/buckets',
			handle: (ctx: MockApiContext) =>
				ctx.json([{ name: defaultStorage.bucket, createdAt: now }]),
		},
		{
			method: 'GET',
			path: `/buckets/${defaultStorage.bucket}/objects`,
			handle: (ctx: MockApiContext) =>
				ctx.json({
					bucket: defaultStorage.bucket,
					prefix: '',
					delimiter: '/',
					commonPrefixes: [],
					items: [],
					nextContinuationToken: null,
					isTruncated: false,
				}),
		},
		{
			method: 'GET',
			path: `/buckets/${defaultStorage.bucket}/objects/favorites`,
			handle: (ctx: MockApiContext) =>
				ctx.json({
					bucket: defaultStorage.bucket,
					prefix: '',
					items: [],
				}),
		},
	]
}

test('falls back to staging when presigned upload is unsupported', async ({ page }) => {
	test.setTimeout(presignedUploadTestTimeoutMs)
	const uploadId = 'upload-fallback'
	const jobId = 'job-fallback'
	let presignedAttempted = false
	let fallbackAttempted = false
	let commitCalled = false
	let presignedUrlHit = false

	await installMockApi(page, [
		...baseObjectRoutes(),
		{
			method: 'POST',
			path: '/uploads',
			handle: (ctx) => {
				const body = ctx.request.postDataJSON() as { mode?: string }
				if (body?.mode === 'presigned') {
					presignedAttempted = true
					return ctx.json(
						{
							error: {
								code: 'not_supported',
								message: 'presigned uploads require an S3-compatible provider',
							},
						},
						400,
					)
				}
				fallbackAttempted = true
				return ctx.json({ uploadId, mode: 'staging', maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }, 201)
			},
		},
		{ method: 'POST', path: `/uploads/${uploadId}/files`, handle: (ctx) => ctx.empty() },
		{
			method: 'POST',
			path: `/uploads/${uploadId}/commit`,
			handle: (ctx) => {
				commitCalled = true
				return ctx.json({ jobId }, 201)
			},
		},
		{ method: 'GET', path: `/jobs/${jobId}`, handle: (ctx) => ctx.json({ status: 'running' }) },
	])

	await page.route('https://presigned.example/**', async (route) => {
		presignedUrlHit = true
		return route.fulfill({ status: 200 })
	})

	await seedStorage(page)
	await gotoObjectsUploadBucketPage(page, defaultStorage.bucket, {
		timeout: presignedPageReadyTimeoutMs,
		maxAttempts: presignedPageReadyAttempts,
		retryOnTimeout: true,
	})
	await dropFileIntoObjectsUploadZone(page, {
		name: 'hello.txt',
		contents: 'hello',
		type: 'text/plain',
	})

	await expect.poll(() => presignedAttempted, { timeout: 5000 }).toBe(true)
	await expect.poll(() => fallbackAttempted, { timeout: 5000 }).toBe(true)
	await expect(
		page.locator('.ant-message-notice-content').filter({
			hasText: 'Presigned uploads are not supported here. Falling back to staging uploads.',
		}).first(),
	).toBeVisible()
	await expect.poll(() => commitCalled, { timeout: 5000 }).toBe(true)
	expect(presignedUrlHit).toBe(false)
})

test('reconciles an ambiguous presigned response without proxy fallback', async ({ page }) => {
	test.setTimeout(presignedUploadTestTimeoutMs)
	const uploadId = 'upload-cors'
	const presignedURL = 'https://presigned.example/upload/test'
	let presignRequested = false
	let presignedUploadAttempts = 0
	let proxyUploadAttempted = false
	let commitCalled = false

	await installMockApi(page, [
		...baseObjectRoutes(),
		{
			method: 'POST',
			path: `/uploads/${uploadId}/files`,
			handle: (ctx) => {
				proxyUploadAttempted = true
				return ctx.empty()
			},
		},
		{
			method: 'POST',
			path: '/uploads',
			handle: (ctx) =>
				ctx.json({ uploadId, mode: 'presigned', maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }, 201),
		},
		{
			method: 'POST',
			path: `/uploads/${uploadId}/presign`,
			handle: (ctx) => {
				presignRequested = true
				return ctx.json({
					mode: 'single',
					bucket: defaultStorage.bucket,
					key: 'hello.txt',
					method: 'PUT',
					url: presignedURL,
					headers: {},
					expiresAt: '2025-01-01T00:00:00Z',
				})
			},
		},
		{
			method: 'POST',
			path: `/uploads/${uploadId}/commit`,
			handle: (ctx) => {
				commitCalled = true
				return ctx.json({ jobId: 'job-cors' }, 201)
			},
		},
	])

	await page.route(presignedURL, async (route) => {
		presignedUploadAttempts += 1
		return route.abort('failed')
	})

	await seedStorage(page)
	await gotoObjectsUploadBucketPage(page, defaultStorage.bucket, {
		timeout: presignedPageReadyTimeoutMs,
		maxAttempts: presignedPageReadyAttempts,
		retryOnTimeout: true,
	})
	await dropFileIntoObjectsUploadZone(page, {
		name: 'hello.txt',
		contents: 'hello',
		type: 'text/plain',
	})

	await expect.poll(() => presignRequested, { timeout: 5000 }).toBe(true)
	await expect.poll(() => presignedUploadAttempts, { timeout: 5000 }).toBe(2)
	await expect.poll(() => commitCalled, { timeout: 5000 }).toBe(true)
	expect(proxyUploadAttempted).toBe(false)
})

test('uses capability matrix to skip presigned mode for unsupported providers', async ({ page }) => {
	test.setTimeout(presignedUploadTestTimeoutMs)
	const uploadId = 'upload-capability'
	let profilesLoaded = false
	let presignedAttempted = false
	let stagingAttempted = false
	let commitCalled = false

	await installMockApi(page, [
		...baseObjectRoutes().filter((route) => route.path !== '/meta' && route.path !== '/profiles'),
		{
			method: 'GET',
			path: '/meta',
			handle: (ctx) =>
				ctx.json({
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
								objectCrud: true,
								jobTransfer: true,
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
		},
		{
			method: 'GET',
			path: '/profiles',
			handle: (ctx) => {
				profilesLoaded = true
				return ctx.json([
					{
						id: defaultStorage.profileId,
						provider: 'azure_blob',
						name: 'Playwright',
						accountName: 'playwright',
						accountKey: 'secret',
						createdAt: now,
						updatedAt: now,
					},
				])
			},
		},
		{
			method: 'POST',
			path: '/uploads',
			handle: (ctx) => {
				const body = ctx.request.postDataJSON() as { mode?: string }
				if (body?.mode === 'presigned') {
					presignedAttempted = true
					return ctx.json(
						{
							error: {
								code: 'not_supported',
								message: 'presigned uploads require an S3-compatible provider',
							},
						},
						400,
					)
				}
				if (body?.mode === 'staging') {
					stagingAttempted = true
				}
				return ctx.json({ uploadId, mode: body?.mode ?? 'staging', maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }, 201)
			},
		},
		{ method: 'POST', path: `/uploads/${uploadId}/files`, handle: (ctx) => ctx.empty() },
		{
			method: 'POST',
			path: `/uploads/${uploadId}/commit`,
			handle: (ctx) => {
				commitCalled = true
				return ctx.json({ jobId: 'job-capability' }, 201)
			},
		},
		{ method: 'GET', path: '/jobs/job-capability', handle: (ctx) => ctx.json({ status: 'running' }) },
	])

	await seedStorage(page)
	await gotoObjectsUploadBucketPage(page, defaultStorage.bucket, {
		timeout: presignedPageReadyTimeoutMs,
		maxAttempts: presignedPageReadyAttempts,
		retryOnTimeout: true,
	})
	await expect.poll(() => profilesLoaded, { timeout: 5000 }).toBe(true)
	await dropFileIntoObjectsUploadZone(page, {
		name: 'hello.txt',
		contents: 'hello',
		type: 'text/plain',
	})

	await expect.poll(() => stagingAttempted, { timeout: 5000 }).toBe(true)
	await expect.poll(() => commitCalled, { timeout: 5000 }).toBe(true)
	expect(presignedAttempted).toBe(false)
})
