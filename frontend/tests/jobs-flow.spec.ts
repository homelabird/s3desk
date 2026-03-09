import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, seedLocalStorage, textFixture } from './support/apiFixtures'

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

const bucketResponse = [{ name: defaultStorage.bucket, createdAt: now }]

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

type Job = {
	id: string
	type: string
	status: JobStatus
	payload: Record<string, unknown>
	progress: null
	createdAt: string
	startedAt: string | null
	finishedAt: string | null
	error: string | null
}

function buildJob(id: string, status: JobStatus, payload: Record<string, unknown>): Job {
	return {
		id,
		type: 'transfer_delete_prefix',
		status,
		payload,
		progress: null,
		createdAt: now,
		startedAt: status === 'running' ? now : null,
		finishedAt: status === 'failed' || status === 'canceled' || status === 'succeeded' ? now : null,
		error: status === 'failed' ? 'simulated failure' : null,
	}
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

async function setupApiMocks(page: Page) {
	let jobs: Job[] = [
		buildJob('job-running', 'running', { bucket: defaultStorage.bucket, prefix: 'running/' }),
		buildJob('job-failed', 'failed', { bucket: defaultStorage.bucket, prefix: 'failed/' }),
	]
	let retryCount = 0

	const addJob = (job: Job) => {
		jobs = [job, ...jobs]
	}

	const updateJob = (jobId: string, patch: Partial<Job>) => {
		jobs = jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job))
		return jobs.find((job) => job.id === jobId) ?? null
	}

	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', metaResponse),
		jsonFixture('GET', '/api/v1/profiles', profilesResponse),
		jsonFixture('GET', '/api/v1/buckets', bucketResponse),
		{
			method: 'GET',
			path: '/api/v1/jobs',
			handler: ({ url }) => {
				const status = url.searchParams.get('status')
				const type = url.searchParams.get('type')
				let items = jobs
				if (status) items = items.filter((job) => job.status === status)
				if (type) items = items.filter((job) => job.type === type)
				return { json: { items, nextCursor: null } }
			},
		},
		{
			method: 'POST',
			path: '/api/v1/jobs',
			handler: ({ request }) => {
				let body: { payload?: Record<string, unknown> } = {}
				try {
					body = request.postDataJSON() as { payload?: Record<string, unknown> }
				} catch {
					body = {}
				}
				const job = buildJob('job-created', 'queued', body.payload ?? {})
				addJob(job)
				return { status: 201, json: job }
			},
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/jobs\/([^/]+)\/cancel$/,
			handler: ({ path }) => {
				const jobId = path.match(/^\/api\/v1\/jobs\/([^/]+)\/cancel$/)?.[1]
				const job = jobId ? updateJob(jobId, { status: 'canceled', finishedAt: now }) : null
				if (!job) return { status: 404, json: { error: { code: 'not_found', message: 'not found' } } }
				return { json: job }
			},
		},
		{
			method: 'POST',
			path: /^\/api\/v1\/jobs\/([^/]+)\/retry$/,
			handler: ({ path }) => {
				const sourceId = path.match(/^\/api\/v1\/jobs\/([^/]+)\/retry$/)?.[1] ?? ''
				const source = jobs.find((job) => job.id === sourceId)
				const job = buildJob(`job-retry-${++retryCount}`, 'queued', source?.payload ?? {})
				addJob(job)
				return { json: job }
			},
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/jobs\/([^/]+)$/,
			handler: ({ path }) => {
				const jobId = path.match(/^\/api\/v1\/jobs\/([^/]+)$/)?.[1] ?? ''
				const job = jobs.find((item) => item.id === jobId)
				if (!job) return { status: 404, json: { error: { code: 'not_found', message: 'not found' } } }
				return { json: job }
			},
		},
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

test('jobs create, cancel, retry flow', async ({ page }) => {
	await seedStorage(page)
	await setupApiMocks(page)

	await page.goto('/jobs')
	await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
	await expect(page.getByText('job-running')).toBeVisible()
	await expect(page.getByText('job-failed')).toBeVisible()

	await page.getByRole('button', { name: /More$/ }).click()
	await page.getByRole('menuitem', { name: 'New Delete Job' }).click()
	const deleteDrawer = page.getByRole('dialog', { name: 'Create delete job (S3)' })
	await expect(deleteDrawer).toBeVisible()
	await deleteDrawer.getByRole('combobox', { name: 'Bucket' }).fill(defaultStorage.bucket)
	await deleteDrawer.getByLabel('Prefix', { exact: true }).fill('to-delete/')
	await deleteDrawer.getByRole('button', { name: 'Create' }).click()
	await expect(page.getByRole('cell', { name: 'job-created' })).toBeVisible()

	const runningRow = page.getByRole('row', { name: /job-running/i })
	await runningRow.getByRole('button', { name: 'More actions' }).click()
	await page.getByRole('menuitem', { name: 'Cancel' }).click()
	await expect(runningRow.getByText('canceled')).toBeVisible()

	const failedRow = page.getByRole('row', { name: /job-failed/i })
	await failedRow.getByRole('button', { name: 'Retry' }).click()
	await expect(page.getByRole('cell', { name: 'job-retry-1' })).toBeVisible()
})
