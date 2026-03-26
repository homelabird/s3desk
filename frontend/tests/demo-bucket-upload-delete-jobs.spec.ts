import path from 'path'
import { fileURLToPath } from 'url'

import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installMockApi,
	seedLocalStorage,
} from './support/apiFixtures'
import { ensureDialogOpen, transferUploadRow } from './support/ui'

type ObjectItem = {
	key: string
	size: number
	lastModified: string
}

type UploadSession = {
	bucket: string
	prefix: string
	filename: string
	size: number
}

type DemoJob = {
	id: string
	type: string
	status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
	payload: Record<string, unknown>
	progress: null
	createdAt: string
	startedAt: string | null
	finishedAt: string | null
	error: string | null
}

const now = '2024-01-01T00:00:00Z'
const profileId = 'demo-profile'
const profileName = 'Demo AWS Profile'
const bucketName = 'demo-bucket'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const uploadFixture = path.join(testDir, 'fixtures', 'upload-folder', 'dir-a', 'alpha.txt')
const uploadFilename = 'alpha.txt'
const uploadSize = 6

test.use({
	viewport: { width: 1920, height: 1080 },
	video: { mode: 'on', size: { width: 1920, height: 1080 } },
})

async function seedStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId,
		bucket: '',
		prefix: '',
		objectsUIMode: 'simple',
	})
}

function buildUploadJob(jobId: string): DemoJob {
	return {
		id: jobId,
		type: 'transfer_sync_staging_to_s3',
		status: 'succeeded',
		payload: {
			bucket: bucketName,
			prefix: '',
			rootName: uploadFilename,
			rootKind: 'file',
			totalFiles: 1,
			totalBytes: uploadSize,
		},
		progress: null,
		createdAt: now,
		startedAt: now,
		finishedAt: now,
		error: null,
	}
}

async function installDemoApi(page: Page) {
	const buckets: Array<{ name: string; createdAt: string }> = []
	const objectsByBucket = new Map<string, ObjectItem[]>()
	const uploads = new Map<string, UploadSession>()
	const jobs: DemoJob[] = []
	let uploadCounter = 0
	let jobCounter = 0

	await installMockApi(page, [
		{
			method: 'GET',
			path: '/meta',
			handle: ({ json }) =>
				json(
					buildMetaFixture({
						transferEngine: { name: 'rclone', available: true, path: '/usr/local/bin/rclone', version: 'v1.66.0' },
					}),
				),
		},
		{
			method: 'GET',
			path: '/events',
			handle: ({ text }) => text('forbidden', 403, 'text/plain'),
		},
		{
			method: 'GET',
			path: '/profiles',
			handle: ({ json }) =>
				json([
					buildProfileFixture({
						id: profileId,
						name: profileName,
						provider: 'aws_s3',
						endpoint: 'http://demo-s3.local',
						region: 'us-east-1',
						createdAt: now,
						updatedAt: now,
					}),
				]),
		},
		{
			method: 'GET',
			path: '/buckets',
			handle: ({ json }) => json(buckets.map((bucket) => buildBucketFixture(bucket.name, { createdAt: bucket.createdAt }))),
		},
		{
			method: 'POST',
			path: '/buckets',
			handle: ({ request, json }) => {
				const body = request.postDataJSON() as { name?: string }
				const name = body.name?.trim() || bucketName
				if (!buckets.some((entry) => entry.name === name)) {
					buckets.unshift({ name, createdAt: now })
					objectsByBucket.set(name, [])
				}
				return json({ name, createdAt: now }, 201)
			},
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/buckets\/([^/]+)\/objects$/,
			handle: ({ path, json }) => {
				const bucket = path.match(/^\/api\/v1\/buckets\/([^/]+)\/objects$/)?.[1] ?? ''
				const items = objectsByBucket.get(bucket) ?? []
				return json(
					buildObjectsListFixture({
						bucket,
						items,
					}),
				)
			},
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/buckets\/([^/]+)\/objects\/favorites$/,
			handle: ({ path, json }) => {
				const bucket = path.match(/^\/api\/v1\/buckets\/([^/]+)\/objects\/favorites$/)?.[1] ?? ''
				return json(buildFavoritesFixture({ bucket }))
			},
		},
		{
			method: 'DELETE',
			path: /^\/api\/v1\/buckets\/([^/]+)\/objects$/,
			handle: ({ path, request, json }) => {
				const bucket = path.match(/^\/api\/v1\/buckets\/([^/]+)\/objects$/)?.[1] ?? ''
				const body = (request.postDataJSON() as { keys?: string[] } | null) ?? null
				const keys = Array.isArray(body?.keys) ? body.keys : []
				const current = objectsByBucket.get(bucket) ?? []
				objectsByBucket.set(
					bucket,
					current.filter((item) => !keys.includes(item.key)),
				)
				return json({ deleted: keys.length })
			},
		},
		{
			method: 'POST',
			path: '/uploads',
			handle: ({ request, json }) => {
				const body = request.postDataJSON() as { bucket?: string; prefix?: string }
				uploadCounter += 1
				const uploadId = `upload-${uploadCounter}`
				uploads.set(uploadId, {
					bucket: body.bucket?.trim() || bucketName,
					prefix: body.prefix?.trim() || '',
					filename: uploadFilename,
					size: uploadSize,
				})
				return json({ uploadId, maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }, 201)
			},
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/uploads\/[^/]+\/files$/,
			handle: ({ empty }) => empty(),
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/uploads\/([^/]+)\/commit$/,
			handle: ({ path, json }) => {
				const uploadId = path.match(/^\/api\/v1\/uploads\/([^/]+)\/commit$/)?.[1] ?? ''
				const upload = uploads.get(uploadId)
				if (upload) {
					const key = `${upload.prefix}${upload.filename}`.replace(/^\/+/, '')
					const current = objectsByBucket.get(upload.bucket) ?? []
					if (!current.some((item) => item.key === key)) {
						current.unshift({
							key,
							size: upload.size,
							lastModified: now,
						})
						objectsByBucket.set(upload.bucket, current)
					}
				}
				jobCounter += 1
				const jobId = `job-upload-${jobCounter}`
				jobs.unshift(buildUploadJob(jobId))
				return json({ jobId }, 201)
			},
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/jobs$/,
			handle: ({ json }) => json({ items: jobs, nextCursor: null }),
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/jobs\/([^/]+)$/,
			handle: ({ path, json, notFound }) => {
				const jobId = path.match(/^\/api\/v1\/jobs\/([^/]+)$/)?.[1] ?? ''
				const job = jobs.find((entry) => entry.id === jobId)
				if (!job) return notFound()
				return json(job)
			},
		},
	])
}

