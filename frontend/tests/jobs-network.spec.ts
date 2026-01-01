import { expect, test, type Page } from '@playwright/test'

type StorageSeed = {
	apiToken: string
	profileId: string
	jobsFollowLogs?: boolean
}

const defaultStorage: StorageSeed = {
	apiToken: 'invalid-token',
	profileId: 'playwright-jobs',
	jobsFollowLogs: true,
}

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

const bucketResponse = [{ name: 'test-bucket', createdAt: '2024-01-01T00:00:00Z' }]

const jobResponse = {
	id: 'job-test',
	type: 's3_zip_prefix',
	status: 'running',
	payload: { bucket: 'test-bucket', prefix: 'logs/' },
	progress: { objectsDone: 1, bytesDone: 1024 },
	createdAt: '2024-01-01T00:00:00Z',
	startedAt: null,
	finishedAt: null,
	error: null,
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	const storage = { ...defaultStorage, ...overrides }
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		if (seed.jobsFollowLogs !== undefined) {
			window.localStorage.setItem('jobsFollowLogs', JSON.stringify(seed.jobsFollowLogs))
		}
	}, storage)
}

async function setupApiMocks(page: Page, isOffline: () => boolean) {
	await page.route('**/api/v1/**', async (route) => {
		if (isOffline()) {
			return route.abort()
		}
		const url = new URL(route.request().url())
		switch (url.pathname) {
			case '/api/v1/meta':
				return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metaResponse) })
			case '/api/v1/buckets':
				return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bucketResponse) })
			case '/api/v1/jobs':
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ items: [jobResponse], nextCursor: null }),
				})
			case '/api/v1/jobs/job-test':
				return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(jobResponse) })
			case '/api/v1/jobs/job-test/logs': {
				if (url.searchParams.has('tailBytes')) {
					return route.fulfill({
						status: 200,
						headers: { 'content-type': 'text/plain', 'X-Log-Next-Offset': '12' },
						body: 'hello\n',
					})
				}
				return route.fulfill({ status: 204, headers: { 'X-Log-Next-Offset': '12' } })
			}
			case '/api/v1/events':
				return route.fulfill({ status: 403, contentType: 'text/plain', body: 'forbidden' })
			default:
				return route.fulfill({
					status: 404,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'not_found', message: 'not found' } }),
				})
		}
	})
}

test.describe('Jobs network resilience', () => {
	test('log polling pauses and offers manual retry', async ({ page, context }) => {
		test.setTimeout(60_000)
		await seedStorage(page)
		let mockOffline = false
		await setupApiMocks(page, () => mockOffline)

	await page.goto('/jobs')
	await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()

	const jobRow = page.locator('[data-row-key="job-test"]')
	await jobRow.getByRole('button', { name: 'More actions' }).click()
	await page.getByRole('menuitem', { name: 'Logs' }).click()

		const logsDrawer = page.getByRole('dialog', { name: 'Job Logs' })
		await expect(logsDrawer).toBeVisible()
		await expect(logsDrawer.getByText('hello')).toBeVisible()

		mockOffline = true
		await context.setOffline(true)
		await expect(logsDrawer.getByText('Log polling paused')).toBeVisible({ timeout: 25_000 })
		await expect(logsDrawer.getByRole('button', { name: 'Retry' })).toBeVisible({ timeout: 25_000 })

		mockOffline = false
		await context.setOffline(false)
		await logsDrawer.getByRole('button', { name: 'Retry' }).click()
		await expect(logsDrawer.getByText('Log polling paused')).toHaveCount(0, { timeout: 10_000 })
	})
})
