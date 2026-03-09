import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'

const now = '2024-01-01T00:00:00Z'
const profileId = 'jobs-overlay-profile'
const bucket = 'jobs-overlay-bucket'

type JobRecord = {
	id: string
	type: string
	status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
	payload: Record<string, unknown>
	progress: null
	createdAt: string
	startedAt: string | null
	finishedAt: string | null
	errorCode?: string | null
	error: string | null
}

const uploadJob: JobRecord = {
	id: 'job-upload-success',
	type: 'transfer_sync_staging_to_s3',
	status: 'succeeded',
	payload: {
		bucket,
		prefix: 'exports/',
		rootKind: 'folder',
		rootName: 'camera-roll',
		totalFiles: 2,
		totalBytes: 30,
		items: [
			{ path: 'camera-roll/alpha.txt', key: 'exports/camera-roll/alpha.txt', size: 10 },
			{ path: 'camera-roll/beta.txt', key: 'exports/camera-roll/beta.txt', size: 20 },
		],
	},
	progress: null,
	createdAt: now,
	startedAt: now,
	finishedAt: now,
	errorCode: null,
	error: null,
}

const failedJob: JobRecord = {
	id: 'job-failed-logs',
	type: 'transfer_delete_prefix',
	status: 'failed',
	payload: { bucket, prefix: 'archive/' },
	progress: null,
	createdAt: now,
	startedAt: now,
	finishedAt: now,
	errorCode: 'job_failed',
	error: 'simulated failure',
}

async function seedStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId,
		bucket,
	})
}

async function mockJobsOverlayApi(page: Page) {
	const jobs = [uploadJob, failedJob]

	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', metaJson({ dataDir: '/tmp', staticDir: '/tmp' })),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: profileId,
				provider: 's3_compatible',
				name: 'Jobs Overlay Profile',
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: now,
				updatedAt: now,
			},
		]),
		jsonFixture('GET', '/api/v1/buckets', [{ name: bucket, createdAt: now }]),
		jsonFixture('GET', '/api/v1/jobs', { items: jobs, nextCursor: null }),
		{
			method: 'GET',
			path: /^\/api\/v1\/jobs\/([^/]+)$/,
			handler: ({ path }) => {
				const jobId = path.match(/^\/api\/v1\/jobs\/([^/]+)$/)?.[1] ?? ''
				const job = jobs.find((entry) => entry.id === jobId)
				return job
					? { json: job }
					: { status: 404, json: { error: { code: 'not_found', message: 'not found' } } }
			},
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/jobs\/([^/]+)\/logs$/,
			handler: ({ path, url }) => {
				const jobId = path.match(/^\/api\/v1\/jobs\/([^/]+)\/logs$/)?.[1] ?? ''
				if (url.searchParams.has('afterOffset')) {
					return {
						status: 204,
						headers: { 'x-log-next-offset': url.searchParams.get('afterOffset') ?? '0' },
						body: '',
					}
				}
				const body =
					jobId === failedJob.id
						? '2024-01-01T00:00:00Z start\n2024-01-01T00:00:01Z failed: delete prefix\n'
						: '2024-01-01T00:00:00Z queued upload\n'
				return {
					headers: { 'content-type': 'text/plain', 'x-log-next-offset': String(body.length) },
					body,
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/meta`,
			handler: ({ url }) => {
				const key = url.searchParams.get('key')
				return {
					json: {
						bucket,
						key,
						size: key?.includes('alpha') ? 10 : 20,
						lastModified: now,
						etag: key?.includes('alpha') ? 'etag-alpha' : 'etag-beta',
					},
				}
			},
		},
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

test.describe('Jobs overlays', () => {
	test('opens details drawer and renders upload details from the lazy overlay host', async ({ page }) => {
		await seedStorage(page)
		await mockJobsOverlayApi(page)

		await page.goto('/jobs')
		const uploadRow = page.getByRole('row', { name: /job-upload-success/i })
		await uploadRow.getByRole('button', { name: 'More actions' }).click()
		await page.getByRole('menuitem', { name: 'Details' }).click()

		const drawer = page.getByRole('dialog', { name: 'Job Details' })
		await expect(drawer).toBeVisible()
		await drawer.getByText('Upload details').click()
		await expect(drawer.getByText('folder camera-roll')).toBeVisible()
		await expect(drawer.getByText('alpha.txt')).toBeVisible()
		await expect(drawer.getByText('etag-alpha')).toBeVisible()
	})

	test('opens logs drawer and filters visible log lines through the lazy overlay host', async ({ page }) => {
		await seedStorage(page)
		await mockJobsOverlayApi(page)

		await page.goto('/jobs')
		const failedRow = page.getByRole('row', { name: /job-failed-logs/i })
		await failedRow.getByRole('button', { name: 'More actions' }).click()
		await page.getByRole('menuitem', { name: 'Logs' }).click()

		const drawer = page.getByRole('dialog', { name: 'Job Logs' })
		await expect(drawer).toBeVisible()
		await expect(drawer.getByText('failed: delete prefix')).toBeVisible()
		await drawer.getByRole('textbox', { name: 'Search logs' }).fill('delete')
		await expect(drawer.getByText(/Matches: 1/)).toBeVisible()
		await expect(drawer.getByText('start')).toHaveCount(0)
	})
})
