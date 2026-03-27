import { expect, test, type Page } from '@playwright/test'

import { installMockApi } from './support/apiFixtures'
import { ensureDialogOpen, transferDownloadRow } from './support/ui'

type StorageSeed = {
	apiToken: string
	profileId: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	profileId: 'playwright-profile',
}

const now = '2024-01-01T00:00:00Z'
const zipJobId = 'job-zip-running'
const zipJobLabel = /Artifact: zip s3:\/\/test-bucket\/reports\/\*/

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
}

type ArtifactResponseStep =
	| {
			kind: 'success'
			body?: string
			delayMs?: number
			filename?: string
	  }
	| {
			kind: 'error'
			status: number
			code: string
			message: string
			delayMs?: number
	  }

type JobArtifactApiScenario = {
	listedJob: Job
	polledJobs?: Job[]
	artifactResponses?: ArtifactResponseStep[]
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

function buildZipJob(status: JobStatus, error: string | null = null): Job {
	return buildJob(
		zipJobId,
		's3_zip_prefix',
		status,
		{ bucket: 'test-bucket', prefix: 'reports/' },
		status === 'running'
			? { objectsDone: 2, bytesDone: 1024, bytesTotal: 4096, speedBps: 512 }
			: status === 'succeeded'
				? { objectsDone: 4, bytesDone: 4096, bytesTotal: 4096, speedBps: 1024 }
				: null,
		error,
	)
}

async function setupApiMocks(page: Page, scenario: JobArtifactApiScenario) {
	let jobPollCount = 0
	let artifactRequestCount = 0
	const polledJobs = scenario.polledJobs?.length ? scenario.polledJobs : [scenario.listedJob]
	const artifactResponses =
		scenario.artifactResponses?.length
			? scenario.artifactResponses
			: [{ kind: 'success', delayMs: 1200, filename: 'reports.zip', body: 'zip-artifact' } satisfies ArtifactResponseStep]

	await installMockApi(page, [
		{ method: 'GET', path: '/meta', handle: (ctx) => ctx.json(metaResponse) },
		{ method: 'GET', path: '/profiles', handle: (ctx) => ctx.json(profilesResponse) },
		{ method: 'GET', path: '/buckets', handle: (ctx) => ctx.json(bucketResponse) },
		{
			method: 'GET',
			path: '/jobs',
			handle: (ctx) => ctx.json({ items: [scenario.listedJob], nextCursor: null }),
		},
		{
			method: 'GET',
			path: new RegExp(`^/api/v1/jobs/${zipJobId}$`),
			handle: (ctx) => {
				jobPollCount += 1
				return ctx.json(polledJobs[Math.min(jobPollCount - 1, polledJobs.length - 1)] ?? scenario.listedJob)
			},
		},
		{
			method: 'GET',
			path: new RegExp(`^/api/v1/jobs/${zipJobId}/artifact$`),
			handle: async (ctx) => {
				artifactRequestCount += 1
				const response = artifactResponses[Math.min(artifactRequestCount - 1, artifactResponses.length - 1)] ?? artifactResponses[0]
				if (response.delayMs && response.delayMs > 0) {
					await ctx.delay(response.delayMs)
				}
				if (response.kind === 'error') {
					return ctx.json({ error: { code: response.code, message: response.message } }, response.status)
				}
				await ctx.route.fulfill({
					status: 200,
					contentType: 'application/zip',
					headers: {
						'content-disposition': `attachment; filename="${response.filename ?? 'reports.zip'}"`,
						'content-length': String((response.body ?? 'zip-artifact').length),
					},
					body: response.body ?? 'zip-artifact',
				})
			},
		},
		{ method: 'GET', path: '/events', handle: (ctx) => ctx.text('forbidden', 403) },
	])

	return {
		getJobPollCount: () => jobPollCount,
		getArtifactRequestCount: () => artifactRequestCount,
	}
}

async function queueZipArtifactDownload(page: Page) {
	await page.goto('/jobs')
	await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()

	const zipRow = page.getByRole('row', { name: new RegExp(zipJobId, 'i') })
	await expect(zipRow).toContainText(/zip s3:\/\/test-bucket\/reports\/\*/)
	await zipRow.getByRole('button', { name: 'Open actions menu' }).click()
	await page.getByRole('menuitem', { name: 'Download ZIP' }).click()

	const transfersDialog = await ensureDialogOpen(page, /Transfers/i, async () => {
		await page.getByRole('button', { name: /Transfers/i }).first().click({ force: true })
	})
	const row = transferDownloadRow(transfersDialog, zipJobLabel)
	await expect(row).toBeVisible()

	return { transfersDialog, row }
}

test('zip artifact download moves from waiting to done in Transfers', async ({ page }) => {
	test.setTimeout(30_000)
	const apiState = await setupApiMocks(page, {
		listedJob: buildZipJob('running'),
		polledJobs: [buildZipJob('running'), buildZipJob('running'), buildZipJob('succeeded')],
	})
	await seedStorage(page)

	const { row } = await queueZipArtifactDownload(page)
	await expect.poll(() => apiState.getArtifactRequestCount(), { timeout: 10_000 }).toBe(1)
	await expect(row.getByText('Done', { exact: true })).toBeVisible({ timeout: 10_000 })
})

test('zip artifact waiting task becomes failed when the job fails', async ({ page }) => {
	test.setTimeout(30_000)
	const apiState = await setupApiMocks(page, {
		listedJob: buildZipJob('running'),
		polledJobs: [buildZipJob('running'), buildZipJob('failed', 'zip artifact job failed')],
	})
	await seedStorage(page)

	const { row } = await queueZipArtifactDownload(page)

	await expect.poll(() => apiState.getJobPollCount(), { timeout: 10_000 }).toBeGreaterThan(0)
	await expect(row.getByText('Failed', { exact: true })).toBeVisible({ timeout: 10_000 })
	await expect(row.getByText('zip artifact job failed')).toBeVisible()
	await expect(row.getByRole('button', { name: 'Retry' })).toBeVisible()
	expect(apiState.getArtifactRequestCount()).toBe(0)
})

test('zip artifact waiting task becomes canceled when the job is canceled', async ({ page }) => {
	test.setTimeout(30_000)
	const apiState = await setupApiMocks(page, {
		listedJob: buildZipJob('running'),
		polledJobs: [buildZipJob('running'), buildZipJob('canceled', 'zip canceled by operator')],
	})
	await seedStorage(page)

	const { row } = await queueZipArtifactDownload(page)

	await expect.poll(() => apiState.getJobPollCount(), { timeout: 10_000 }).toBeGreaterThan(0)
	await expect(row.getByText('Canceled', { exact: true })).toBeVisible({ timeout: 10_000 })
	await expect(row.getByText('zip canceled by operator')).toBeVisible()
	await expect(row.getByRole('button', { name: 'Retry' })).toBeVisible()
	expect(apiState.getArtifactRequestCount()).toBe(0)
})

test('zip artifact download can be retried after the artifact request fails', async ({ page }) => {
	test.setTimeout(30_000)
	const apiState = await setupApiMocks(page, {
		listedJob: buildZipJob('succeeded'),
		artifactResponses: [
			{
				kind: 'error',
				status: 503,
				code: 'artifact_unavailable',
				message: 'artifact still uploading',
			},
			{
				kind: 'success',
				delayMs: 300,
				filename: 'reports.zip',
				body: 'zip-artifact-retry',
			},
		],
	})
	await seedStorage(page)

	const { row } = await queueZipArtifactDownload(page)

	await expect(row.getByText('Failed', { exact: true })).toBeVisible({ timeout: 10_000 })
	await expect(row.getByText(/artifact_unavailable: artifact still uploading/i)).toBeVisible()
	await expect(row.getByRole('button', { name: 'Retry' })).toBeVisible()
	await expect.poll(() => apiState.getArtifactRequestCount(), { timeout: 10_000 }).toBe(1)

	await row.getByRole('button', { name: 'Retry' }).click()

	await expect.poll(() => apiState.getArtifactRequestCount(), { timeout: 10_000 }).toBe(2)
	await expect(row.getByText('Done', { exact: true })).toBeVisible({ timeout: 10_000 })
})
