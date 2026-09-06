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
import {
	addUploadSourceFromDevice,
	clickTransferRowButton,
	expectTransferRowState,
	gotoUploadsPage,
	openTransfersUploadRow,
	queueSelectedUpload,
} from './support/ui'

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

async function installTransfersActionApi(page: Page, handedOff = false) {
	let uploadCount = 0
	let filesAttemptCount = 0
	let commitCount = 0
	let cancelCount = 0
	let canceled = false
	const getJob = (jobId: string) => ({
		...buildSucceededUploadJob(jobId),
		status: handedOff && jobId === 'job-upload-1' ? (canceled ? 'canceled' : 'running') : 'succeeded',
	})

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
					buildProfileFixture({ id: 'other-profile', name: 'Other profile' }),
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
				if (filesAttemptCount === 1 && !handedOff) {
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
			method: 'POST',
			path: '/jobs/job-upload-1/cancel',
			handle: ({ request, json }) => {
				expect(request.headers()['x-profile-id']).toBe(profileId)
				cancelCount += 1
				canceled = true
				return json(getJob('job-upload-1'))
			},
		},
		{
			method: 'GET',
			path: '/jobs',
			handle: ({ json }) => json({ items: Array.from({ length: commitCount }, (_, index) => getJob(`job-upload-${index + 1}`)), nextCursor: null }),
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/jobs\/([^/]+)$/,
			handle: ({ path, json }) => {
				const jobId = path.match(/^\/api\/v1\/jobs\/([^/]+)$/)?.[1] ?? 'job-upload-1'
				return json(getJob(jobId))
			},
		},
	])

	return {
		getCommitCount: () => commitCount,
		getCancelCount: () => cancelCount,
	}
}

test('transfers drawer cancels, retries, and clears completed uploads', async ({ page }) => {
	test.setTimeout(45_000)

	const apiState = await installTransfersActionApi(page)
	await seedStorage(page)
	await page.addInitScript(() => {
		Reflect.deleteProperty(window, 'showDirectoryPicker')
	})
	await gotoUploadsPage(page)

	await addUploadSourceFromDevice(page, fixtureRoot, { chooseButtonName: 'Choose folder' })

	await queueSelectedUpload(page, { timeout: 10_000 })

	const { dialog: transfersDialog, row } = await openTransfersUploadRow(page, 'upload-folder', {
		triggerButtonName: 'Open Transfers',
		timeout: 10_000,
	})
	await clickTransferRowButton(row, 'Cancel', { timeout: 10_000 })
	await expectTransferRowState(row, 'Canceled')

	await clickTransferRowButton(row, 'Retry')
	await expectTransferRowState(row, 'Done', { timeout: 10_000 })
	await expect.poll(() => apiState.getCommitCount(), { timeout: 10_000 }).toBe(1)

	await expect(transfersDialog.getByRole('button', { name: 'Clear done' })).toBeEnabled()
	await transfersDialog.getByRole('button', { name: 'Clear done' }).click()

	await expect(row).toHaveCount(0)
	await expect(transfersDialog.getByText('No uploads yet')).toBeVisible()
})

