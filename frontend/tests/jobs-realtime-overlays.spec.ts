import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildMetaFixture,
	buildProfileFixture,
	installMockApi,
	seedLocalStorage,
} from './support/apiFixtures'

const now = '2024-01-01T00:00:00Z'
const profileId = 'jobs-realtime-profile'
const bucket = 'jobs-realtime-bucket'

type JobRecord = {
	id: string
	type: string
	status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
	payload: Record<string, unknown>
	progress: null | {
		objectsDone?: number
		objectsTotal?: number
		bytesDone?: number
		bytesTotal?: number
		speedBps?: number
		etaSeconds?: number
	}
	createdAt: string
	startedAt: string | null
	finishedAt: string | null
	errorCode?: string | null
	error: string | null
}

async function seedStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId,
		bucket,
	})
}

function buildUploadJob(jobId: string, overrides: Partial<JobRecord> = {}): JobRecord {
	return {
		id: jobId,
		type: 'transfer_sync_staging_to_s3',
		status: 'running',
		payload: {
			bucket,
			prefix: 'exports/',
			rootName: 'camera-roll',
			rootKind: 'folder',
			totalFiles: 2,
			totalBytes: 4096,
			items: [
				{ path: 'camera-roll/alpha.txt', key: 'exports/camera-roll/alpha.txt', size: 2048 },
				{ path: 'camera-roll/beta.txt', key: 'exports/camera-roll/beta.txt', size: 2048 },
			],
		},
		progress: {
			bytesDone: 1024,
			bytesTotal: 4096,
			speedBps: 512,
			etaSeconds: 6,
		},
		createdAt: now,
		startedAt: now,
		finishedAt: null,
		errorCode: null,
		error: null,
		...overrides,
	}
}

async function installRealtimeJobsApi(page: Page, args: {
	jobs: JobRecord[]
	eventDelayMs?: number
	eventBody: string
	onFirstEventsResponse?: (helpers: { setJobs: (nextJobs: JobRecord[]) => void }) => void
	logsByJobId?: Record<string, string>
	realtimeTransport?: 'sse' | 'ws'
}) {
	let jobs = [...args.jobs]
	let eventsRequestCount = 0

	await installMockApi(page, [
		{
			method: 'GET',
			path: '/meta',
			handle: ({ json }) => json(buildMetaFixture()),
		},
		{
			method: 'GET',
			path: '/profiles',
			handle: ({ json }) =>
				json([
					buildProfileFixture({
						id: profileId,
						name: 'Jobs Realtime',
						createdAt: now,
						updatedAt: now,
					}),
				]),
		},
		{
			method: 'GET',
			path: '/buckets',
			handle: ({ json }) => json([buildBucketFixture(bucket, { createdAt: now })]),
		},
		{
			method: 'GET',
			path: '/jobs',
			handle: ({ json }) => json({ items: jobs, nextCursor: null }),
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/jobs\/([^/]+)$/,
			handle: ({ path, json, notFound }) => {
				const jobId = path.match(/^\/api\/v1\/jobs\/([^/]+)$/)?.[1] ?? ''
				const job = jobs.find((entry) => entry.id === jobId)
				return job ? json(job) : notFound()
			},
		},
		{
			method: 'GET',
			path: /^\/api\/v1\/jobs\/([^/]+)\/logs$/,
			handle: ({ path, url, route }) => {
				const jobId = path.match(/^\/api\/v1\/jobs\/([^/]+)\/logs$/)?.[1] ?? ''
				const body = args.logsByJobId?.[jobId] ?? ''
				if (url.searchParams.has('afterOffset')) {
					return route.fulfill({
						status: 204,
						headers: { 'x-log-next-offset': url.searchParams.get('afterOffset') ?? String(body.length) },
					})
				}
				return route.fulfill({
					status: 200,
					contentType: 'text/plain',
					headers: { 'x-log-next-offset': String(body.length) },
					body,
				})
			},
		},
		{
			method: 'GET',
			path: `/buckets/${bucket}/objects/meta`,
			handle: ({ url, json }) => {
				const key = url.searchParams.get('key')
				return json({
					bucket,
					key,
					size: 2048,
					lastModified: now,
					etag: key?.includes('alpha') ? 'etag-alpha' : 'etag-beta',
				})
			},
		},
		{
			method: 'POST',
			path: '/realtime-ticket',
			handle: ({ json, url }) => {
				if (args.realtimeTransport === 'ws') {
					return json({ ticket: 'jobs-ws-ticket' })
				}
				const transport = url.searchParams.get('transport')
				if (transport === 'ws') {
					return json({ error: { code: 'ws_unavailable', message: 'ws unavailable' } }, 503)
				}
				return json({ ticket: 'jobs-sse-ticket' })
			},
		},
		{
			method: 'GET',
			path: '/events',
			handle: async (ctx) => {
				eventsRequestCount += 1
				if (eventsRequestCount === 1) {
					if (args.eventDelayMs && args.eventDelayMs > 0) {
						await ctx.delay(args.eventDelayMs)
					}
					args.onFirstEventsResponse?.({
						setJobs(nextJobs) {
							jobs = [...nextJobs]
						},
					})
					return ctx.text(args.eventBody, 200, 'text/event-stream')
				}
				return ctx.text(': keepalive\n\n', 200, 'text/event-stream')
			},
		},
	])

	return {
		setJobs(nextJobs: JobRecord[]) {
			jobs = [...nextJobs]
		},
	}
}

