import path from 'path'
import { fileURLToPath } from 'url'
import { stat } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { buildProfileFixture, installMockApi, metaJson, seedLocalStorage } from './support/apiFixtures'
import { addUploadSourceFromDevice, clickTransferRowButton, expectTransferRowState, gotoUploadsPage, openTransfersUploadRow, queueSelectedUpload } from './support/ui'

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
					buildProfileFixture({
						id: 'playwright-profile',
						name: 'Playwright',
						endpoint: 'http://localhost:9000',
						region: 'us-east-1',
						forcePathStyle: true,
						tlsInsecureSkipVerify: true,
						createdAt: '2024-01-01T00:00:00Z',
						updatedAt: '2024-01-01T00:00:00Z',
					}),
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
	await gotoUploadsPage(page)

	await addUploadSourceFromDevice(page, fixtureRoot, { chooseButtonName: 'Choose folder' })

	await queueSelectedUpload(page)

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

	const { row } = await openTransfersUploadRow(page, /upload-folder/, {
		triggerButtonName: 'Open Transfers',
		timeout: 10_000,
	})
	await expectTransferRowState(row, 'Done', { timeout: 10_000 })
})

test('restored mixed-size uploads retry every file after the old session expires', async ({ page }) => {
	const files = await Promise.all(['dir-a/alpha.txt', 'dir-b/nested/beta.txt'].map(async (relativePath) => ({
		path: relativePath, size: (await stat(path.join(fixtureRoot, relativePath))).size,
	})))
	let commitBody: Record<string, unknown> | null = null
	await mockUploadsFolderApi(page, {
		captureUploadAttempt: () => {},
		captureCommitBody: (body) => { commitBody = body },
	})
	await page.route('**/api/v1/uploads/expired-upload/chunks**', (route) => route.fulfill({
		status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_found', message: 'Upload session expired' } }),
	}))
	await seedStorage(page)
	await page.addInitScript(({ files }) => {
		sessionStorage.setItem('transfersHistoryV1', JSON.stringify({
			version: 1, savedAtMs: Date.now(), downloads: [], uploads: [{
				id: 'restore-upload', profileId: 'playwright-profile', bucket: 'test-bucket', prefix: '',
				label: 'Recover mixed folder', fileCount: files.length, status: 'staging', createdAtMs: Date.now(),
				loadedBytes: 0, totalBytes: files.reduce((sum, file) => sum + file.size, 0), speedBps: 0, etaSeconds: 0,
				uploadId: 'expired-upload', uploadMode: 'staging', filePaths: files.map((file) => file.path),
				resumeFiles: [{ ...files[0], chunkSizeBytes: 4 * 1024 * 1024 }],
			}],
		}))
	}, { files })
	await gotoUploadsPage(page)
	const { row } = await openTransfersUploadRow(page, 'Recover mixed folder', { triggerButtonName: 'Transfers' })
	await expectTransferRowState(row, 'Canceled')
	const chooser = page.waitForEvent('filechooser')
	await clickTransferRowButton(row, 'Retry')
	await (await chooser).setFiles(fixtureRoot)
	await expectTransferRowState(row, 'Done', { timeout: 10000 })
	expect(commitBody).toMatchObject({ totalFiles: 2, totalBytes: files.reduce((sum, file) => sum + file.size, 0), items: files })
})
