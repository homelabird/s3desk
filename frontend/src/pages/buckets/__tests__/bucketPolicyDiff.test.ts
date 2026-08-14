import { describe, expect, it } from 'vitest'

import { getUnifiedDiffStats, unifiedDiff } from '../bucketPolicyDiff'

describe('bucketPolicyDiff', () => {
	it('keeps a minimal line diff with repeated content', () => {
		const diff = unifiedDiff('a\nshared\nb\nshared\nc', 'a\nshared\nx\nshared\nc')

		expect(getUnifiedDiffStats(diff)).toEqual({ added: 1, removed: 1 })
		expect(diff).toContain('-b')
		expect(diff).toContain('+x')
	})

	it('handles large disjoint policies without a quadratic matrix', () => {
		const from = Array.from({ length: 1_500 }, (_, i) => `old-${i}`).join('\n')
		const to = Array.from({ length: 1_500 }, (_, i) => `new-${i}`).join('\n')

		expect(getUnifiedDiffStats(unifiedDiff(from, to))).toEqual({ added: 1_500, removed: 1_500 })
	})

	it('skips unchanged edges around a small edit', () => {
		const sharedPrefix = Array.from({ length: 2_000 }, (_, i) => `prefix-${i}`)
		const sharedSuffix = Array.from({ length: 2_000 }, (_, i) => `suffix-${i}`)
		const from = [...sharedPrefix, 'old', ...sharedSuffix].join('\n')
		const to = [...sharedPrefix, 'new', ...sharedSuffix].join('\n')

		expect(getUnifiedDiffStats(unifiedDiff(from, to))).toEqual({ added: 1, removed: 1 })
	})
})
