import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { expect, test, type Page } from '@playwright/test'

import { installMockApi } from './support/apiFixtures'
import {
	chooseRowAction,
	clickTransferRowButton,
	dialogByName,
	expectTransferRowButton,
	expectTransferRowState,
	gotoJobsPage,
	transferDownloadRow,
} from './support/ui'

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
const zipArtifactPageReadyTimeoutMs = 30_000
const zipArtifactPageReadyAttempts = 3
const zipArtifactTestTimeoutMs = 120_000

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
		endpoint: 'http://seaweedfs:8333',
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
		window.localStorage.setItem('apiRetryCount', JSON.stringify(0))
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
	let artifactPreparationCount = 0
	const completedArtifactPreparations: number[] = []
	const artifactByteAttempts: number[] = []
	const polledJobs = scenario.polledJobs?.length ? scenario.polledJobs : [scenario.listedJob]
	const artifactResponses =
		scenario.artifactResponses?.length
			? scenario.artifactResponses
			: [{ kind: 'success', delayMs: 1200, filename: 'reports.zip', body: 'zip-artifact' } satisfies ArtifactResponseStep]

	// Native browser downloads bypass Playwright's routed requests.
	const artifactServer = createServer((request, response) => {
		const url = new URL(request.url ?? '/', 'http://127.0.0.1')
		const attempt = Number(url.searchParams.get('attempt'))
		if (request.method !== 'GET' || url.pathname !== '/artifact' || !Number.isInteger(attempt) || attempt < 1 || attempt > artifactPreparationCount) {
			response.writeHead(404)
			response.end()
			return
		}
		artifactByteAttempts.push(attempt)
		const step = artifactResponses[Math.min(attempt - 1, artifactResponses.length - 1)] ?? artifactResponses[0]
		if (step.kind === 'error') {
			response.writeHead(step.status, { 'content-type': 'application/json' })
			response.end(JSON.stringify({ error: { code: step.code, message: step.message } }))
			return
		}
		const body = step.body ?? 'zip-artifact'
		response.writeHead(200, {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${step.filename ?? 'reports.zip'}"`,
			'content-length': Buffer.byteLength(body),
		})
		response.end(body)
	})
	page.on('close', () => {
		artifactServer.closeAllConnections()
		if (artifactServer.listening) artifactServer.close()
	})
	await new Promise<void>((resolve, reject) => {
		artifactServer.once('error', reject)
		artifactServer.listen(0, '127.0.0.1', resolve)
	})
	const address = artifactServer.address()
	if (!address || typeof address === 'string') throw new Error('Artifact fixture did not bind a TCP port')
	const artifactOrigin = `http://127.0.0.1:${address.port}`

	await installMockApi(page, [
		{ method: 'GET', path: '/meta', handle: (ctx) => ctx.json(metaResponse) },
		{ method: 'GET', path: '/profiles', handle: (ctx) => ctx.json(profilesResponse) },
		{ method: 'GET', path: '/buckets', handle: (ctx) => ctx.json(bucketResponse) },
		{
			method: 'GET',
			path: '/jobs',
			handle: (ctx) => {
				if (ctx.url.searchParams.has('id')) {
					expect(ctx.url.searchParams.getAll('id')).toEqual([zipJobId])
					jobPollCount += 1
					const job = polledJobs[Math.min(jobPollCount - 1, polledJobs.length - 1)] ?? scenario.listedJob
					return ctx.json({ items: [job], nextCursor: null })
				}
				return ctx.json({ items: [scenario.listedJob], nextCursor: null })
			},
		},
		{
			method: 'GET',
			path: new RegExp(`^/api/v1/jobs/${zipJobId}$`),
			handle: (ctx) => ctx.json(scenario.listedJob),
		},
		{
			method: 'GET',
			path: new RegExp(`^/api/v1/jobs/${zipJobId}/artifact-url$`),
			handle: async (ctx) => {
				const attempt = ++artifactPreparationCount
				const response = artifactResponses[Math.min(attempt - 1, artifactResponses.length - 1)] ?? artifactResponses[0]
				if (response.delayMs && response.delayMs > 0) {
					await ctx.delay(response.delayMs)
				}
				completedArtifactPreparations.push(attempt)
				if (response.kind === 'error') {
					return ctx.json({ error: { code: response.code, message: response.message } }, response.status)
				}
				return ctx.json({
					url: `${artifactOrigin}/artifact?attempt=${attempt}`,
					expiresAt: new Date(Date.now() + 300_000).toISOString(),
				})
			},
		},
		{ method: 'GET', path: '/events', handle: (ctx) => ctx.text('forbidden', 403) },
	])

	return {
		getJobPollCount: () => jobPollCount,
		getArtifactPreparationCount: () => artifactPreparationCount,
		getCompletedArtifactPreparations: () => completedArtifactPreparations,
		getArtifactByteAttempts: () => artifactByteAttempts,
	}
}

