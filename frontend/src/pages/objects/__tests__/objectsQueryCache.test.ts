import { describe, expect, it } from 'vitest'

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
		}

		expect(isObjectsQueryKeyRelevantToPrefix(['objects', 'profile-1', 'bucket-a', '', 'token'], location)).toBe(true)
		expect(isObjectsQueryKeyRelevantToPrefix(['objects', 'profile-1', 'bucket-a', 'alpha/', 'token'], location)).toBe(true)
		expect(isObjectsQueryKeyRelevantToPrefix(['objects', 'profile-1', 'bucket-a', 'alpha/beta/', 'token'], location)).toBe(true)
		expect(isObjectsQueryKeyRelevantToPrefix(['objects', 'profile-1', 'bucket-a', 'alpha/beta/gamma/', 'token'], location)).toBe(true)
		expect(isObjectsQueryKeyRelevantToPrefix(['objects', 'profile-1', 'bucket-a', 'other/', 'token'], location)).toBe(false)
		expect(isObjectsQueryKeyRelevantToPrefix(['objects', 'profile-2', 'bucket-a', 'alpha/', 'token'], location)).toBe(false)
		expect(isObjectsQueryKeyRelevantToPrefix(['objectsIndexSearch', 'profile-1', 'bucket-a', 'alpha/', 'token'], location)).toBe(false)
	})

	it('treats an empty changed prefix as bucket-wide for objects queries', () => {
		const location = {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			changedPrefix: '',
		}

		expect(isObjectsQueryKeyRelevantToPrefix(['objects', 'profile-1', 'bucket-a', '', 'token'], location)).toBe(true)
		expect(isObjectsQueryKeyRelevantToPrefix(['objects', 'profile-1', 'bucket-a', 'alpha/', 'token'], location)).toBe(true)
		expect(isObjectsQueryKeyRelevantToPrefix(['objects', 'profile-1', 'bucket-b', 'alpha/', 'token'], location)).toBe(false)
	})
})
