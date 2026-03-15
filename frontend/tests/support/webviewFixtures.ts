import type { Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	jsonFixture,
	metaJson,
	seedLocalStorage,
} from './apiFixtures'

export type WebviewStorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
	prefix: string
	objectsUIMode: 'simple' | 'advanced'
}

export type WebviewObjectListing = {
	commonPrefixes?: string[]
	items?: Array<Record<string, unknown>>
}

export type StubWebviewApiOptions = Partial<WebviewStorageSeed> & {
	profiles?: Array<Record<string, unknown>>
	buckets?: Array<Record<string, unknown>>
	objectListings?: Record<string, WebviewObjectListing>
}

export const defaultWebviewStorage: WebviewStorageSeed = {
	apiToken: 'change-me',
	profileId: 'playwright-webview',
	bucket: 'qa-bucket',
	prefix: 'reports/2024/',
	objectsUIMode: 'advanced',
}

export function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function seedWebviewStorage(page: Page, overrides?: Partial<WebviewStorageSeed>) {
	await seedLocalStorage(page, { ...defaultWebviewStorage, ...overrides })
}

export async function stubWebviewApi(page: Page, overrides?: StubWebviewApiOptions) {
	const seed = { ...defaultWebviewStorage, ...overrides }
	const profiles = overrides?.profiles ?? [buildProfileFixture({ id: seed.profileId, name: 'Playwright Webview' })]
	const buckets = overrides?.buckets ?? [buildBucketFixture(seed.bucket)]
	const objectListings = overrides?.objectListings
	const objectsPath = new RegExp(`/api/v1/buckets/${escapeRegExp(seed.bucket)}/objects(?:\\?.*)?$`)
	const favoritesPath = new RegExp(`/api/v1/buckets/${escapeRegExp(seed.bucket)}/objects/favorites(?:\\?.*)?$`)

	await installApiFixtures(page, [
		jsonFixture(
			'GET',
			'/api/v1/meta',
			metaJson({
				dataDir: '/tmp',
				staticDir: '/tmp',
				capabilities: { profileTls: { enabled: false, reason: 'test' } },
				allowedLocalDirs: [],
				jobLogMaxBytes: null,
				jobRetentionSeconds: null,
				uploadSessionTTLSeconds: 86400,
				uploadMaxBytes: null,
				uploadDirectStream: false,
				transferEngine: {
					name: 'rclone',
					available: true,
					compatible: true,
					minVersion: 'v1.66.0',
					path: '/usr/local/bin/rclone',
					version: 'v1.66.0',
				},
			}),
		),
		jsonFixture('GET', '/api/v1/profiles', profiles),
		jsonFixture('GET', '/api/v1/buckets', buckets),
		{
			method: 'GET',
			path: objectsPath,
			handler: ({ request }) => {
				const url = new URL(request.url())
				const prefix = url.searchParams.get('prefix') ?? ''
				const listing = objectListings?.[prefix] ?? {
					commonPrefixes: prefix ? [] : [seed.prefix],
					items: [],
				}
				return {
					json: buildObjectsListFixture({
						bucket: seed.bucket,
						prefix,
						commonPrefixes: listing.commonPrefixes,
						items: listing.items,
					}),
				}
			},
		},
		{
			method: 'GET',
			path: favoritesPath,
			handler: ({ request }) => {
				const url = new URL(request.url())
				return {
					json: buildFavoritesFixture({
						bucket: seed.bucket,
						prefix: url.searchParams.get('prefix') ?? '',
						items: [],
					}),
				}
			},
		},
		jsonFixture('GET', /\/api\/v1\/jobs(?:\?.*)?$/, { items: [], nextCursor: null }),
	], { status: 200, json: {} })

	await page.route(/\/api\/v1\/jobs\/events(?:\?.*)?$/, async (route) => {
		await route.fulfill({
			status: 204,
			contentType: 'text/plain',
			body: '',
		})
	})

	await page.route(/\/api\/v1\/jobs\/health(?:\?.*)?$/, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ queueDepth: 0, workersBusy: 0, workersTotal: 2 }),
		})
	})

	await page.route(/\/api\/v1\/jobs\/stats(?:\?.*)?$/, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ queued: 0, running: 0, succeeded: 0, failed: 0, canceled: 0 }),
		})
	})

	await page.route(/\/api\/v1\/jobs\/types(?:\?.*)?$/, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ items: [] }),
		})
	})

	await page.route(/\/api\/v1\/jobs\/error-codes(?:\?.*)?$/, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ items: [] }),
		})
	})

	await page.route(/\/api\/v1\/jobs\/columns(?:\?.*)?$/, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				columns: [
					{ key: 'status', visible: true },
					{ key: 'type', visible: true },
					{ key: 'target', visible: true },
					{ key: 'updatedAt', visible: true },
				],
			}),
		})
	})
}
