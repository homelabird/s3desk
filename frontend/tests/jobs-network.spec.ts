import { expect, test, type Page } from '@playwright/test'
import { installMockApi } from './support/apiFixtures'
import { gotoJobsPage, jobsTableRow, openJobLogsDrawer } from './support/ui'

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
const profilesResponse = [
	{
		id: defaultStorage.profileId,
		provider: 's3_compatible',
		name: 'Playwright Jobs',
		endpoint: 'http://localhost:9000',
		region: 'us-east-1',
		forcePathStyle: true,
		preserveLeadingSlash: false,
		tlsInsecureSkipVerify: true,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
	},
]

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
		window.localStorage.setItem('apiRetryCount', JSON.stringify(0))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		if (seed.jobsFollowLogs !== undefined) {
			window.localStorage.setItem('jobsFollowLogs', JSON.stringify(seed.jobsFollowLogs))
		}
	}, storage)
}

async function setupApiMocks(page: Page, isOffline: () => boolean) {
	await installMockApi(page, [
		{ method: 'GET', path: '/meta', handle: (ctx) => ctx.json(metaResponse) },
		{ method: 'GET', path: '/profiles', handle: (ctx) => ctx.json(profilesResponse) },
		{ method: 'GET', path: '/buckets', handle: (ctx) => ctx.json(bucketResponse) },
		{
			method: 'GET',
			path: '/jobs',
			handle: (ctx) => ctx.json({ items: [jobResponse], nextCursor: null }),
		},
		{ method: 'GET', path: '/jobs/job-test', handle: (ctx) => ctx.json(jobResponse) },
		{
			method: 'GET',
			path: '/jobs/job-test/logs',
			handle: (ctx) => {
				if (isOffline() && ctx.url.searchParams.has('afterOffset')) return ctx.route.abort()
				return ctx.url.searchParams.has('tailBytes')
					? ctx.text('hello\n', 200, 'text/plain')
					: ctx.route.fulfill({ status: 204, headers: { 'X-Log-Next-Offset': '12' } })
			},
		},
		{ method: 'GET', path: '/events', handle: (ctx) => ctx.text('forbidden', 403) },
		{ path: /.*/, handle: (ctx) => ctx.notFound() },
	])
}

test.describe('Jobs network resilience', () => {
	test('log polling pauses and offers manual retry', async ({ page }) => {
		test.setTimeout(60_000)
		await seedStorage(page)
		let mockOffline = false
		await setupApiMocks(page, () => mockOffline)

	await gotoJobsPage(page)

	const jobRow = jobsTableRow(page, 'job-test')
	const logsDrawer = await openJobLogsDrawer(page, jobRow)
	await expect(logsDrawer.getByText('hello')).toBeVisible()
	await expect(logsDrawer.getByRole('button', { name: 'Refresh job logs' }).locator('.anticon-loading')).toHaveCount(0)

	mockOffline = true
	await logsDrawer.getByRole('switch', { name: 'Follow job logs' }).click()
	await logsDrawer.getByRole('switch', { name: 'Follow job logs' }).click()
	await expect(logsDrawer.getByText('Log polling paused')).toBeVisible({ timeout: 25_000 })
	await expect(logsDrawer.getByRole('button', { name: 'Retry' })).toBeVisible({ timeout: 25_000 })

	mockOffline = false
	await logsDrawer.getByRole('button', { name: 'Retry' }).click()
	await expect(logsDrawer.getByText('Log polling paused')).toHaveCount(0, { timeout: 10_000 })
	})
})
