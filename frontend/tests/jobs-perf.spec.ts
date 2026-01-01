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
	errorCode?: string | null
}

function buildJob(id: string, status: JobStatus, payload: Record<string, unknown>, type = 'transfer_delete_prefix'): Job {
	return {
		id,
		type,
		status,
		payload,
		progress: null,
		createdAt: now,
		startedAt: status === 'running' ? now : null,
		finishedAt: status === 'failed' || status === 'canceled' || status === 'succeeded' ? now : null,
		error: status === 'failed' ? 'simulated failure' : null,
	}
}

type ObjectItem = {
	key: string
	size: number
	lastModified: string
	etag?: string
	storageClass?: string
}

function buildObjectItem(idx: number): ObjectItem {
	return {
		key: `object-${idx}.txt`,
		size: 1024 + idx,
		lastModified: now,
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

async function setupJobsApiMocks(page: Page, jobCount: number, logsText = '[info] log line 1\n') {
	const jobs: Job[] = Array.from({ length: jobCount }, (_, idx) => {
		const type = idx % 2 === 0 ? 'transfer_sync_staging_to_s3' : 'transfer_delete_prefix'
		return buildJob(`job-${idx}`, 'succeeded', { bucket: defaultStorage.bucket, prefix: `job-${idx}/` }, type)
	})

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
			const typeFilter = url.searchParams.get('type')?.trim() ?? ''
			const errorCodeFilter = url.searchParams.get('errorCode')?.trim() ?? ''
			let filteredJobs = jobs
			if (typeFilter) {
				filteredJobs = filteredJobs.filter((job) => job.type.includes(typeFilter))
			}
			if (errorCodeFilter) {
				filteredJobs = filteredJobs.filter((job) => job.errorCode === errorCodeFilter)
			}
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ items: filteredJobs, nextCursor: null }),
			})
		}
		if (method === 'GET' && path.startsWith('/api/v1/jobs/') && path.endsWith('/logs')) {
			return route.fulfill({
				status: 200,
				contentType: 'text/plain',
				headers: { 'X-Log-Next-Offset': String(logsText.length) },
				body: logsText,
			})
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

async function setupObjectsApiMocks(page: Page, objectCount: number) {
	const items: ObjectItem[] = Array.from({ length: objectCount }, (_, idx) => buildObjectItem(idx))

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
		if (method === 'GET' && path === `/api/v1/buckets/${defaultStorage.bucket}/objects`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					bucket: defaultStorage.bucket,
					prefix: '',
					delimiter: '/',
					commonPrefixes: [],
					items,
					nextContinuationToken: null,
					isTruncated: false,
				}),
			})
		}
		if (method === 'GET' && path === `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ bucket: defaultStorage.bucket, items: [] }),
			})
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

test.describe('jobs performance', () => {
	const perfEnabled = process.env.PERF_TESTS === '1'
	test.skip(!perfEnabled, 'set PERF_TESTS=1 to enable performance checks')

	test('jobs list renders within budget', async ({ page }) => {
		await seedStorage(page)
		await setupJobsApiMocks(page, 200)

		const started = Date.now()
		await page.goto('/jobs')
		await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
		await expect(page.getByText('200 jobs', { exact: true })).toBeVisible()
		const elapsed = Date.now() - started
		test.info().annotations.push({ type: 'perf', description: `jobs_page_render_ms=${elapsed}` })
		expect(elapsed).toBeLessThan(2000)
	})

	test('jobs filter updates within budget', async ({ page }) => {
		await seedStorage(page)
		await setupJobsApiMocks(page, 200)

		await page.goto('/jobs')
		await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
		await expect(page.getByText('200 jobs', { exact: true })).toBeVisible()

		const started = Date.now()
		await page.getByPlaceholder('type filter (optional)').fill('transfer_sync')
		await page.waitForResponse((response) => response.url().includes('/api/v1/jobs') && response.status() === 200)
		await expect(page.getByText('100 jobs', { exact: true })).toBeVisible()
		const elapsed = Date.now() - started
		test.info().annotations.push({ type: 'perf', description: `jobs_filter_ms=${elapsed}` })
		expect(elapsed).toBeLessThan(300)
	})

	test('jobs logs drawer opens within budget', async ({ page }) => {
		await seedStorage(page)
		await setupJobsApiMocks(page, 50, '[info] hello\n[info] world\n')

		await page.goto('/jobs')
		await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
		await expect(page.locator('code', { hasText: 'job-0' })).toBeVisible()

		await page.getByRole('button', { name: 'More actions' }).first().click()
		await expect(page.getByRole('menuitem', { name: 'Logs' })).toBeVisible()

		const started = Date.now()
		await page.getByRole('menuitem', { name: 'Logs' }).click()
		await expect(page.getByText('Job Logs')).toBeVisible()
		const elapsed = Date.now() - started
		test.info().annotations.push({ type: 'perf', description: `jobs_logs_drawer_ms=${elapsed}` })
		expect(elapsed).toBeLessThan(1000)
	})
})

test.describe('objects performance', () => {
	const perfEnabled = process.env.PERF_TESTS === '1'
	test.skip(!perfEnabled, 'set PERF_TESTS=1 to enable performance checks')

	test('objects list renders within budget', async ({ page }) => {
		await seedStorage(page)
		await setupObjectsApiMocks(page, 200)

		const started = Date.now()
		await page.goto('/objects')
		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await expect(page.getByText('object-199.txt')).toBeVisible()
		const elapsed = Date.now() - started
		test.info().annotations.push({ type: 'perf', description: `objects_page_render_ms=${elapsed}` })
		expect(elapsed).toBeLessThan(3000)
	})
})
