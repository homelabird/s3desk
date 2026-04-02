import { describe, expect, it } from 'vitest'

import { isObjectsRefreshRelevant } from '../objectsRefreshEvents'

describe('objectsRefreshEvents', () => {
	it('treats ancestor prefixes as relevant', () => {
		expect(
			isObjectsRefreshRelevant(
				{ apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a', prefix: '' },
				{ apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'photos/2026/', source: 'upload' },
			),
		).toBe(true)

		expect(
			isObjectsRefreshRelevant(
				{ apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'photos/' },
				{ apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'photos/2026/', source: 'upload' },
			),
		).toBe(true)
	})

	it('ignores unrelated api token, bucket, profile, or sibling prefixes', () => {
		expect(
			isObjectsRefreshRelevant(
				{ apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a', prefix: '' },
				{ apiToken: 'token-b', profileId: 'profile-1', bucket: 'bucket-a', prefix: '', source: 'upload' },
			),
		).toBe(false)
		expect(
			isObjectsRefreshRelevant(
				{ apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'videos/' },
				{ apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'photos/2026/', source: 'upload' },
			),
		).toBe(false)
		expect(
			isObjectsRefreshRelevant(
				{ apiToken: 'token-a', profileId: 'profile-1', bucket: 'bucket-a', prefix: '' },
				{ apiToken: 'token-a', profileId: 'profile-2', bucket: 'bucket-a', prefix: '', source: 'upload' },
			),
		).toBe(false)
	})
})
