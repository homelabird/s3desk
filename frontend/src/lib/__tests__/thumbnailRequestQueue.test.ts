import { beforeEach, expect, it, vi } from 'vitest'

let scheduleThumbnailRequest: typeof import('../thumbnailRequestQueue').scheduleThumbnailRequest

beforeEach(async () => {
	vi.resetModules()
	;({ scheduleThumbnailRequest } = await import('../thumbnailRequestQueue'))
	window.localStorage.removeItem('objectsCostMode')
})

it('drains a large thumbnail queue in order within the concurrency limit', async () => {
	window.localStorage.removeItem('objectsCostMode')
	const releases: Array<() => void> = []
	const started: number[] = []
	const handles = Array.from({ length: 200 }, (_, index) =>
		scheduleThumbnailRequest(() => {
			started.push(index)
			let release = () => {}
			const promise = new Promise<number>((resolve) => {
				release = () => resolve(index)
			})
			releases.push(release)
			return { promise, abort: vi.fn() }
		}),
	)

	expect(started).toEqual([0, 1, 2, 3])
	let released = 0
	while (released < releases.length || started.length < handles.length) {
		while (released < releases.length) releases[released++]?.()
		await Promise.resolve()
		await Promise.resolve()
	}

	await expect(Promise.all(handles.map((handle) => handle.promise))).resolves.toHaveLength(200)
	expect(started).toEqual(Array.from({ length: 200 }, (_, index) => index))
})

it('releases slots when starting a request throws synchronously', async () => {
	const error = new Error('XHR send failed')
	for (let i = 0; i < 4; i++) {
		const handle = scheduleThumbnailRequest(() => { throw error })
		await expect(handle.promise).rejects.toBe(error)
	}
	const start = vi.fn(() => ({ promise: Promise.resolve('thumbnail'), abort: vi.fn() }))
	const next = scheduleThumbnailRequest(start)
	expect(start).toHaveBeenCalledOnce()
	await expect(next.promise).resolves.toBe('thumbnail')
})

it('rejects a queued start failure and continues with later requests', async () => {
	let release = () => {}
	const pending = new Promise<void>((resolve) => { release = resolve })
	const running = Array.from({ length: 4 }, () =>
		scheduleThumbnailRequest(() => ({ promise: pending, abort: vi.fn() })),
	)
	const error = new Error('XHR open failed')
	const failed = scheduleThumbnailRequest(() => { throw error })
	const onFailure = vi.fn()
	void failed.promise.catch(onFailure)
	const next = scheduleThumbnailRequest(() => ({ promise: Promise.resolve('next'), abort: vi.fn() }))
	release()
	await Promise.all(running.map((handle) => handle.promise))
	await expect(next.promise).resolves.toBe('next')
	expect(onFailure).toHaveBeenCalledWith(error)
})
