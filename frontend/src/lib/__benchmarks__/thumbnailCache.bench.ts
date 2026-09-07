import { bench, describe } from 'vitest'

import { buildThumbnailCacheKey, createThumbnailCache } from '../thumbnailCache'

for (const count of [400, 2000]) {
	describe(`thumbnail cache (${count} entries)`, () => {
		const cache = createThumbnailCache({ maxEntries: count })
		const request = { apiToken: 'benchmark', profileId: 'profile', bucket: 'bucket', objectKey: 'image.png', size: 96 }
		for (let i = 0; i < count; i++) {
			cache.set(buildThumbnailCacheKey({ ...request, objectKey: `${i}.png` }), `blob:${i}`)
		}
		const cachedRequest = { ...request, objectKey: `${count - 1}.png` }

		bench('exact size hit', () => {
			cache.findBestMatch(cachedRequest)
		}, { time: 300, warmupTime: 100 })
	})
}
