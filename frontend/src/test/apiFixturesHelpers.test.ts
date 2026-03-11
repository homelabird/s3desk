import { afterEach, describe, expect, it, vi } from 'vitest'

import {
	abortFixture,
	buildFixtureRoutes,
	jsonFixture,
	sequenceFixture,
	withDelay,
} from '../../tests/support/apiFixtures'
import type { MockApiContext } from '../../tests/support/apiFixtures'

function createMockApiContext(overrides: Partial<MockApiContext> = {}) {
	const fulfill = vi.fn().mockResolvedValue(undefined)
	const routeAbort = vi.fn().mockResolvedValue(undefined)
	const route = {
		fulfill,
		abort: routeAbort,
	} as unknown as MockApiContext['route']

	const ctx = {
		route,
		request: {} as MockApiContext['request'],
		url: new URL('http://localhost/api/v1/test'),
		path: '/api/v1/test',
		method: 'GET',
		delay: async (ms: number) => {
			if (ms <= 0) return
			await new Promise<void>((resolve) => {
				setTimeout(resolve, ms)
			})
		},
		abort: (errorCode) => routeAbort(errorCode),
		json: (body: unknown, status = 200) =>
			fulfill({
				status,
				contentType: 'application/json',
				body: JSON.stringify(body),
			}),
		text: (body: string, status = 200, contentType = 'text/plain') =>
			fulfill({
				status,
				contentType,
				body,
			}),
		empty: (status = 204) => fulfill({ status }),
		notFound: () =>
			fulfill({
				status: 404,
				contentType: 'application/json',
				body: JSON.stringify({ error: { code: 'not_found', message: 'not found' } }),
			}),
		...overrides,
	} as MockApiContext

	return { ctx, fulfill, routeAbort }
}

describe('api fixture helpers', () => {
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it('delays fixture fulfillment until the configured time has elapsed', async () => {
		vi.useFakeTimers()
		const [route] = buildFixtureRoutes([withDelay(jsonFixture('GET', '/test', { ok: true }), 200)])
		const { ctx, fulfill } = createMockApiContext()

		const pending = route?.handle(ctx)
		expect(fulfill).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(199)
		expect(fulfill).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(1)
		await pending

		expect(fulfill).toHaveBeenCalledWith({
			status: 200,
			contentType: 'application/json',
			headers: undefined,
			body: JSON.stringify({ ok: true }),
		})
	})

	it('aborts the request instead of fulfilling it when abortFixture is used', async () => {
		const [route] = buildFixtureRoutes([abortFixture('GET', '/test', 'failed')])
		const { ctx, fulfill, routeAbort } = createMockApiContext()

		await route?.handle(ctx)

		expect(routeAbort).toHaveBeenCalledWith('failed')
		expect(fulfill).not.toHaveBeenCalled()
	})

	it('replays the last response in a sequence to model fail-then-retry success flows', async () => {
		const [route] = buildFixtureRoutes([
			sequenceFixture('GET', '/test', [
				{ status: 503, json: { error: { code: 'unavailable', message: 'try again' } } },
				{ json: { ok: true } },
			]),
		])

		const first = createMockApiContext()
		await route?.handle(first.ctx)
		expect(first.fulfill).toHaveBeenCalledWith({
			status: 503,
			contentType: 'application/json',
			headers: undefined,
			body: JSON.stringify({ error: { code: 'unavailable', message: 'try again' } }),
		})

		const second = createMockApiContext()
		await route?.handle(second.ctx)
		expect(second.fulfill).toHaveBeenCalledWith({
			status: 200,
			contentType: 'application/json',
			headers: undefined,
			body: JSON.stringify({ ok: true }),
		})

		const third = createMockApiContext()
		await route?.handle(third.ctx)
		expect(third.fulfill).toHaveBeenCalledWith({
			status: 200,
			contentType: 'application/json',
			headers: undefined,
			body: JSON.stringify({ ok: true }),
		})
	})
})