test.describe('Jobs realtime overlays', () => {
	test('details drawer refreshes into completed upload details after live status changes', async ({ page }) => {
		const jobId = 'job-live-progress'
		const initialJob = buildUploadJob(jobId)
		const completedJob = buildUploadJob(jobId, {
			status: 'succeeded',
			progress: { bytesDone: 4096, bytesTotal: 4096 },
			finishedAt: now,
		})
		await page.addInitScript((seed) => {
			class MockWebSocket {
				static CONNECTING = 0
				static OPEN = 1
				static CLOSING = 2
				static CLOSED = 3

				url: string
				readyState = MockWebSocket.CONNECTING
				onopen: ((event: Event) => void) | null = null
				onclose: ((event: Event) => void) | null = null
				onerror: ((event: Event) => void) | null = null
				onmessage: ((event: MessageEvent<string>) => void) | null = null

				constructor(url: string) {
					this.url = url
					window.setTimeout(() => {
						this.readyState = MockWebSocket.OPEN
						this.onopen?.(new Event('open'))
					}, seed.openDelayMs)
					window.setTimeout(() => {
						this.onmessage?.(
							new MessageEvent('message', {
								data: JSON.stringify(seed.realtimeMessage),
							}),
						)
					}, seed.messageDelayMs)
				}

				close() {
					this.readyState = MockWebSocket.CLOSED
					this.onclose?.(new Event('close'))
				}

				send() {}
			}

			Object.defineProperty(window, 'WebSocket', {
				configurable: true,
				writable: true,
				value: MockWebSocket,
			})
		}, {
			openDelayMs: 50,
			messageDelayMs: 4000,
			realtimeMessage: {
				type: 'job.completed',
				seq: 1,
				jobId,
				payload: {
					status: completedJob.status,
					progress: completedJob.progress,
					error: completedJob.error,
				},
			},
		})

		const apiState = await installRealtimeJobsApi(page, {
			jobs: [initialJob],
			eventBody: ': keepalive\n\n',
			realtimeTransport: 'ws',
		})
		setTimeout(() => {
			apiState.setJobs([completedJob])
		}, 3000)
		await seedStorage(page)
		await page.goto('/jobs')
		await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()

		const row = page.getByRole('row', { name: new RegExp(jobId, 'i') })
		await expect(row).toBeVisible()
		await row.getByRole('button', { name: 'Details' }).click()

		const drawer = page.getByRole('dialog', { name: 'Job Details' })
		await expect(drawer).toBeVisible()
		const initialStatus = drawer.locator('text=/^(running|succeeded)$/').first()
		await expect(initialStatus).toBeVisible({ timeout: 10_000 })
		if ((await initialStatus.textContent())?.trim() === 'running') {
			await expect(drawer.getByText('1.00 KB/4.00 KB · 512 B/s · 6s eta')).toBeVisible()
		}

		await expect(row.getByText('succeeded', { exact: true })).toBeVisible({ timeout: 10_000 })
		await drawer.getByRole('button', { name: 'Refresh' }).click()
		await expect(drawer.getByText('succeeded', { exact: true })).toBeVisible({ timeout: 10_000 })
		await expect(drawer.getByText('4.00 KB/4.00 KB')).toBeVisible({ timeout: 10_000 })
		await drawer.getByText('Upload details').click()
		await expect(drawer.getByText('etag-alpha')).toBeVisible({ timeout: 10_000 })
	})

	test('logs drawer closes when realtime deletes the active job', async ({ page }) => {
		const jobId = 'job-live-delete'
		const initialJob = buildUploadJob(jobId, {
			status: 'failed',
			error: 'simulated failure',
			errorCode: 'job_failed',
			finishedAt: now,
			progress: null,
		})
		await installRealtimeJobsApi(page, {
			jobs: [initialJob],
			eventDelayMs: 4000,
			eventBody: `id: 1\ndata: ${JSON.stringify({
				type: 'jobs.deleted',
				seq: 1,
				payload: { jobIds: [jobId] },
			})}\n\n`,
			onFirstEventsResponse: ({ setJobs }) => {
				setJobs([])
			},
			logsByJobId: {
				[jobId]: '2024-01-01T00:00:00Z start\n2024-01-01T00:00:01Z failed: delete prefix\n',
			},
		})
		await seedStorage(page)
		await page.goto('/jobs')
		await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()

		const row = page.getByRole('row', { name: new RegExp(jobId, 'i') })
		await expect(row).toBeVisible()
		await row.getByRole('button', { name: 'Logs' }).click()

		const drawer = page.getByRole('dialog', { name: 'Job Logs' })
		await expect(drawer).toBeVisible()
		await expect(drawer.getByText('failed: delete prefix')).toBeVisible()

		await expect(page.getByRole('dialog', { name: 'Job Logs' })).toHaveCount(0, { timeout: 10_000 })
		await expect(page.getByRole('row', { name: new RegExp(jobId, 'i') })).toHaveCount(0, { timeout: 10_000 })
	})
})
