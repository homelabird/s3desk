import path from 'path'
import { fileURLToPath } from 'url'

import { expect, test } from '@playwright/test'

import { installMockApi, metaJson, seedLocalStorage } from './support/apiFixtures'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.join(testDir, 'fixtures', 'upload-folder')

async function seedStorage(page: Parameters<typeof seedLocalStorage>[0]) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId: 'playwright-profile',
		bucket: 'test-bucket',
	})
}

async function mockUploadsFolderApi(page: Parameters<typeof installMockApi>[0], captureUploadBody: (body: string) => void) {
	await installMockApi(page, [
		{
			method: 'GET',
			path: '/meta',
			handle: (ctx) =>
				ctx.json(
					metaJson({
						dataDir: '/tmp',
						staticDir: '/tmp',
						capabilities: { profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' } },
						allowedLocalDirs: [],
						jobLogMaxBytes: null,
						jobRetentionSeconds: null,
						uploadSessionTTLSeconds: 86400,
						uploadMaxBytes: null,
					}),
				),
		},
		{
			method: 'GET',
			path: '/profiles',
			handle: (ctx) =>
				ctx.json([
					{
						id: 'playwright-profile',
						name: 'Playwright',
						endpoint: 'http://localhost:9000',
						region: 'us-east-1',
						forcePathStyle: true,
						tlsInsecureSkipVerify: true,
						createdAt: '2024-01-01T00:00:00Z',
						updatedAt: '2024-01-01T00:00:00Z',
					},
				]),
		},
		{
			method: 'GET',
			path: '/buckets',
			handle: (ctx) => ctx.json([{ name: 'test-bucket', createdAt: '2024-01-01T00:00:00Z' }]),
		},
		{
			method: 'POST',
			path: '/uploads',
			handle: (ctx) =>
				ctx.json(
					{
						uploadId: 'upload-test',
						maxBytes: null,
						expiresAt: '2025-01-01T00:00:00Z',
					},
					201,
				),
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/uploads\/[^/]+\/files$/,
			handle: async (ctx) => {
				const buffer = ctx.request.postDataBuffer()
				captureUploadBody(buffer ? buffer.toString('utf8') : '')
				await ctx.empty()
			},
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/uploads\/[^/]+\/commit$/,
			handle: async (ctx) => {
				await ctx.json({ jobId: 'job-test' }, 201)
			},
		},
	])
}

test('folder upload preserves relative paths', async ({ page }) => {
	let uploadBody = ''
	await mockUploadsFolderApi(page, (body) => {
		uploadBody = body
	})
	await seedStorage(page)
	await page.goto('/uploads')

	const folderSwitch = page.getByRole('switch', { name: 'Folder mode' })
	if ((await folderSwitch.getAttribute('aria-checked')) !== 'true') {
		await folderSwitch.click()
	}

	const input = page.locator('input[type="file"]').first()
	await input.setInputFiles(fixtureRoot)

	const queueButton = page.getByRole('button', { name: /Queue upload/i })
	await expect(queueButton).toBeEnabled()
	await queueButton.click()

	await expect.poll(() => uploadBody, { timeout: 5000 }).not.toBe('')
	expect(uploadBody).toMatch(/filename="[^"]*dir-a\/alpha\.txt"/)
	expect(uploadBody).toMatch(/filename="[^"]*dir-b\/nested\/beta\.txt"/)
})
