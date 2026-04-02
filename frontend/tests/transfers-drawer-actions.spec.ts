import path from 'path'
import { fileURLToPath } from 'url'

import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildMetaFixture,
	buildProfileFixture,
	installMockApi,
	seedLocalStorage,
} from './support/apiFixtures'
import { ensureDialogOpen, transferUploadRow } from './support/ui'

const now = '2024-01-01T00:00:00Z'
const profileId = 'transfers-actions-profile'
const bucket = 'transfers-actions-bucket'
const testDir = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.join(testDir, 'fixtures', 'upload-folder')

async function seedStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId,
		bucket,
		objectsUIMode: 'simple',
	})
}

function buildSucceededUploadJob(jobId: string) {
	return {
		id: jobId,
		type: 'transfer_sync_staging_to_s3',
		status: 'succeeded',
		payload: {
			bucket,
			prefix: '',
			rootName: 'upload-folder',
			rootKind: 'folder',
			totalFiles: 2,
			totalBytes: 9,
		},
		progress: { bytesDone: 9, bytesTotal: 9 },
		createdAt: now,
		startedAt: now,
		finishedAt: now,
		error: null,
	}
}

async function installTransfersActionApi(page: Page) {
	let uploadCount = 0
	let filesAttemptCount = 0
	let commitCount = 0

	await installMockApi(page, [
		{
			method: 'GET',
			path: '/meta',
			handle: ({ json }) => json(buildMetaFixture()),
		},
		{
			method: 'GET',
			path: '/profiles',
			handle: ({ json }) =>
				json([
					buildProfileFixture({
						id: profileId,
						name: 'Transfers Actions',
						createdAt: now,
						updatedAt: now,
					}),
				]),
		},
		{
			method: 'GET',
			path: '/buckets',
			handle: ({ json }) => json([buildBucketFixture(bucket, { createdAt: now })]),
		},
		{
			method: 'GET',
			path: '/events',
			handle: ({ text }) => text('forbidden', 403),
		},
		{
			method: 'POST',
			path: '/uploads',
			handle: ({ json }) => {
				uploadCount += 1
				return json({ uploadId: `upload-${uploadCount}`, maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }, 201)
			},
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/uploads\/([^/]+)\/files$/,
			handle: async (ctx) => {
				filesAttemptCount += 1
				if (filesAttemptCount === 1) {
					await ctx.delay(15_000)
				}
				return ctx.empty()
			},
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/uploads\/([^/]+)\/commit$/,
			handle: ({ json }) => {
				commitCount += 1
				return json({ jobId: `job-upload-${commitCount}` }, 201)
			},
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/jobs\/([^/]+)$/,
			handle: ({ path, json }) => {
				const jobId = path.match(/^\/api\/v1\/jobs\/([^/]+)$/)?.[1] ?? 'job-upload-1'
				return json(buildSucceededUploadJob(jobId))
			},
		},
	])

	return {
		getCommitCount: () => commitCount,
	}
}

test('transfers drawer cancels, retries, and clears completed uploads', async ({ page }) => {
	test.setTimeout(45_000)

	const apiState = await installTransfersActionApi(page)
	await seedStorage(page)
	await page.addInitScript(() => {
		Reflect.deleteProperty(window, 'showDirectoryPicker')
	})
	await page.goto('/uploads')
	await expect(page.getByRole('heading', { name: 'Uploads' })).toBeVisible()

	await page.getByRole('button', { name: /Add from device/i }).click()
	const sourceDialog = page.getByRole('dialog', { name: 'Add upload source' })
	await expect(sourceDialog).toBeVisible()
	const chooserPromise = page.waitForEvent('filechooser')
	await sourceDialog.getByRole('button', { name: 'Choose folder' }).click()
	const chooser = await chooserPromise
	await chooser.setFiles(fixtureRoot)

	const queueButton = page.getByRole('button', { name: /Queue upload/i })
	await expect(queueButton).toBeEnabled({ timeout: 10_000 })
	await queueButton.click()

	const transfersDialog = await ensureDialogOpen(page, /Transfers/i, async () => {
		await page.getByRole('button', { name: 'Open Transfers' }).click({ force: true })
	})
	await transfersDialog.getByRole('tab', { name: /Uploads/i }).click()

	const row = transferUploadRow(transfersDialog, 'upload-folder')
	await expect(row).toBeVisible({ timeout: 10_000 })
	await expect(row.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 10_000 })

	await row.getByRole('button', { name: 'Cancel' }).click()
	await expect(row.getByText('Canceled', { exact: true })).toBeVisible()
	await expect(row.getByRole('button', { name: 'Retry' })).toBeVisible()

	await row.getByRole('button', { name: 'Retry' }).click()
	await expect(row.getByText('Done', { exact: true })).toBeVisible({ timeout: 10_000 })
	await expect.poll(() => apiState.getCommitCount(), { timeout: 10_000 }).toBe(1)

	await expect(transfersDialog.getByRole('button', { name: 'Clear done' })).toBeEnabled()
	await transfersDialog.getByRole('button', { name: 'Clear done' }).click()

	await expect(row).toHaveCount(0)
	await expect(transfersDialog.getByText('No uploads yet')).toBeVisible()
})