async function linger(page: Page, ms = 700) {
	await page.waitForTimeout(ms)
}

test('demo flow: profile to jobs', async ({ page }) => {
	test.setTimeout(180_000)

	await installDemoApi(page)
	await seedStorage(page)

	console.log('[demo] profiles')
	await page.goto('/profiles')
	await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible()
	await expect(page.getByRole('row', { name: new RegExp(profileName) })).toBeVisible()
	await linger(page, 1200)

	console.log('[demo] buckets')
	await page.goto('/buckets')
	await expect(page.getByRole('heading', { name: 'Buckets' })).toBeVisible()
	await linger(page, 900)

	console.log('[demo] create bucket')
	await page.getByRole('button', { name: 'New Bucket' }).click()
	const bucketModal = page.getByRole('dialog', { name: 'Create Bucket' })
	await expect(bucketModal).toBeVisible()
	await bucketModal.getByLabel('Bucket name').fill(bucketName)
	await linger(page, 500)
	await bucketModal.getByRole('button', { name: 'Create' }).click()
	await expect(page.getByRole('row', { name: new RegExp(bucketName) })).toBeVisible()
	await linger(page, 1200)

	console.log('[demo] uploads')
	await page.goto('/uploads')
	await expect(page.getByRole('heading', { name: 'Uploads' })).toBeVisible()
	await page.getByRole('combobox', { name: 'Bucket' }).fill(bucketName)
	await page.keyboard.press('Enter')
	await linger(page, 700)

	console.log('[demo] choose upload file')
	await page.getByRole('button', { name: 'Add from device…' }).click()
	const chooserPromise = page.waitForEvent('filechooser')
	await page.getByRole('button', { name: 'Choose files' }).click()
	const chooser = await chooserPromise
	await chooser.setFiles(uploadFixture)
	await linger(page, 900)

	console.log('[demo] queue upload')
	await page.getByRole('button', { name: /Queue upload \(1\)/i }).click()
	console.log('[demo] wait upload done')
	const transfersDialog = await ensureDialogOpen(page, /Transfers/i, async () => {
		await page.getByRole('button', { name: 'Open Transfers' }).click({ force: true })
	})
	const uploadRow = transferUploadRow(transfersDialog, `Upload: ${uploadFilename}`)
	await expect(uploadRow).toBeVisible({ timeout: 15_000 })
	await expect(uploadRow.getByText('Done', { exact: true })).toBeVisible({ timeout: 15_000 })
	await linger(page, 1200)
	await transfersDialog.getByRole('button', { name: 'Close' }).click()

	console.log('[demo] objects')
	await page.goto('/objects')
	await expect(page.getByRole('heading', { name: 'Objects' })).toBeVisible()
	await page.getByTestId('objects-bucket-picker-desktop').click()
	await page.getByTestId(`objects-bucket-picker-option-${bucketName}`).click()
	const objectRow = page.locator('[data-objects-row="true"]', { hasText: uploadFilename }).first()
	await expect(objectRow).toBeVisible({ timeout: 15_000 })
	await linger(page, 1200)

	console.log('[demo] delete object')
	await objectRow.getByRole('checkbox', { name: `Select ${uploadFilename}` }).click()
	await expect(page.getByText('1 selected')).toBeVisible()
	await linger(page, 600)
	await page.getByRole('button', { name: /Delete/ }).last().click()
	const deleteDialog = page.getByRole('dialog', { name: 'Delete object?' })
	await expect(deleteDialog).toBeVisible()
	await deleteDialog.getByPlaceholder('DELETE').fill('DELETE')
	await linger(page, 400)
	await deleteDialog.getByRole('button', { name: 'Delete' }).click()
	await expect(page.locator('[data-objects-row="true"]', { hasText: uploadFilename })).toHaveCount(0, { timeout: 15_000 })
	await linger(page, 1200)

	console.log('[demo] jobs')
	await page.goto('/jobs')
	await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
	await expect(page.getByText('job-upload-1')).toBeVisible({ timeout: 15_000 })
	await linger(page, 1800)
})
