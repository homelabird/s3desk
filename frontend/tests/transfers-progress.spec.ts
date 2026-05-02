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
import {
	clickTransferRowButton,
	dropFileIntoObjectsUploadZone,
	expectTransferRowState,
	gotoObjectsUploadPage,
	openTransfersUploadRow,
	setFilesFromNextChooser,
} from './support/ui'

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
	await seedLocalStorage(page, {
		...defaultStorage,
		objectsUIMode: 'simple',
		...overrides,
	})
}

function buildUploadRoutes(args: {
	now: string
	sseBody: string
	uploadId: string
	jobBodies: Record<string, Record<string, unknown>>
	onCommit: () => { jobId: string }
}) {
	return [
		{
			method: 'GET',
			path: '/events',
			handle: ({ text }) => text(args.sseBody, 200, 'text/event-stream'),
		},
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
						id: defaultStorage.profileId,
						createdAt: args.now,
						updatedAt: args.now,
					}),
				]),
		},
		{
			method: 'GET',
			path: '/buckets',
			handle: ({ json }) => json([buildBucketFixture(defaultStorage.bucket, { createdAt: args.now })]),
		},
		{
			method: 'GET',
			path: `/buckets/${defaultStorage.bucket}/objects`,
			handle: ({ json }) => json(buildObjectsListFixture({ bucket: defaultStorage.bucket })),
		},
		{
			method: 'GET',
			path: `/buckets/${defaultStorage.bucket}/objects/favorites`,
			handle: ({ json }) => json(buildFavoritesFixture({ bucket: defaultStorage.bucket })),
		},
		{
			method: 'POST',
			path: '/uploads',
			handle: ({ json }) => json({ uploadId: args.uploadId, maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }, 201),
		},
		{
			method: 'POST',
			path: `/uploads/${args.uploadId}/files`,
			handle: ({ empty }) => empty(),
		},
		{
			method: 'POST',
			path: `/uploads/${args.uploadId}/commit`,
			handle: ({ json }) => json(args.onCommit(), 201),
		},
		...Object.entries(args.jobBodies).map(([jobId, body]) => ({
			method: 'GET' as const,
			path: `/jobs/${jobId}`,
			handle: ({ json }: { json: (body: unknown, status?: number) => Promise<void> }) => json(body),
		})),
	]
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

	await installMockApi(
		page,
		buildUploadRoutes({
			now,
			sseBody,
			uploadId,
			jobBodies: {
				[jobId]: { status: 'running', progress: { bytesDone: 2048, bytesTotal: 4096, speedBps: 1024, etaSeconds: 2 } },
			},
			onCommit: () => {
				uploadCommitted = true
				return { jobId }
			},
		}),
	)

	await seedStorage(page)
	await gotoObjectsUploadPage(page)
	await expect(page.getByTestId('objects-upload-dropzone')).toBeVisible({ timeout: 10_000 })

	await dropFileIntoObjectsUploadZone(page, {
		name: 'hello.txt',
		contents: 'hello',
		type: 'text/plain',
	})

	await expect.poll(() => uploadCommitted, { timeout: 5000 }).toBe(true)

	const { row } = await openTransfersUploadRow(page, 'Upload: hello.txt', { triggerButtonName: /Transfers/i, timeout: 5000 })
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

	await installMockApi(
		page,
		buildUploadRoutes({
			now,
			sseBody,
			uploadId,
			jobBodies: {
				[jobId]: {
					status: 'failed',
					error: 'simulated failure',
					progress: { bytesDone: 1024, bytesTotal: 4096, speedBps: 512, etaSeconds: 6 },
				},
				[retryJobId]: {
					status: 'running',
					progress: { bytesDone: 2048, bytesTotal: 4096, speedBps: 1024, etaSeconds: 2 },
				},
			},
			onCommit: () => {
				commitCount += 1
				uploadCommitted = true
				return { jobId: commitCount === 1 ? jobId : retryJobId }
			},
		}),
	)

	await seedStorage(page)
	await gotoObjectsUploadPage(page)
	await expect(page.getByTestId('objects-upload-dropzone')).toBeVisible({ timeout: 10_000 })

	await dropFileIntoObjectsUploadZone(page, {
		name: 'broken.txt',
		contents: 'broken',
		type: 'text/plain',
	})

	await expect.poll(() => uploadCommitted, { timeout: 5000 }).toBe(true)

	const { row } = await openTransfersUploadRow(page, 'Upload: broken.txt', { triggerButtonName: /Transfers/i, timeout: 5000 })
	await expectTransferRowState(row, 'Failed')
	await expect(row.getByText('simulated failure')).toBeVisible()

	await setFilesFromNextChooser(
		page,
		{ name: 'broken.txt', mimeType: 'text/plain', buffer: Buffer.from('broken') },
		async () => {
			await clickTransferRowButton(row, 'Retry')
		},
	)
	await expect(row.getByText('Transferring', { exact: true })).toBeVisible()
})