for (const { kind, missing } of [{ kind: 'upload', missing: false }, { kind: 'job_artifact', missing: false }, { kind: 'upload', missing: true }] as const) {
	test(`opens the linked job and switches profile from a ${kind} transfer${missing ? " with a missing job" : ""}`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await installTransfersActionApi(page)
		await seedStorage(page)
		if (missing) await page.route('**/jobs/linked-job', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_found', message: 'Job no longer exists' } }) }))
		await page.addInitScript(({ kind }) => {
			const task = {
				id: 'linked-transfer', profileId: 'other-profile', jobId: 'linked-job', label: 'linked-file.txt',
				status: 'succeeded', createdAtMs: Date.now(), finishedAtMs: Date.now(),
				loadedBytes: 9, totalBytes: 9, speedBps: 0, etaSeconds: 0,
			}
			sessionStorage.setItem('transfersHistoryV1', JSON.stringify({
				version: 1, savedAtMs: Date.now(),
				downloads: kind === 'job_artifact' ? [{ ...task, kind }] : [],
				uploads: kind === 'upload' ? [{ ...task, bucket: 'transfers-actions-bucket', prefix: '', fileCount: 1 }] : [],
			}))
		}, { kind })
		await gotoUploadsPage(page)
		await page.getByRole('button', { name: 'Transfers', exact: true }).click()
		const transfers = page.getByRole('dialog', { name: 'Transfers', exact: true })
		await transfers.getByRole('tab', { name: kind === 'upload' ? /Uploads/ : /Downloads/ }).click()
		const request = page.waitForRequest(req => req.url().endsWith('/jobs/linked-job'))
		await transfers.getByRole('button', { name: /^Jobs for/ }).click()
		expect((await request).headers()['x-profile-id']).toBe('other-profile')
		await expect(transfers).toHaveCount(0)
		await expect(page.getByRole('combobox', { name: 'Profile', exact: true })).toHaveValue('other-profile')
		const details = page.getByRole('dialog', { name: 'Job Details', exact: true })
		if (missing) {
			await expect(details.getByText('Failed to load job', { exact: true })).toBeVisible({ timeout: 15_000 })
			await details.getByRole('button', { name: 'Close', exact: true }).click()
			await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible()
			return
		}
		await expect(details.getByText('linked-job', { exact: true })).toBeVisible()
		await page.screenshot({ path: testInfo.outputPath('linked-job-details.png') })
		await details.getByRole('button', { name: 'Close', exact: true }).click()
		await page.getByRole('button', { name: 'Transfers', exact: true }).click()
		await transfers.getByRole('button', { name: /^Jobs for/ }).click()
		await expect(details.getByText('linked-job', { exact: true })).toBeVisible()
	})
}

test('transfers drawer preserves active jobs when clearing finished transfers, then cancels explicitly', async ({ page }, testInfo) => {
	const apiState = await installTransfersActionApi(page, true)
	await seedStorage(page)
	await page.addInitScript(() => {
		Reflect.deleteProperty(window, 'showDirectoryPicker')
	})
	await gotoUploadsPage(page)
	await addUploadSourceFromDevice(page, fixtureRoot, { chooseButtonName: 'Choose folder' })
	await queueSelectedUpload(page, { timeout: 10_000 })
	const { row } = await openTransfersUploadRow(page, 'upload-folder', {
		triggerButtonName: 'Open Transfers',
		timeout: 10_000,
	})
	await expectTransferRowState(row, 'Transferring')
	await expect(row.getByRole('button', { name: /^Remove / })).toHaveCount(0)
	await page.getByRole('dialog', { name: /Transfers/ }).getByRole('button', { name: 'Close', exact: true }).click()
	await addUploadSourceFromDevice(page, { name: 'finished.txt', mimeType: 'text/plain', buffer: Buffer.from('done') })
	await queueSelectedUpload(page, { count: 1 })
	const { dialog, row: finishedRow } = await openTransfersUploadRow(page, 'finished.txt', { triggerButtonName: 'Open Transfers' })
	await expectTransferRowState(finishedRow, 'Done')
	await dialog.getByRole('button', { name: 'Clear finished', exact: true }).click()
	await expect(finishedRow).toHaveCount(0)
	await expectTransferRowState(row, 'Transferring')
	await expect(dialog.getByText('1 active', { exact: true })).toBeVisible()
	expect(apiState.getCancelCount()).toBe(0)
	await page.screenshot({ path: testInfo.outputPath('transfers-clear-keeps-active.png') })
	await clickTransferRowButton(row, 'Cancel')
	await expect.poll(() => apiState.getCancelCount()).toBe(1)
	await expectTransferRowState(row, 'Canceled')
})
