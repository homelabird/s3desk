import type { Page } from '@playwright/test'

import { installMockApi, type MockApiContext, type MockApiRoute } from './mockApi'

type ApiFixtureResponse = {
	status?: number
	headers?: Record<string, string>
	contentType?: string
	body?: string
	json?: unknown
}

type ApiFixtureResult = ApiFixtureResponse | void

type ApiFixture = {
	method?: string
	path: string | RegExp
	handler: (ctx: MockApiContext) => ApiFixtureResult | Promise<ApiFixtureResult>
}

const defaultMetaResponse = {
	version: 'test',
	serverAddr: '127.0.0.1:8080',
	dataDir: '/data',
	staticDir: '/app/ui',
	apiTokenEnabled: true,
	encryptionEnabled: false,
	dbBackend: 'sqlite',
	capabilities: {
		profileTls: { enabled: false, reason: 'test' },
		serverBackup: {
			export: { enabled: true, reason: '' },
			restoreStaging: { enabled: true, reason: '' },
		},
	},
	allowedLocalDirs: [],
	jobConcurrency: 2,
	jobLogMaxBytes: null,
	jobRetentionSeconds: null,
	uploadSessionTTLSeconds: 3600,
	uploadMaxBytes: null,
	uploadDirectStream: false,
	transferEngine: { name: 'rclone', available: true, path: '/usr/local/bin/rclone', version: 'v1.66.0' },
}

async function fulfillFixtureResponse(ctx: MockApiContext, response: ApiFixtureResponse) {
	if (response.json !== undefined) {
		return ctx.route.fulfill({
			status: response.status ?? 200,
			contentType: response.contentType ?? 'application/json',
			headers: response.headers,
			body: JSON.stringify(response.json),
		})
	}
	return ctx.route.fulfill({
		status: response.status ?? 200,
		contentType: response.contentType,
		headers: response.headers,
		body: response.body ?? '',
	})
}

export type { ApiFixture, ApiFixtureResponse }
export type { MockApiContext, MockApiRoute } from './mockApi'
export { installMockApi } from './mockApi'
export { seedLocalStorage } from './storage'

export function metaJson(overrides: Partial<typeof defaultMetaResponse> = {}) {
	return {
		...defaultMetaResponse,
		...overrides,
	}
}

export function buildMetaFixture(overrides: Partial<typeof defaultMetaResponse> = {}) {
	return metaJson(overrides)
}

export function buildProfileFixture(overrides: Record<string, unknown> = {}) {
	return {
		id: 'playwright-profile',
		name: 'Playwright',
		provider: 's3_compatible',
		endpoint: 'http://localhost:9000',
		region: 'us-east-1',
		forcePathStyle: true,
		preserveLeadingSlash: false,
		tlsInsecureSkipVerify: true,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		...overrides,
	}
}

export function buildBucketFixture(name: string, overrides: Record<string, unknown> = {}) {
	return {
		name,
		createdAt: '2024-01-01T00:00:00Z',
		...overrides,
	}
}

export function buildObjectsListFixture(args: {
	bucket: string
	prefix?: string
	commonPrefixes?: string[]
	items?: unknown[]
	nextContinuationToken?: string | null
	isTruncated?: boolean
}) {
	return {
		bucket: args.bucket,
		prefix: args.prefix ?? '',
		delimiter: '/',
		commonPrefixes: args.commonPrefixes ?? [],
		items: args.items ?? [],
		nextContinuationToken: args.nextContinuationToken ?? null,
		isTruncated: args.isTruncated ?? false,
	}
}

export function buildFavoritesFixture(args: {
	bucket: string
	prefix?: string
	items?: unknown[]
}) {
	return {
		bucket: args.bucket,
		prefix: args.prefix ?? '',
		items: args.items ?? [],
	}
}

export function jsonFixture(method: string, path: string | RegExp, json: unknown, init: Omit<ApiFixtureResponse, 'json'> = {}): ApiFixture {
	return {
		method,
		path,
		handler: () => ({ ...init, json }),
	}
}

export function textFixture(method: string, path: string | RegExp, body: string, init: Omit<ApiFixtureResponse, 'body'> = {}): ApiFixture {
	return {
		method,
		path,
		handler: () => ({ ...init, body }),
	}
}

export function errorFixture(method: string, path: string | RegExp, status: number, code: string, message: string): ApiFixture {
	return jsonFixture(method, path, { error: { code, message } }, { status })
}

export function retryAfterErrorResponse(status: number, code: string, message: string, retryAfterSeconds: number): ApiFixtureResponse {
	return {
		status,
		headers: { 'Retry-After': String(retryAfterSeconds) },
		json: { error: { code, message } },
	}
}

export function withDelay(fixture: ApiFixture, delayMs: number): ApiFixture {
	return {
		...fixture,
		handler: async (ctx) => {
			await ctx.delay(delayMs)
			return fixture.handler(ctx)
		},
	}
}

export function abortFixture(
	method: string,
	path: string | RegExp,
	errorCode?: Parameters<MockApiContext['abort']>[0],
): ApiFixture {
	return {
		method,
		path,
		handler: (ctx) => ctx.abort(errorCode),
	}
}

export function sequenceFixture(
	method: string,
	path: string | RegExp,
	steps: Array<ApiFixtureResponse | ((ctx: MockApiContext, attempt: number) => ApiFixtureResult | Promise<ApiFixtureResult>)>,
): ApiFixture {
	let attempts = 0
	return {
		method,
		path,
		handler: async (ctx) => {
			attempts += 1
			const step = steps[Math.min(attempts - 1, steps.length - 1)]
			if (typeof step === 'function') {
				return step(ctx, attempts)
			}
			return step
		},
	}
}

export function buildFixtureRoutes(fixtures: ApiFixture[], fallback?: ApiFixtureResponse): MockApiRoute[] {
	const routes: MockApiRoute[] = fixtures.map((fixture) => ({
		method: fixture.method,
		path: fixture.path,
		handle: async (ctx) => {
			const response = await fixture.handler(ctx)
			if (response === undefined) return
			await fulfillFixtureResponse(ctx, response)
		},
	}))

	if (fallback) {
		routes.push({
			path: /.*/,
			handle: (ctx) => fulfillFixtureResponse(ctx, fallback),
		})
	}

	return routes
}

export async function installApiFixtures(page: Page, fixtures: ApiFixture[], fallback?: ApiFixtureResponse) {
	const routes = buildFixtureRoutes(fixtures, fallback)
	await installMockApi(page, routes)
}
