import { expect, test, type Page } from '@playwright/test'
import { installMockApi } from './support/apiFixtures'

type StorageSeed = {
	apiToken: string
	profileId: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	profileId: 'playwright-profile',
}

const now = '2024-01-01T00:00:00Z'

const metaResponse = {
	version: 'test',
	serverAddr: '127.0.0.1:8080',
	dataDir: '/data',
	staticDir: '/app/ui',
	apiTokenEnabled: true,
	encryptionEnabled: false,
	capabilities: { profileTls: { enabled: false, reason: 'test' } },
	jobConcurrency: 2,
	uploadSessionTTLSeconds: 3600,
	transferEngine: { name: 'rclone', available: true, path: '/usr/local/bin/rclone', version: 'v1.66.0' },
}

const profilesResponse = [
	{
		id: defaultStorage.profileId,
		name: 'Playwright',
		endpoint: 'http://minio:9000',
		region: 'us-east-1',
		forcePathStyle: true,
		tlsInsecureSkipVerify: true,
		createdAt: now,
		updatedAt: now,
	},
]

const bucketResponse = [{ name: 'test-bucket', createdAt: now }]

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

type Job = {
	id: string
	type: string
	status: JobStatus
	payload: Record<string, unknown>
	progress: null | { objectsDone?: number; bytesDone?: number; bytesTotal?: number; speedBps?: number }
	createdAt: string
	startedAt: string | null
	finishedAt: string | null
	error: string | null
	errorCode?: string | null
}

function buildJob(
	id: string,
	type: string,
	status: JobStatus,
	payload: Record<string, unknown>,
	progress: Job['progress'] = null,
	error: string | null = null,
): Job {
	return {
		id,
		type,
		status,
		payload,
		progress,
		createdAt: now,
		startedAt: status === 'running' ? now : null,
		finishedAt: status === 'failed' || status === 'canceled' || status === 'succeeded' ? now : null,
		error,
	}
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
	}, storage)
}

async function setupApiMocks(page: Page) {
	let jobs: Job[] = [
		buildJob('job-local', 'transfer_sync_local_to_s3', 'succeeded', {
			bucket: 'test-bucket',
			prefix: 'uploads/',
			localPath: '/Users/test/uploads',
		}),
		buildJob('job-staging', 'transfer_sync_staging_to_s3', 'running', {
			bucket: 'test-bucket',
			prefix: 'uploads/',
			rootName: 'alpha.txt',
			totalFiles: 1,
			totalBytes: 5,
		}),
		buildJob(
			'job-download',
			'transfer_sync_s3_to_local',
			'running',
			{ bucket: 'test-bucket', prefix: 'reports/', localPath: '/Users/test/Downloads' },
			{ objectsDone: 3, bytesDone: 2048, speedBps: 512 },
		),
		buildJob(
			'job-copy',
			'transfer_copy_object',
			'failed',
			{ srcBucket: 'test-bucket', srcKey: 'alpha.txt', dstBucket: 'test-bucket', dstKey: 'alpha-copy.txt' },
			null,
			'simulated failure',
		),
		buildJob('job-delete', 'transfer_delete_prefix', 'queued', { bucket: 'test-bucket', prefix: 'tmp/', deleteAll: false }),
	]
	let retryCount = 0

	const addJob = (job: Job) => {
		jobs = [job, ...jobs]
	}

	const updateJob = (jobId: string, patch: Partial<Job>) => {
		jobs = jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job))
		return jobs.find((job) => job.id === jobId) ?? null
	}

	await installMockApi(page, [
		{ method: 'GET', path: '/meta', handle: (ctx) => ctx.json(metaResponse) },
		{ method: 'GET', path: '/profiles', handle: (ctx) => ctx.json(profilesResponse) },
		{ method: 'GET', path: '/buckets', handle: (ctx) => ctx.json(bucketResponse) },
		{
			method: 'GET',
			path: '/jobs',
			handle: (ctx) => {
				const status = ctx.url.searchParams.get('status')
				const type = ctx.url.searchParams.get('type')
				const errorCode = ctx.url.searchParams.get('errorCode')
				let items = jobs
				if (status) items = items.filter((job) => job.status === status)
				if (type) items = items.filter((job) => job.type.includes(type))
				if (errorCode) items = items.filter((job) => job.errorCode === errorCode)
				return ctx.json({ items, nextCursor: null })
			},
		},
		{
			method: 'POST',
			path: '/jobs',
			handle: (ctx) => ctx.json(buildJob('job-created', 'transfer_sync_staging_to_s3', 'queued', {}), 201),
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/jobs\/([^/]+)\/cancel$/,
			handle: (ctx) => {
				const match = ctx.path.match(/^\/api\/v1\/jobs\/([^/]+)\/cancel$/)
				const jobId = match?.[1] ?? ''
				const job = updateJob(jobId, { status: 'canceled', finishedAt: now })
				return job ? ctx.json(job) : ctx.notFound()
			},
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/jobs\/([^/]+)\/retry$/,
			handle: (ctx) => {
				const match = ctx.path.match(/^\/api\/v1\/jobs\/([^/]+)\/retry$/)
				const sourceId = match?.[1] ?? ''
				const source = jobs.find((job) => job.id === sourceId)
				const job = buildJob(`job-retry-${++retryCount}`, source?.type ?? 'transfer_copy_object', 'queued', source?.payload ?? {})
				addJob(job)
				return ctx.json(job)
			},
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/jobs\/([^/]+)$/,
			handle: (ctx) => {
				const match = ctx.path.match(/^\/api\/v1\/jobs\/([^/]+)$/)
				const jobId = match?.[1] ?? ''
				const job = jobs.find((item) => item.id === jobId)
				return job ? ctx.json(job) : ctx.notFound()
			},
		},
		{ method: 'GET', path: '/events', handle: (ctx) => ctx.text('forbidden', 403) },
	])
}

test('transfer scenarios cover job types, progress, cancel, and retry', async ({ page }) => {
	await seedStorage(page)
	await setupApiMocks(page)

	await page.goto('/jobs')
	await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()

	const localRow = page.getByRole('row', { name: /job-local/ })
	const stagingRow = page.getByRole('row', { name: /job-staging/ })
	const runningRow = page.getByRole('row', { name: /job-download/ })
	const failedRow = page.getByRole('row', { name: /job-copy/ })
	const deleteRow = page.getByRole('row', { name: /job-delete/ })

	await expect(localRow).toContainText(/Upload from device \u2192 S3/)
	await expect(stagingRow).toContainText(/Finalize upload \(staging \u2192 S3\)/)
	await expect(runningRow).toContainText(/Download folder \(S3 \u2192 device\)/)
	await expect(failedRow).toContainText('Copy object')
	await expect(deleteRow).toContainText('Delete folder/prefix')

	await expect(runningRow).toContainText('3 ops')
	await expect(failedRow).toContainText(/cp s3:\/\/test-bucket\/alpha\.txt/)
	await expect(deleteRow).toContainText(/rm s3:\/\/test-bucket\/tmp\//)

	await runningRow.getByRole('button', { name: 'More actions' }).click()
	await page.getByRole('menuitem', { name: 'Cancel' }).click()
	await expect(runningRow.getByText('canceled')).toBeVisible()

	await failedRow.getByRole('button', { name: 'Retry' }).click()
	await expect(page.getByRole('row', { name: /job-retry-1/ })).toBeVisible()
})
