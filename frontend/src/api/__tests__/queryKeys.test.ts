import { describe, expect, it } from 'vitest'

import { parseObjectsListQueryKey, queryKeys } from '../queryKeys'

describe('queryKeys', () => {
	it('centralizes bucket policy and governance keys without changing cache identity', () => {
		expect(queryKeys.buckets.policy('profile-1', 'bucket-a', 'token-a')).toEqual([
			'bucketPolicy',
			'profile-1',
			'bucket-a',
			'token-a',
		])
		expect(queryKeys.buckets.governance('profile-1', 'bucket-a', 'token-a')).toEqual([
			'bucketGovernance',
			'profile-1',
			'bucket-a',
			'token-a',
		])
	})

	it('centralizes upload etag keys without changing cache identity', () => {
		expect(queryKeys.jobs.uploadEtags('profile-1', 'bucket-a', 'a.txt|b.txt', 'token-a')).toEqual([
			'upload-etags',
			'profile-1',
			'bucket-a',
			'a.txt|b.txt',
			'token-a',
		])
	})

	it('parses centralized objects list keys', () => {
		expect(parseObjectsListQueryKey(queryKeys.objects.list('profile-1', 'bucket-a', 'alpha/', 'token-a'))).toEqual({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'alpha/',
			apiToken: 'token-a',
		})
	})

	it('keeps legacy objects list keys readable for cache predicates', () => {
		expect(parseObjectsListQueryKey(['objects', 'profile-1', 'bucket-a', 'alpha/', 'token-a'])).toEqual({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'alpha/',
			apiToken: 'token-a',
		})
	})

	it('rejects non-list objects keys', () => {
		expect(
			parseObjectsListQueryKey(
				queryKeys.objects.indexSearch({
					profileId: 'profile-1',
					bucket: 'bucket-a',
					query: 'report',
					prefix: '',
					limit: 50,
					ext: '',
					minSize: null,
					maxSize: null,
					modifiedAfter: undefined,
					modifiedBefore: undefined,
					apiToken: 'token-a',
				}),
			),
		).toBeNull()
	})
})
