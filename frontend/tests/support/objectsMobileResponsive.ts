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
const previewImageKey = 'preview.png'
const longPreviewContentType = 'image/png; profile=mobile-responsive-preview-with-a-very-long-content-type-parameter-that-wraps'
const previewSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="18" fill="#d7f0e8"/><circle cx="52" cy="52" r="18" fill="#7ab89f"/><path d="M24 112l32-30 22 18 18-14 24 26H24z" fill="#2f6f57"/><text x="72" y="132" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#1b4332">PNG</text></svg>'
const objectItems = [
	{ key: 'alpha.txt', size: 12, lastModified: now, etag: '"alpha"' },
	{ key: previewImageKey, size: 2048, lastModified: now, etag: '"preview"' },
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
	[previewImageKey]: {
		key: previewImageKey,
		size: 2048,
		etag: '"preview"',
		lastModified: now,
		contentType: longPreviewContentType,
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
	await page.route('**/__test__/preview/**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'image/svg+xml',
			body: previewSvg,
		})
	})

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
			path: new RegExp(`/api/v1/buckets/${defaultStorage.bucket}/objects/thumbnail(?:\\?.*)?$`),
			handler: () => ({
				contentType: 'image/svg+xml',
				body: previewSvg,
			}),
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${defaultStorage.bucket}/objects/download-url`,
			handler: ({ url }) => {
				const key = url.searchParams.get('key') ?? previewImageKey
				return {
					json: {
						url: `${url.origin}/__test__/preview/${encodeURIComponent(key)}`,
						expiresAt: '2024-01-01T01:00:00Z',
					},
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
