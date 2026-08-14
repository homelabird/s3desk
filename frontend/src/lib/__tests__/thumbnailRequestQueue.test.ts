import { expect, it, vi } from 'vitest'

import { scheduleThumbnailRequest } from '../thumbnailRequestQueue'

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
