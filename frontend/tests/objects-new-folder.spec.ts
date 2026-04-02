import { expect, test, type Page } from '@playwright/test'

import { installMockApi } from './support/apiFixtures'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
	prefix: string
	objectsUIMode: 'simple' | 'advanced'
	objectsTypeFilter: 'all' | 'files' | 'folders'
	objectsFavoritesOnly: boolean
	objectsSearch: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	profileId: 'playwright-profile',
	bucket: 'test-bucket',
	prefix: '',
	objectsUIMode: 'advanced',
	objectsTypeFilter: 'all',
	objectsFavoritesOnly: false,
	objectsSearch: '',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	const seed = { ...defaultStorage, ...overrides }
	await page.addInitScript((s) => {
		const scopedKey = (name: string) => {
			const serverScope = s.apiToken?.trim() || '__no_server__'
			const profileScope = s.profileId?.trim() || '__no_profile__'
			return `objects:${serverScope}:${profileScope}:${name}`
		}
		window.localStorage.setItem('apiToken', JSON.stringify(s.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(s.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(s.bucket))
		window.localStorage.setItem('prefix', JSON.stringify(s.prefix))
		window.localStorage.setItem(scopedKey('bucket'), JSON.stringify(s.bucket))
		window.localStorage.setItem(scopedKey('prefix'), JSON.stringify(s.prefix))
		window.localStorage.setItem('objectsUIMode', JSON.stringify(s.objectsUIMode))
		window.localStorage.setItem('objectsTypeFilter', JSON.stringify(s.objectsTypeFilter))
		window.localStorage.setItem('objectsFavoritesOnly', JSON.stringify(s.objectsFavoritesOnly))
		window.localStorage.setItem('objectsSearch', JSON.stringify(s.objectsSearch))
	}, seed)
}

type StubObjectsOptions = {
	commonPrefixesByPrefix?: Record<string, string[]>
	failCreateFolder?: (key: string, callIndex: number) => { status: number; body: unknown } | null
}

async function stubObjectsApi(page: Page, opts: StubObjectsOptions = {}) {
	const now = '2024-01-01T00:00:00Z'
	let createFolderCalls = 0

	await installMockApi(page, [
		{
			method: 'GET',
			path: '/events',
			handle: (ctx) => ctx.text('', 200, 'text/event-stream'),
		},
		{
			method: 'GET',
			path: '/meta',
			handle: (ctx) =>
				ctx.json({
					version: 'test',
					serverAddr: '127.0.0.1:8080',
					dataDir: '/tmp',
					staticDir: '/tmp',
					apiTokenEnabled: true,
					encryptionEnabled: false,
					capabilities: { profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' } },
					allowedLocalDirs: [],
					jobConcurrency: 2,
					jobLogMaxBytes: null,
					jobRetentionSeconds: null,
					uploadSessionTTLSeconds: 86400,
					uploadMaxBytes: null,
					transferEngine: { name: 'rclone', available: true, path: '/usr/local/bin/rclone', version: 'v1.66.0' },
				}),
		},
		{
			method: 'GET',
			path: '/profiles',
			handle: (ctx) =>
				ctx.json([
					{
						id: defaultStorage.profileId,
						name: 'Playwright',
						endpoint: 'http://localhost:9000',
						region: 'us-east-1',
						forcePathStyle: true,
						tlsInsecureSkipVerify: true,
						createdAt: now,
						updatedAt: now,
					},
				]),
		},
		{
			method: 'GET',
			path: '/buckets',
			handle: (ctx) => ctx.json([{ name: defaultStorage.bucket, createdAt: now }]),
		},
		{
			method: 'GET',
			path: `/buckets/${defaultStorage.bucket}/objects`,
			handle: (ctx) => {
				const prefix = ctx.url.searchParams.get('prefix') ?? ''
				const commonPrefixes = opts.commonPrefixesByPrefix?.[prefix] ?? []
				return ctx.json({
					bucket: defaultStorage.bucket,
					prefix,
					delimiter: '/',
					commonPrefixes,
					items: [],
					nextContinuationToken: null,
					isTruncated: false,
				})
			},
		},
		{
			method: 'GET',
			path: `/buckets/${defaultStorage.bucket}/objects/favorites`,
			handle: (ctx) =>
				ctx.json({
					bucket: defaultStorage.bucket,
					prefix: '',
					items: [],
				}),
		},
		{
			method: 'POST',
			path: `/buckets/${defaultStorage.bucket}/objects/folder`,
			handle: (ctx) => {
				createFolderCalls += 1
				const payload = JSON.parse(ctx.request.postData() ?? '{}') as { key?: unknown }
				const key = typeof payload.key === 'string' ? payload.key : ''
				const failure = opts.failCreateFolder?.(key, createFolderCalls)
				if (failure) {
					return ctx.json(failure.body, failure.status)
				}
				return ctx.json({ key })
			},
		},
		{
			path: /.*/,
			handle: (ctx) => ctx.json({}),
		},
	])
}

async function expectLocation(page: Page, prefix: string) {
	await expect(
		page
			.getByTestId('objects-list-controls-root')
			.getByText(`s3://${defaultStorage.bucket}/${prefix}`, { exact: true }),
	).toBeVisible()
}

async function openNewFolderDialog(page: Page) {
	await page.locator('button[aria-label="New folder"]:not([disabled])').first().click()
	return page.getByRole('dialog', { name: 'New folder' })
}

test.describe('Objects new folder visibility', () => {
	test('auto-opens when files-only view would hide folder (and offers recovery CTA)', async ({ page }) => {
		await stubObjectsApi(page)
		await seedStorage(page, { objectsTypeFilter: 'files' })
		await page.goto('/objects')

		const dialog = await openNewFolderDialog(page)
		await dialog.getByLabel('Folder name').fill('demo')
		await dialog.getByRole('button', { name: 'Create folder' }).click()

		await expect(page.getByRole('button', { name: 'Show folders' })).toBeVisible()
		await expectLocation(page, 'demo/')
	})

	test('auto-opens when favorites-only view would hide folder (and offers recovery CTA)', async ({ page }) => {
		await stubObjectsApi(page)
		await seedStorage(page, { objectsFavoritesOnly: true })
		await page.goto('/objects')

		const dialog = await openNewFolderDialog(page)
		await dialog.getByLabel('Folder name').fill('fav-demo')
		await dialog.getByRole('button', { name: 'Create folder' }).click()

		await expect(page.getByRole('button', { name: 'Disable favorites-only' })).toBeVisible()
		await expectLocation(page, 'fav-demo/')
	})

	test('auto-opens when search filter would hide folder (and offers recovery CTA)', async ({ page }) => {
		await stubObjectsApi(page)
		await seedStorage(page, { objectsSearch: 'zzz' })
		await page.goto('/objects')

		const dialog = await openNewFolderDialog(page)
		await dialog.getByLabel('Folder name').fill('demo')
		await dialog.getByRole('button', { name: 'Create folder' }).click()

		await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible()
		await expectLocation(page, 'demo/')
	})

	test('opening a subfolder dialog under a different parent keeps the current location', async ({ page }) => {
		await stubObjectsApi(page, { commonPrefixesByPrefix: { '': ['a/'] } })
		await seedStorage(page)
		await page.goto('/objects')

		const prefixRow = page.locator('[data-objects-row="true"]', { hasText: 'a/' }).first()
		await expect(prefixRow).toBeVisible()
		await prefixRow.getByRole('button', { name: 'Prefix actions' }).click()
		await page.getByRole('menuitem', { name: /New subfolder/i }).click()

		const dialog = page.getByRole('dialog', { name: 'New folder' })
		await expect(dialog.getByText('s3://test-bucket/a/')).toBeVisible()
		await expectLocation(page, '')
	})

	test('nested path failures report the last created folder and provide navigation CTAs', async ({ page }) => {
		await stubObjectsApi(page, {
			failCreateFolder: (key, callIndex) => {
				if (callIndex === 2) {
					return { status: 403, body: { error: { code: 'forbidden', message: `forbidden: ${key}` } } }
				}
				return null
			},
		})
		await seedStorage(page)
		await page.goto('/objects')

		const dialog = await openNewFolderDialog(page)
		await dialog.getByLabel('Allow nested path (a/b/c)').check()
		await dialog.getByLabel('Folder name').fill('a/b')
		await dialog.getByRole('button', { name: 'Create folder' }).click()

		await expect(dialog.getByText(/Failed to create folder/i)).toBeVisible()
		await expect(dialog.getByText(/Some intermediate folders may already exist/i)).toBeVisible()
		await expect(dialog.locator('code', { hasText: 'a/' })).toBeVisible()

		await dialog.getByRole('button', { name: 'Open last created' }).click()
		await expectLocation(page, 'a/')
	})
})
