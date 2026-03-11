import { describe, expect, it, vi } from 'vitest'

import {
	abortFixture,
	retryAfterErrorResponse,
	sequenceFixture,
	withDelay,
	type MockApiContext,
} from '../../tests/support/apiFixtures'

function createContext() {
	const ctx = {
		delay: vi.fn().mockResolvedValue(undefined),
		abort: vi.fn().mockResolvedValue(undefined),
	} as unknown as MockApiContext
	return ctx
}

describe('apiFixtures helpers', () => {
	it('wraps an existing fixture with an artificial delay', async () => {
		const fixture = withDelay(
			{
				method: 'GET',
				path: '/meta',
				handler: () => ({ json: { ok: true } }),
			},
			250,
		)
		const ctx = createContext()

		const response = await fixture.handler(ctx)

		expect(ctx.delay).toHaveBeenCalledWith(250)
		expect(response).toEqual({ json: { ok: true } })
	})

	it('replays sequence steps and then sticks to the last response', async () => {
		const fixture = sequenceFixture('GET', '/jobs', [
			retryAfterErrorResponse(503, 'queue_full', 'busy', 2),
			{ json: { items: ['ok'] } },
		])
		const ctx = createContext()

		await expect(fixture.handler(ctx)).resolves.toEqual({
			status: 503,
			headers: { 'Retry-After': '2' },
			json: { error: { code: 'queue_full', message: 'busy' } },
		})
		await expect(fixture.handler(ctx)).resolves.toEqual({ json: { items: ['ok'] } })
		await expect(fixture.handler(ctx)).resolves.toEqual({ json: { items: ['ok'] } })
	})

	it('creates an aborting fixture for network failure simulations', async () => {
		const fixture = abortFixture('GET', '/events', 'failed')
		const ctx = createContext()

		await fixture.handler(ctx)

		expect(ctx.abort).toHaveBeenCalledWith('failed')
	})
})
