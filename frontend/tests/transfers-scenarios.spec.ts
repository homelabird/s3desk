import { expect, test, type Page } from '@playwright/test'

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

	await page.route('**/api/v1/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())
		const path = url.pathname
		const method = request.method()

		if (method === 'GET' && path === '/api/v1/meta') {
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metaResponse) })
		}
		if (method === 'GET' && path === '/api/v1/profiles') {
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profilesResponse) })
		}
		if (method === 'GET' && path === '/api/v1/buckets') {
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bucketResponse) })
		}
		if (method === 'GET' && path === '/api/v1/jobs') {
			const status = url.searchParams.get('status')
			const type = url.searchParams.get('type')
			const errorCode = url.searchParams.get('errorCode')
			let items = jobs
			if (status) items = items.filter((job) => job.status === status)
			if (type) items = items.filter((job) => job.type.includes(type))
			if (errorCode) items = items.filter((job) => job.errorCode === errorCode)
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ items, nextCursor: null }),
			})
		}
		if (method === 'POST' && path === '/api/v1/jobs') {
			return route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify(buildJob('job-created', 'transfer_sync_staging_to_s3', 'queued', {})),
			})
		}
		const cancelMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)\/cancel$/)
		if (method === 'POST' && cancelMatch) {
			const jobId = cancelMatch[1]
			const job = updateJob(jobId, { status: 'canceled', finishedAt: now })
			if (!job) {
				return route.fulfill({
					status: 404,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'not_found', message: 'not found' } }),
				})
			}
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(job) })
		}
		const retryMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)\/retry$/)
		if (method === 'POST' && retryMatch) {
			const sourceId = retryMatch[1]
			const source = jobs.find((job) => job.id === sourceId)
			const job = buildJob(`job-retry-${++retryCount}`, source?.type ?? 'transfer_copy_object', 'queued', source?.payload ?? {})
			addJob(job)
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(job) })
		}
		const getMatch = path.match(/^\/api\/v1\/jobs\/([^/]+)$/)
		if (method === 'GET' && getMatch) {
			const job = jobs.find((item) => item.id === getMatch[1])
			if (!job) {
				return route.fulfill({
					status: 404,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'not_found', message: 'not found' } }),
				})
			}
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(job) })
		}
		if (method === 'GET' && path === '/api/v1/events') {
			return route.fulfill({ status: 403, contentType: 'text/plain', body: 'forbidden' })
		}

		return route.fulfill({
			status: 404,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 'not_found', message: 'not found' } }),
		})
	})
}

test('transfer scenarios cover job types, progress, cancel, and retry', async ({ page }) => {
	await seedStorage(page)
	await setupApiMocks(page)

	await page.goto('/jobs')
	await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()

	await expect(page.getByText(/Upload folder \(device/)).toBeVisible()
	await expect(page.getByText(/Finalize upload \(staging/)).toBeVisible()
	await expect(page.getByText(/Download folder \(S3/)).toBeVisible()
	await expect(page.getByText('Copy object')).toBeVisible()
	await expect(page.getByText('Delete folder/prefix')).toBeVisible()

	await expect(page.getByText('3 ops')).toBeVisible()
	await expect(page.getByText(/cp s3:\/\/test-bucket\/alpha\.txt/)).toBeVisible()
	await expect(page.getByText(/rm s3:\/\/test-bucket\/tmp\//)).toBeVisible()

	const runningRow = page.locator('[data-row-key="job-download"]')
	await runningRow.getByRole('button', { name: 'More actions' }).click()
	await page.getByRole('menuitem', { name: 'Cancel' }).click()
	await expect(runningRow.getByText('canceled')).toBeVisible()

	const failedRow = page.locator('[data-row-key="job-copy"]')
	await failedRow.getByRole('button', { name: 'Retry' }).click()
	await expect(page.locator('[data-row-key="job-retry-1"]')).toBeVisible()
})