async function queueZipArtifactDownload(page: Page) {
	await gotoJobsPage(page, {
		timeout: zipArtifactPageReadyTimeoutMs,
		maxAttempts: zipArtifactPageReadyAttempts,
		retryOnTimeout: true,
	})

	const zipRow = page.getByRole('row', { name: new RegExp(zipJobId, 'i') })
	await expect(zipRow).toContainText(/zip s3:\/\/test-bucket\/reports\/\*/)
	await chooseRowAction(page, zipRow, 'Download ZIP')

	const dialog = dialogByName(page, /Transfers/i)
	await expect(dialog).toBeVisible({ timeout: 15_000 })
	const downloadsTab = dialog.getByRole('tab', { name: /Downloads/i })
	await expect(downloadsTab).toBeVisible({ timeout: 15_000 })
	if ((await downloadsTab.getAttribute('aria-selected')) !== 'true') {
		await downloadsTab.click()
	}
	const row = transferDownloadRow(dialog, zipJobLabel)
	await expect(row).toBeVisible({ timeout: 15_000 })

	return { row }
}

test('zip artifact download waits for the job and saves the prepared ZIP through the browser', async ({ page }) => {
	test.setTimeout(zipArtifactTestTimeoutMs)
	const apiState = await setupApiMocks(page, {
		listedJob: buildZipJob('running'),
		polledJobs: [buildZipJob('running'), buildZipJob('running'), buildZipJob('succeeded')],
	})
	await seedStorage(page)

	const { row } = await queueZipArtifactDownload(page)
	await expect.poll(() => apiState.getArtifactPreparationCount(), { timeout: 10_000 }).toBe(1)
	await expectTransferRowState(row, 'Ready to save', { timeout: 10_000 })
	const saved = page.waitForEvent('download')
	await row.getByRole('link', { name: /^Save download / }).click()
	const download = await saved
	await expectTransferRowState(row, 'Sent to browser')
	expect(download.suggestedFilename()).toBe('reports.zip')
	expect(await readFile((await download.path())!, 'utf8')).toBe('zip-artifact')
	await expect.poll(() => apiState.getArtifactByteAttempts()).toEqual([1])
})

test('zip artifact waiting task becomes failed when the job fails', async ({ page }) => {
	test.setTimeout(zipArtifactTestTimeoutMs)
	const apiState = await setupApiMocks(page, {
		listedJob: buildZipJob('running'),
		polledJobs: [buildZipJob('running'), buildZipJob('failed', 'zip artifact job failed')],
	})
	await seedStorage(page)

	const { row } = await queueZipArtifactDownload(page)

	await expect.poll(() => apiState.getJobPollCount(), { timeout: 10_000 }).toBeGreaterThan(0)
	await expectTransferRowState(row, 'Failed', { timeout: 10_000 })
	await expect(row.getByText('zip artifact job failed')).toBeVisible()
	await expectTransferRowButton(row, 'Retry')
	expect(apiState.getArtifactPreparationCount()).toBe(0)
	expect(apiState.getArtifactByteAttempts()).toEqual([])
})

