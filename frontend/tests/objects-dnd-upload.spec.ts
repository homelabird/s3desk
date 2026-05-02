import { expect, test, type Page } from '@playwright/test'

import { installMockApi } from './support/apiFixtures'
import { dropFileIntoObjectsUploadZone, gotoObjectsUploadBucketPage } from './support/ui'
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

	await installMockApi(page, [
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
					capabilities: { profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' } },
					allowedLocalDirs: [],
					jobConcurrency: 2,
					jobLogMaxBytes: null,
					jobRetentionSeconds: null,
					uploadSessionTTLSeconds: 86400,
					uploadMaxBytes: null,
					transferEngine: { name: 'rclone', available: true, path: '/usr/local/bin/rclone', version: 'v1.66.0' },
				}),
		},
		{
			method: 'GET',
			path: '/profiles',
			handle: (ctx) =>
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
			handle: (ctx) => ctx.json([{ name: defaultStorage.bucket, createdAt: now }]),
		},
		{
			method: 'GET',
			path: `/buckets/${defaultStorage.bucket}/objects`,
			handle: (ctx) =>
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
			handle: (ctx) =>
				ctx.json({
					bucket: defaultStorage.bucket,
					prefix: '',
					items: [],
				}),
		},
		{
			method: 'POST',
			path: '/uploads',
			handle: (ctx) => ctx.json({ uploadId, maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }, 201),
		},
		{
			method: 'POST',
			path: `/uploads/${uploadId}/files`,
			handle: (ctx) => ctx.empty(),
		},
		{
			method: 'POST',
			path: `/uploads/${uploadId}/commit`,
			handle: (ctx) => {
				uploadCommitted = true
				return ctx.json({ jobId: 'job-test' }, 201)
			},
		},
		{
			path: /.*/,
			handle: (ctx) => ctx.json({}),
		},
	])

	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))

	await seedStorage(page)
	await gotoObjectsUploadBucketPage(page, defaultStorage.bucket)

	await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
	await dropFileIntoObjectsUploadZone(page, {
		name: 'hello.txt',
		contents: 'hello',
		type: 'text/plain',
		fullPath: '/dir/hello.txt',
		assertEntryBinding: true,
		dropEffect: 'none',
	})

	await expect.poll(() => uploadCommitted, { timeout: 5000 }).toBe(true)
	expect(errors).toEqual([])
})
