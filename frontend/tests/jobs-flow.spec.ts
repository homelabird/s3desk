import { expect, test, type Page } from '@playwright/test'

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
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
	}, storage)
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
			let items = jobs
			if (status) items = items.filter((job) => job.status === status)
			if (type) items = items.filter((job) => job.type === type)
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ items, nextCursor: null }),
			})
		}
		if (method === 'POST' && path === '/api/v1/jobs') {
			let body: { type?: string; payload?: Record<string, unknown> } = {}
			try {
				body = request.postDataJSON() as { type?: string; payload?: Record<string, unknown> }
			} catch {
				body = {}
			}
			const job = buildJob('job-created', 'queued', body.payload ?? {})
			addJob(job)
			return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(job) })
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
			const job = buildJob(`job-retry-${++retryCount}`, 'queued', source?.payload ?? {})
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

test('jobs create, cancel, retry flow', async ({ page }) => {
	await seedStorage(page)
	await setupApiMocks(page)

	await page.goto('/jobs')
	await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
	await expect(page.getByText('job-running')).toBeVisible()
	await expect(page.getByText('job-failed')).toBeVisible()

	await page.getByRole('button', { name: 'New Delete Job' }).click()
	const deleteDrawer = page.getByRole('dialog', { name: 'Create delete job (S3)' })
	await expect(deleteDrawer).toBeVisible()
	await deleteDrawer.getByRole('combobox', { name: 'Bucket' }).fill(defaultStorage.bucket)
	await deleteDrawer.getByLabel('Prefix', { exact: true }).fill('to-delete/')
	await deleteDrawer.getByRole('button', { name: 'Create' }).click()
	await expect(page.locator('[data-row-key="job-created"]')).toBeVisible()

	const runningRow = page.locator('[data-row-key="job-running"]')
	await runningRow.getByRole('button', { name: 'More actions' }).click()
	await page.getByRole('menuitem', { name: 'Cancel' }).click()
	await expect(runningRow.getByText('canceled')).toBeVisible()

	const failedRow = page.locator('[data-row-key="job-failed"]')
	await failedRow.getByRole('button', { name: 'Retry' }).click()
	await expect(page.locator('[data-row-key="job-retry-1"]')).toBeVisible()
})
