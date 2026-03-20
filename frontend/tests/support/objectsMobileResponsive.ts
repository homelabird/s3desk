import type { Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	seedLocalStorage,
	textFixture,
} from './apiFixtures'
export { expectLocatorWithinViewport, expectNoPageHorizontalOverflow } from './mobileResponsive'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
	objectsUIMode: 'simple' | 'advanced'
	objectsDetailsOpen: boolean
}

const defaultStorage: StorageSeed = {
	apiToken: 'objects-mobile-token',
	profileId: 'objects-mobile-profile',
	bucket: 'objects-mobile-bucket',
	objectsUIMode: 'advanced',
	objectsDetailsOpen: false,
}

const now = '2024-01-01T00:00:00Z'
const longKey =
	'reports/mobile/a-very-long-object-key-that-should-wrap-on-mobile-without-causing-horizontal-overflow-or-clipped-actions.log'
const objectItems = [
	{ key: 'alpha.txt', size: 12, lastModified: now, etag: '"alpha"' },
	{ key: longKey, size: 4096, lastModified: now, etag: '"long"' },
]

const metaByKey = {
	'alpha.txt': {
		key: 'alpha.txt',
		size: 12,
		etag: '"alpha"',
		lastModified: now,
		contentType: 'text/plain',
		metadata: { suite: 'mobile-responsive' },
	},
	[longKey]: {
		key: longKey,
		size: 4096,
		etag: '"long"',
		lastModified: now,
		contentType: 'text/plain',
		metadata: { suite: 'mobile-responsive' },
	},
} as const

export async function seedObjectsMobileResponsiveStorage(page: Page, overrides: Partial<StorageSeed> = {}) {
	await seedLocalStorage(page, {
		...defaultStorage,
		bucket: defaultStorage.bucket,
		prefix: '',
		objectsFavoritesOpenDetails: true,
		...overrides,
	})
}

export async function installObjectsMobileResponsiveFixtures(page: Page) {
	await installApiFixtures(page, [
		{
			method: 'GET',
			path: '/api/v1/meta',
			handler: () => ({ json: buildMetaFixture() }),
		},
		{
			method: 'GET',
			path: '/api/v1/profiles',
			handler: () => ({
				json: [
					buildProfileFixture({
						id: defaultStorage.profileId,
						name: 'Objects Mobile Profile',
						createdAt: now,
						updatedAt: now,
					}),
				],
			}),
		},
		{
			method: 'GET',
			path: '/api/v1/buckets',
			handler: () => ({ json: [buildBucketFixture(defaultStorage.bucket, { createdAt: now })] }),
		},
		{
			method: 'GET',
			path: new RegExp(`/api/v1/buckets/${defaultStorage.bucket}/objects(?:\\?.*)?$`),
			handler: ({ url }) => {
				const prefix = url.searchParams.get('prefix') ?? ''
				return {
					json: buildObjectsListFixture({
						bucket: defaultStorage.bucket,
						prefix,
						commonPrefixes: ['reports/'],
						items: objectItems,
					}),
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`,
			handler: () => ({ json: { bucket: defaultStorage.bucket, prefix: '', items: [] } }),
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${defaultStorage.bucket}/objects/meta`,
			handler: ({ url }) => {
				const key = url.searchParams.get('key') ?? ''
				const payload = metaByKey[key as keyof typeof metaByKey]
				if (!payload) {
					return {
						status: 404,
						json: { error: { code: 'not_found', message: 'object not found' } },
					}
				}
				return { json: payload }
			},
		},
		{
			method: 'GET',
			path: new RegExp(`/api/v1/buckets/${defaultStorage.bucket}/objects/search(?:\\?.*)?$`),
			handler: () => ({ json: { items: objectItems, nextCursor: null } }),
		},
		{
			method: 'GET',
			path: '/api/v1/jobs',
			handler: () => ({ json: { items: [], nextCursor: null } }),
		},
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}
