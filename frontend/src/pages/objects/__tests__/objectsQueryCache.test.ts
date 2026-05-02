import { describe, expect, it } from 'vitest'

import { queryKeys } from '../../../api/queryKeys'
import {
	getVisibleCreatedPrefix,
	hasVisiblePrefixInObjectsData,
	insertOptimisticPrefixIntoObjectsData,
	isObjectsQueryKeyRelevantToPrefix,
} from '../objectsQueryCache'

describe('objectsQueryCache', () => {
	it('derives the visible created prefix relative to the current parent prefix', () => {
		expect(getVisibleCreatedPrefix('', 'alpha/beta/')).toBe('alpha/')
		expect(getVisibleCreatedPrefix('alpha/', 'alpha/beta/gamma/')).toBe('alpha/beta/')
	})

	it('optimistically inserts a prefix into the first objects page', () => {
		const data = {
			pages: [
				{
					bucket: 'bucket-a',
					prefix: '',
					delimiter: '/',
					commonPrefixes: ['existing/'],
					items: [],
					isTruncated: false,
				},
			],
			pageParams: [undefined],
		}

		const next = insertOptimisticPrefixIntoObjectsData(data, 'alpha/')
		expect(next?.pages[0]?.commonPrefixes).toEqual(['alpha/', 'existing/'])
	})

	it('does not duplicate an already inserted prefix', () => {
		const data = {
			pages: [
				{
					bucket: 'bucket-a',
					prefix: '',
					delimiter: '/',
					commonPrefixes: ['alpha/'],
					items: [],
					isTruncated: false,
				},
			],
			pageParams: [undefined],
		}

		expect(insertOptimisticPrefixIntoObjectsData(data, 'alpha/')).toBe(data)
	})

	it('detects whether a visible prefix exists in any cached page', () => {
		const data = {
			pages: [
				{
					bucket: 'bucket-a',
					prefix: '',
					delimiter: '/',
					commonPrefixes: ['alpha/'],
					items: [],
					isTruncated: true,
				},
				{
					bucket: 'bucket-a',
					prefix: '',
					delimiter: '/',
					commonPrefixes: ['beta/'],
					items: [],
					isTruncated: false,
				},
			],
			pageParams: [undefined, 'next'],
		}

		expect(hasVisiblePrefixInObjectsData(data, 'beta/')).toBe(true)
		expect(hasVisiblePrefixInObjectsData(data, 'gamma/')).toBe(false)
	})

	it('matches objects queries that are related to the changed prefix', () => {
		const location = {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			changedPrefix: 'alpha/beta/',
			apiToken: 'token-a',
		}
		const listKey = (profileId: string, bucket: string, prefix: string, apiToken: string) =>
			queryKeys.objects.list(profileId, bucket, prefix, apiToken)
		const isRelevant = (queryKey: readonly unknown[]) => isObjectsQueryKeyRelevantToPrefix(queryKey, location)

		expect(isRelevant(listKey('profile-1', 'bucket-a', '', 'token-a'))).toBe(true)
		expect(isRelevant(listKey('profile-1', 'bucket-a', 'alpha/', 'token-a'))).toBe(true)
		expect(isRelevant(listKey('profile-1', 'bucket-a', 'alpha/beta/', 'token-a'))).toBe(true)
		expect(isRelevant(listKey('profile-1', 'bucket-a', 'alpha/beta/gamma/', 'token-a'))).toBe(true)
		expect(isRelevant(listKey('profile-1', 'bucket-a', 'alpha/', 'token-b'))).toBe(false)
		expect(isRelevant(listKey('profile-1', 'bucket-a', 'other/', 'token-a'))).toBe(false)
		expect(isRelevant(listKey('profile-2', 'bucket-a', 'alpha/', 'token-a'))).toBe(false)
		expect(
			isRelevant(
				queryKeys.objects.indexSearch({
					profileId: 'profile-1',
					bucket: 'bucket-a',
					query: 'alpha',
					prefix: 'alpha/',
					limit: 50,
					ext: '',
					minSize: null,
					maxSize: null,
					modifiedAfter: undefined,
					modifiedBefore: undefined,
					apiToken: 'token-a',
				}),
			),
		).toBe(false)
	})

	it('treats an empty changed prefix as bucket-wide for objects queries', () => {
		const location = {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			changedPrefix: '',
			apiToken: 'token-a',
		}
		const listKey = (profileId: string, bucket: string, prefix: string, apiToken: string) =>
			queryKeys.objects.list(profileId, bucket, prefix, apiToken)
		const isRelevant = (queryKey: readonly unknown[]) => isObjectsQueryKeyRelevantToPrefix(queryKey, location)

		expect(isRelevant(listKey('profile-1', 'bucket-a', '', 'token-a'))).toBe(true)
		expect(isRelevant(listKey('profile-1', 'bucket-a', 'alpha/', 'token-a'))).toBe(true)
		expect(isRelevant(listKey('profile-1', 'bucket-a', 'alpha/', 'token-b'))).toBe(false)
		expect(isRelevant(listKey('profile-1', 'bucket-b', 'alpha/', 'token-a'))).toBe(false)
	})
})
