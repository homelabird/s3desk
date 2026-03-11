import type { Page, Request, Route } from '@playwright/test'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type MockApiContext = {
	route: Route
	request: Request
	url: URL
	path: string
	method: string
	delay: (ms: number) => Promise<void>
	abort: (errorCode?: Parameters<Route['abort']>[0]) => Promise<void>
	json: (body: unknown, status?: number) => Promise<void>
	text: (body: string, status?: number, contentType?: string) => Promise<void>
	empty: (status?: number) => Promise<void>
	notFound: () => Promise<void>
}

export type MockApiRoute = {
	method?: string
	path: string | RegExp
	handle: (ctx: MockApiContext) => Promise<void> | void
}

export type MockApiAbortErrorCode = NonNullable<Parameters<Route['abort']>[0]>

function normalizeApiPath(path: string): string {
	if (path.startsWith('/api/v1/')) return path
	if (path === '/api/v1') return path
	return `/api/v1${path.startsWith('/') ? path : `/${path}`}`
}

function matchesRoute(route: MockApiRoute, method: string, path: string): boolean {
	if (route.method && route.method.toUpperCase() !== method.toUpperCase()) return false
	if (typeof route.path === 'string') return normalizeApiPath(route.path) === path
	return route.path.test(path)
}

function buildContext(route: Route): MockApiContext {
	const request = route.request()
	const url = new URL(request.url())
	const path = url.pathname
	const method = request.method()

	return {
		route,
		request,
		url,
		path,
		method,
		delay: async (ms: number) => {
			if (ms > 0) await sleep(ms)
		},
		abort: (errorCode = 'failed') => route.abort(errorCode),
		json: (body, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
		text: (body, status = 200, contentType = 'text/plain') =>
			route.fulfill({ status, contentType, body }),
		empty: (status = 204) => route.fulfill({ status }),
		notFound: () =>
			route.fulfill({
				status: 404,
				contentType: 'application/json',
				body: JSON.stringify({ error: { code: 'not_found', message: 'not found' } }),
			}),
	}
}

export async function waitForMockApi(delayMs: number): Promise<void> {
	if (!Number.isFinite(delayMs) || delayMs <= 0) return
	await new Promise<void>((resolve) => {
		setTimeout(resolve, delayMs)
	})
}

export function withMockApiDelay(delayMs: number, handle: MockApiRoute['handle']): MockApiRoute['handle'] {
	return async (ctx) => {
		await waitForMockApi(delayMs)
		return handle(ctx)
	}
}

export function abortMockApi(errorCode: MockApiAbortErrorCode = 'failed'): MockApiRoute['handle'] {
	return ({ route }) => route.abort(errorCode)
}

export function sequenceMockApiRoutes(
	handlers: Array<MockApiRoute['handle']>,
	options: { repeatLast?: boolean } = {},
): MockApiRoute['handle'] {
	const { repeatLast = true } = options
	let callCount = 0

	return async (ctx) => {
		if (handlers.length === 0) {
			throw new Error('sequenceMockApiRoutes requires at least one handler')
		}

		const index = repeatLast ? Math.min(callCount, handlers.length - 1) : callCount % handlers.length
		callCount += 1
		return handlers[index]?.(ctx)
	}
}

export async function installMockApi(page: Page, routes: MockApiRoute[]) {
	await page.route('**/api/v1/**', async (route) => {
		const ctx = buildContext(route)
		const matched = routes.find((entry) => matchesRoute(entry, ctx.method, ctx.path))
		if (!matched) {
			return ctx.notFound()
		}
		return matched.handle(ctx)
	})
}