test('zip artifact waiting task becomes canceled when the job is canceled', async ({ page }) => {
	test.setTimeout(zipArtifactTestTimeoutMs)
	const apiState = await setupApiMocks(page, {
		listedJob: buildZipJob('running'),
		polledJobs: [buildZipJob('running'), buildZipJob('canceled', 'zip canceled by operator')],
	})
	await seedStorage(page)

	const { row } = await queueZipArtifactDownload(page)

	await expect.poll(() => apiState.getJobPollCount(), { timeout: 10_000 }).toBeGreaterThan(0)
	await expectTransferRowState(row, 'Canceled', { timeout: 10_000 })
	await expect(row.getByText('zip canceled by operator')).toBeVisible()
	await expectTransferRowButton(row, 'Retry')
	expect(apiState.getArtifactPreparationCount()).toBe(0)
	expect(apiState.getArtifactByteAttempts()).toEqual([])
})

test('zip artifact download can be retried after the artifact request fails', async ({ page }) => {
	test.setTimeout(zipArtifactTestTimeoutMs)
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

	await expectTransferRowState(row, 'Failed', { timeout: 10_000 })
	await expect(row.getByText(/artifact_unavailable: artifact still uploading/i)).toBeVisible()
	await expect.poll(() => apiState.getArtifactPreparationCount(), { timeout: 10_000 }).toBe(1)
	expect(apiState.getArtifactByteAttempts()).toEqual([])
	await clickTransferRowButton(row, 'Retry')

	await expect.poll(() => apiState.getArtifactPreparationCount(), { timeout: 10_000 }).toBe(2)
	await expectTransferRowState(row, 'Ready to save', { timeout: 10_000 })
	const saved = page.waitForEvent('download')
	await row.getByRole('link', { name: /^Save download / }).click()
	const download = await saved
	await expectTransferRowState(row, 'Sent to browser')
	expect(download.suggestedFilename()).toBe('reports.zip')
	expect(await readFile((await download.path())!, 'utf8')).toBe('zip-artifact-retry')
	await expect.poll(() => apiState.getArtifactByteAttempts()).toEqual([2])
})

test('canceling an artifact download allows a fresh retry to complete', async ({ page }) => {
	test.setTimeout(zipArtifactTestTimeoutMs)
	const apiState = await setupApiMocks(page, {
		listedJob: buildZipJob('succeeded'),
		artifactResponses: [
			{ kind: 'success', delayMs: 5000, filename: 'canceled.zip', body: 'old-attempt' },
			{ kind: 'success', delayMs: 100, filename: 'retried.zip', body: 'fresh-attempt' },
		],
	})
	await seedStorage(page)
	const { row } = await queueZipArtifactDownload(page)
	await expect.poll(() => apiState.getArtifactPreparationCount()).toBe(1)
	await clickTransferRowButton(row, 'Cancel')
	await expectTransferRowState(row, 'Canceled')
	expect(apiState.getArtifactByteAttempts()).toEqual([])
	await clickTransferRowButton(row, 'Retry')
	await expect.poll(() => apiState.getArtifactPreparationCount()).toBe(2)
	await expectTransferRowState(row, 'Ready to save')
	const saved = page.waitForEvent('download')
	await row.getByRole('link', { name: /^Save download / }).click()
	const download = await saved
	await expectTransferRowState(row, 'Sent to browser')
	expect(download.suggestedFilename()).toBe('retried.zip')
	expect(await readFile((await download.path())!, 'utf8')).toBe('fresh-attempt')
	await expect.poll(() => apiState.getCompletedArtifactPreparations(), { timeout: 10_000 }).toContain(1)
	await expectTransferRowState(row, 'Sent to browser')
	expect(apiState.getArtifactPreparationCount()).toBe(2)
	await expect.poll(() => apiState.getArtifactByteAttempts()).toEqual([2])
})
