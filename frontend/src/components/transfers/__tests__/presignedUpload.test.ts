import { describe, expect, it } from 'vitest'

import { planPresignedMultipart } from '../presignedUpload'

describe('planPresignedMultipart', () => {
	it('returns null for invalid or below-threshold sizes', () => {
		expect(planPresignedMultipart({ fileSize: 0, partSizeBytes: 10, thresholdBytes: 1 })).toBeNull()
		expect(planPresignedMultipart({ fileSize: 10, partSizeBytes: 10, thresholdBytes: 11 })).toBeNull()
	})

	it('clamps part size to the minimum', () => {
		const min = 5 * 1024 * 1024
		const plan = planPresignedMultipart({ fileSize: min * 2, partSizeBytes: 1, thresholdBytes: 1 })
		expect(plan).not.toBeNull()
		expect(plan?.partSizeBytes).toBe(min)
		expect(plan?.partCount).toBe(2)
	})

	it('returns null if the computed part count would be 1', () => {
		const min = 5 * 1024 * 1024
		expect(planPresignedMultipart({ fileSize: min, partSizeBytes: min * 10, thresholdBytes: 1 })).toBeNull()
	})

	it('adjusts part size when exceeding max parts', () => {
		const min = 5 * 1024 * 1024
		const maxParts = 10_000
		const fileSize = min*maxParts + 1
		const plan = planPresignedMultipart({ fileSize, partSizeBytes: min, thresholdBytes: 1 })
		expect(plan).not.toBeNull()
		expect(plan?.partCount).toBeLessThanOrEqual(maxParts)
		expect(plan?.partSizeBytes).toBeGreaterThanOrEqual(min)
	})
})

