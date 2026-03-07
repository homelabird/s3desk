import { describe, expect, it } from 'vitest'

import { isObjectsRefreshRelevant } from '../objectsRefreshEvents'

describe('objectsRefreshEvents', () => {
	it('treats ancestor prefixes as relevant', () => {
		expect(
			isObjectsRefreshRelevant(
				{ profileId: 'profile-1', bucket: 'bucket-a', prefix: '' },
				{ profileId: 'profile-1', bucket: 'bucket-a', prefix: 'photos/2026/', source: 'upload' },
			),
		).toBe(true)

		expect(
			isObjectsRefreshRelevant(
				{ profileId: 'profile-1', bucket: 'bucket-a', prefix: 'photos/' },
				{ profileId: 'profile-1', bucket: 'bucket-a', prefix: 'photos/2026/', source: 'upload' },
			),
		).toBe(true)
	})

	it('ignores unrelated bucket, profile, or sibling prefixes', () => {
		expect(
			isObjectsRefreshRelevant(
				{ profileId: 'profile-1', bucket: 'bucket-a', prefix: 'videos/' },
				{ profileId: 'profile-1', bucket: 'bucket-a', prefix: 'photos/2026/', source: 'upload' },
			),
		).toBe(false)
		expect(
			isObjectsRefreshRelevant(
				{ profileId: 'profile-1', bucket: 'bucket-a', prefix: '' },
				{ profileId: 'profile-2', bucket: 'bucket-a', prefix: '', source: 'upload' },
			),
		).toBe(false)
	})
})
