import { expect, test, type Page } from '@playwright/test'

import {
buildBucketFixture,
buildFavoritesFixture,
buildObjectsListFixture,
buildProfileFixture,
installMockApi,
metaJson,
} from './support/apiFixtures'
import { seedWebviewStorage } from './support/webviewFixtures'

const now = '2024-01-01T00:00:00Z'

type JobRecord = {
id: string
type: string
status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
payload: Record<string, unknown>
progress: null | {
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

type MockWebSocketBehavior = {
openDelayMs?: number
}

type MockEventSourceBehavior = {
openDelayMs?: number
}

function buildUploadJob(jobId: string, overrides: Partial<JobRecord> = {}): JobRecord {
return {
id: jobId,
type: 'transfer_sync_staging_to_s3',
status: 'running',
payload: {
bucket: 'qa-bucket',
prefix: 'exports/',
rootName: 'webview-fixture',
rootKind: 'folder',
totalFiles: 2,
totalBytes: 4096,
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

async function installMockRealtimeRuntime(page: Page, args: {
wsBehaviors: MockWebSocketBehavior[]
esBehaviors?: MockEventSourceBehavior[]
}) {
await page.addInitScript((seed) => {
type BrowserWebSocketBehavior = {
openDelayMs?: number
}

	type BrowserEventSourceBehavior = {
		openDelayMs?: number
	}

	const NativeWebSocket = window.WebSocket
	const NativeEventSource = window.EventSource
	const wsBehaviors = (seed as { wsBehaviors: BrowserWebSocketBehavior[] }).wsBehaviors
	const esBehaviors = (seed as { esBehaviors?: BrowserEventSourceBehavior[] }).esBehaviors ?? []
	let wsCount = 0
	let esCount = 0

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
	if (!url.includes('/api/v1/ws')) {
	return new NativeWebSocket(url) as unknown as MockWebSocket
	}
	this.url = url
	const behavior = wsBehaviors[wsCount++] ?? {}
	runtime.wsInstances.push(this)

if (behavior.openDelayMs !== undefined) {
window.setTimeout(() => {
if (this.readyState !== MockWebSocket.CONNECTING) return
this.readyState = MockWebSocket.OPEN
this.onopen?.(new Event('open'))
}, behavior.openDelayMs)
}
}

close() {
if (this.readyState === MockWebSocket.CLOSED) return
this.readyState = MockWebSocket.CLOSED
this.onclose?.(new Event('close'))
}

send() {}
}

class MockEventSource {
static CONNECTING = 0
static OPEN = 1
static CLOSED = 2

url: string
readyState = MockEventSource.CONNECTING
onopen: ((event: Event) => void) | null = null
onerror: ((event: Event) => void) | null = null
onmessage: ((event: MessageEvent<string>) => void) | null = null

	constructor(url: string, eventSourceInitDict?: unknown) {
	if (!url.includes('/api/v1/events')) {
	return new NativeEventSource(url, eventSourceInitDict as EventSourceInit) as unknown as MockEventSource
	}
	this.url = url
	const behavior = esBehaviors[esCount++] ?? {}
	runtime.eventSourceInstances.push(this)

if (behavior.openDelayMs !== undefined) {
window.setTimeout(() => {
if (this.readyState === MockEventSource.CLOSED) return
this.readyState = MockEventSource.OPEN
this.onopen?.(new Event('open'))
}, behavior.openDelayMs)
}
}

close() {
this.readyState = MockEventSource.CLOSED
}
}

const runtime = {
wsInstances: [] as MockWebSocket[],
eventSourceInstances: [] as MockEventSource[],
closeWebSocket(index: number) {
runtime.wsInstances[index]?.close()
},
emitWebSocketMessage(index: number, data: unknown) {
const instance = runtime.wsInstances[index]
if (!instance || instance.readyState !== MockWebSocket.OPEN) return
instance.onmessage?.(
new MessageEvent('message', {
data: typeof data === 'string' ? data : JSON.stringify(data),
}),
)
},
openEventSource(index: number) {
const instance = runtime.eventSourceInstances[index]
if (!instance || instance.readyState === MockEventSource.CLOSED) return
instance.readyState = MockEventSource.OPEN
instance.onopen?.(new Event('open'))
},
}

Object.defineProperty(window, 'WebSocket', {
configurable: true,
writable: true,
value: MockWebSocket,
})
Object.defineProperty(window, 'EventSource', {
configurable: true,
writable: true,
value: MockEventSource,
})
Object.defineProperty(window, '__webviewRealtimeMock', {
configurable: true,
writable: true,
value: runtime,
})
}, args)
}

async function installWebviewRealtimeJobsApi(
	page: Page,
	initialJobs: JobRecord[],
	args: { ticketDelayMsByTransport?: Partial<Record<'ws' | 'sse', number>> } = {},
) {
let jobs = [...initialJobs]
const bucket = 'qa-bucket'
const prefix = 'reports/2024/'
const profileId = 'playwright-webview'

await installMockApi(page, [
{
method: 'GET',
path: '/meta',
handle: ({ json }) =>
json(
metaJson({
dataDir: '/tmp',
staticDir: '/tmp',
capabilities: { profileTls: { enabled: false, reason: 'test' } },
allowedLocalDirs: [],
jobLogMaxBytes: null,
jobRetentionSeconds: null,
uploadSessionTTLSeconds: 86400,
uploadMaxBytes: null,
uploadDirectStream: false,
transferEngine: {
name: 'rclone',
available: true,
compatible: true,
minVersion: 'v1.66.0',
path: '/usr/local/bin/rclone',
version: 'v1.66.0',
},
}),
),
},
{
method: 'GET',
path: '/profiles',
handle: ({ json }) => json([buildProfileFixture({ id: profileId, name: 'Playwright Webview' })]),
},
{
method: 'GET',
path: '/buckets',
handle: ({ json }) => json([buildBucketFixture(bucket)]),
},
{
method: 'GET',
path: `/buckets/${bucket}/objects`,
handle: ({ json, url }) =>
json(
buildObjectsListFixture({
bucket,
prefix: url.searchParams.get('prefix') ?? '',
commonPrefixes: [prefix],
items: [],
}),
),
},
{
method: 'GET',
path: `/buckets/${bucket}/objects/favorites`,
handle: ({ json, url }) =>
json(
buildFavoritesFixture({
bucket,
prefix: url.searchParams.get('prefix') ?? '',
items: [],
}),
),
},
{
method: 'GET',
path: '/jobs',
handle: ({ json }) => json({ items: jobs, nextCursor: null }),
},
{
method: 'POST',
path: '/realtime-ticket',
handle: async ({ json, url, delay }) => {
const transport = url.searchParams.get('transport') ?? 'ws'
const delayMs = args.ticketDelayMsByTransport?.[transport as 'ws' | 'sse']
if (typeof delayMs === 'number' && delayMs > 0) {
	await delay(delayMs)
}
return json({ ticket: `${transport}-ticket` })
},
},
{
method: 'GET',
path: '/jobs/health',
handle: ({ json }) => json({ queueDepth: 0, workersBusy: 0, workersTotal: 2 }),
},
{
method: 'GET',
path: '/jobs/stats',
handle: ({ json }) =>
json({
queued: jobs.filter((job) => job.status === 'queued').length,
running: jobs.filter((job) => job.status === 'running').length,
succeeded: jobs.filter((job) => job.status === 'succeeded').length,
failed: jobs.filter((job) => job.status === 'failed').length,
canceled: jobs.filter((job) => job.status === 'canceled').length,
}),
},
{
method: 'GET',
path: '/jobs/types',
handle: ({ json }) => json({ items: [] }),
},
{
method: 'GET',
path: '/jobs/error-codes',
handle: ({ json }) => json({ items: [] }),
},
{
method: 'GET',
path: '/jobs/columns',
handle: ({ json }) =>
json({
columns: [
{ key: 'status', visible: true },
{ key: 'type', visible: true },
{ key: 'target', visible: true },
{ key: 'updatedAt', visible: true },
],
}),
},
{
path: /.*/,
handle: ({ json }) => json({}),
},
])

return {
setJobs(nextJobs: JobRecord[]) {
jobs = [...nextJobs]
},
}
}

test.describe('webview realtime QA coverage', () => {
test('WV-010 keeps the Jobs view visibly connected while status updates arrive', async ({ page }) => {
const jobId = 'job-webview-live'
const runningJob = buildUploadJob(jobId)
const completedJob = buildUploadJob(jobId, {
status: 'succeeded',
progress: { bytesDone: 4096, bytesTotal: 4096 },
finishedAt: now,
})

await installMockRealtimeRuntime(page, {
wsBehaviors: [{ openDelayMs: 50 }],
})
const apiState = await installWebviewRealtimeJobsApi(page, [runningJob])
await seedWebviewStorage(page)

await page.goto('/jobs')
await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
await expect(page.getByText('Realtime: WS')).toBeVisible({ timeout: 10_000 })
await expect(page.getByText('Realtime updates disconnected')).toHaveCount(0)

const jobRow = page.getByRole('row', { name: new RegExp(jobId, 'i') })
await expect(jobRow).toBeVisible()
await expect(jobRow.getByText('running', { exact: true })).toBeVisible()

apiState.setJobs([completedJob])
await page.evaluate((event) => {
(window as Window & {
__webviewRealtimeMock: { emitWebSocketMessage: (index: number, data: unknown) => void }
}).__webviewRealtimeMock.emitWebSocketMessage(0, event)
}, {
type: 'job.completed',
seq: 1,
jobId,
payload: {
status: completedJob.status,
progress: completedJob.progress,
error: completedJob.error,
errorCode: completedJob.errorCode,
},
})

await expect(jobRow.getByText('succeeded', { exact: true })).toBeVisible({ timeout: 10_000 })
await expect(page.getByText('Realtime: WS')).toBeVisible()
})

test('WV-011 shows a disconnect warning and reconnects Jobs after interruption', async ({ page }) => {
const jobId = 'job-webview-reconnect'
const runningJob = buildUploadJob(jobId)
const completedJob = buildUploadJob(jobId, {
status: 'succeeded',
progress: { bytesDone: 4096, bytesTotal: 4096 },
finishedAt: now,
})

	await installMockRealtimeRuntime(page, {
	wsBehaviors: [{ openDelayMs: 50 }],
	esBehaviors: [{ openDelayMs: 100 }],
	})
	const apiState = await installWebviewRealtimeJobsApi(page, [runningJob], {
		ticketDelayMsByTransport: { sse: 75 },
	})
	await seedWebviewStorage(page)

await page.goto('/jobs')
await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
await expect(page.getByText('Realtime: WS')).toBeVisible({ timeout: 10_000 })

const jobRow = page.getByRole('row', { name: new RegExp(jobId, 'i') })
await expect(jobRow).toBeVisible()
await expect(jobRow.getByText('running', { exact: true })).toBeVisible()

	await page.evaluate(() => {
	(window as Window & {
	__webviewRealtimeMock: { closeWebSocket: (index: number) => void }
	}).__webviewRealtimeMock.closeWebSocket(0)
	})
	await expect(page.getByText('Realtime updates disconnected')).toBeVisible({ timeout: 10_000 })
	await expect(page.getByText('Reconnecting… attempt 1')).toBeVisible({ timeout: 10_000 })

	apiState.setJobs([completedJob])

	await expect(page.getByText('Realtime: SSE')).toBeVisible({ timeout: 10_000 })
	await expect(page.getByText('Realtime updates disconnected')).toHaveCount(0)
	await expect(jobRow.getByText('succeeded', { exact: true })).toBeVisible({ timeout: 10_000 })
})
})
