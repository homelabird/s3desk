import path from 'path'
import { fileURLToPath } from 'url'

import { expect, test } from '@playwright/test'

import { installMockApi, metaJson, seedLocalStorage } from './support/apiFixtures'
import { ensureDialogOpen, transferUploadRow } from './support/ui'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.join(testDir, 'fixtures', 'upload-folder')

async function seedStorage(page: Parameters<typeof seedLocalStorage>[0]) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId: 'playwright-profile',
		bucket: 'test-bucket',
	})
}

async function mockUploadsFolderApi(
	page: Parameters<typeof installMockApi>[0],
	args: {
		captureUploadAttempt: (attempt: { relativePath: string | null }) => void
		captureCommitBody: (body: Record<string, unknown>) => void
	},
) {
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
			path: '/events',
			handle: (ctx) => ctx.text('forbidden', 403, 'text/event-stream'),
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
				const headers = ctx.request.headers()
				args.captureUploadAttempt({
					relativePath: headers['x-upload-relative-path'] ?? null,
				})
				await ctx.empty()
			},
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/uploads\/[^/]+\/commit$/,
			handle: async (ctx) => {
				args.captureCommitBody((ctx.request.postDataJSON() as Record<string, unknown> | null) ?? {})
				await ctx.json({ jobId: 'job-test' }, 201)
			},
		},
		{
			method: 'GET',
			path: '/jobs/job-test',
			handle: (ctx) =>
				ctx.json({
					id: 'job-test',
					type: 'transfer_sync_staging_to_s3',
					status: 'succeeded',
					payload: {
						bucket: 'test-bucket',
						prefix: '',
						rootName: 'upload-folder',
						rootKind: 'folder',
						totalFiles: 2,
						totalBytes: 9,
					},
					progress: { bytesDone: 9, bytesTotal: 9 },
					createdAt: '2024-01-01T00:00:00Z',
					startedAt: '2024-01-01T00:00:00Z',
					finishedAt: '2024-01-01T00:00:01Z',
					error: null,
				}),
		},
	])
}

test('folder upload preserves relative paths', async ({ page }) => {
	const uploadAttempts: Array<{ relativePath: string | null }> = []
	let commitBody: Record<string, unknown> | null = null
	await mockUploadsFolderApi(page, {
		captureUploadAttempt: (attempt) => {
			uploadAttempts.push(attempt)
		},
		captureCommitBody: (body) => {
			commitBody = body
		},
	})
	await seedStorage(page)
	await page.addInitScript(() => {
		Reflect.deleteProperty(window, 'showDirectoryPicker')
	})
	await page.goto('/uploads')

	await page.getByRole('button', { name: 'Add from device…' }).click()
	const chooserPromise = page.waitForEvent('filechooser')
	await page.getByRole('button', { name: 'Choose folder' }).click()
	const chooser = await chooserPromise
	await chooser.setFiles(fixtureRoot)

	const queueButton = page.getByRole('button', { name: /Queue upload/i })
	await expect(queueButton).toBeEnabled()
	await queueButton.click()

	await expect.poll(() => uploadAttempts.length, { timeout: 5000 }).toBeGreaterThan(0)
	await expect.poll(() => commitBody, { timeout: 5000 }).not.toBeNull()
	expect((commitBody?.items as Array<{ path?: string }> | undefined) ?? []).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ path: 'dir-a/alpha.txt' }),
			expect.objectContaining({ path: 'dir-b/nested/beta.txt' }),
		]),
	)
	expect(JSON.stringify(commitBody)).not.toContain('upload-folder/dir-a/alpha.txt')
	expect(JSON.stringify(commitBody)).not.toContain('upload-folder/dir-b/nested/beta.txt')

	const transfersDialog = await ensureDialogOpen(page, /Transfers/i, async () => {
		await page.getByRole('button', { name: 'Open Transfers' }).click({ force: true })
	})
	await transfersDialog.getByRole('tab', { name: /Uploads/i }).click()
	const row = transferUploadRow(transfersDialog, /upload-folder/)
	await expect(row).toBeVisible({ timeout: 10_000 })
	await expect(row.getByText('Done', { exact: true })).toBeVisible({ timeout: 10_000 })
})
