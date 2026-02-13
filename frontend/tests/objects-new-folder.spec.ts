import { expect, test, type Page } from '@playwright/test'

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
		window.localStorage.setItem('apiToken', JSON.stringify(s.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(s.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(s.bucket))
		window.localStorage.setItem('prefix', JSON.stringify(s.prefix))
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

	await page.route('**/api/v1/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())
		const path = url.pathname
		const method = request.method()

		if (method === 'GET' && path === '/api/v1/events') {
			return route.fulfill({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: '',
			})
		}

		if (method === 'GET' && path === '/api/v1/meta') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
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
			})
		}

		if (method === 'GET' && path === '/api/v1/profiles') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([
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
			})
		}

		if (method === 'GET' && path === '/api/v1/buckets') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([{ name: defaultStorage.bucket, createdAt: now }]),
			})
		}

		if (method === 'GET' && path === `/api/v1/buckets/${defaultStorage.bucket}/objects`) {
			const prefix = url.searchParams.get('prefix') ?? ''
			const commonPrefixes = opts.commonPrefixesByPrefix?.[prefix] ?? []
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					bucket: defaultStorage.bucket,
					prefix,
					delimiter: '/',
					commonPrefixes,
					items: [],
					nextContinuationToken: null,
					isTruncated: false,
				}),
			})
		}

		if (method === 'GET' && path === `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					bucket: defaultStorage.bucket,
					prefix: '',
					items: [],
				}),
			})
		}

		if (method === 'POST' && path === `/api/v1/buckets/${defaultStorage.bucket}/objects/folder`) {
			createFolderCalls += 1
			const payload = JSON.parse(request.postData() ?? '{}') as { key?: unknown }
			const key = typeof payload.key === 'string' ? payload.key : ''

			const failure = opts.failCreateFolder?.(key, createFolderCalls)
			if (failure) {
				return route.fulfill({
					status: failure.status,
					contentType: 'application/json',
					body: JSON.stringify(failure.body),
				})
			}

			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key }) })
		}

		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	})
}

async function getStorageString(page: Page, key: string): Promise<string> {
	return page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? '""') as string, key)
}

test.describe('Objects new folder visibility', () => {
	test('auto-opens when files-only view would hide folder (and offers recovery CTA)', async ({ page }) => {
		await stubObjectsApi(page)
		await seedStorage(page, { objectsTypeFilter: 'files' })
		await page.goto('/objects')

		await page.getByRole('button', { name: 'New folder' }).first().click()
		const dialog = page.getByRole('dialog', { name: 'New folder' })
		await dialog.getByLabel('Folder name').fill('demo')
		await dialog.getByRole('button', { name: 'Create folder' }).click()

		await expect(page.getByRole('button', { name: 'Show folders' })).toBeVisible()

		await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('prefix') ?? '""') === 'demo/')
		await page.getByRole('button', { name: 'Show folders' }).click()
		await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('objectsTypeFilter') ?? '""') === 'all')
	})

	test('auto-opens when favorites-only view would hide folder (and offers recovery CTA)', async ({ page }) => {
		await stubObjectsApi(page)
		await seedStorage(page, { objectsFavoritesOnly: true })
		await page.goto('/objects')

		await page.getByRole('button', { name: 'New folder' }).first().click()
		const dialog = page.getByRole('dialog', { name: 'New folder' })
		await dialog.getByLabel('Folder name').fill('fav-demo')
		await dialog.getByRole('button', { name: 'Create folder' }).click()

		await expect(page.getByRole('button', { name: 'Disable favorites-only' })).toBeVisible()

		await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('prefix') ?? '""') === 'fav-demo/')
		await page.getByRole('button', { name: 'Disable favorites-only' }).click()
		await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('objectsFavoritesOnly') ?? 'false') === false)
	})

	test('auto-opens when search filter would hide folder (and offers recovery CTA)', async ({ page }) => {
		await stubObjectsApi(page)
		await seedStorage(page, { objectsSearch: 'zzz' })
		await page.goto('/objects')

		await page.getByRole('button', { name: 'New folder' }).first().click()
		const dialog = page.getByRole('dialog', { name: 'New folder' })
		await dialog.getByLabel('Folder name').fill('demo')
		await dialog.getByRole('button', { name: 'Create folder' }).click()

		await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible()

		await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('prefix') ?? '""') === 'demo/')
		await page.getByRole('button', { name: 'Clear search' }).click()
		await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('objectsSearch') ?? '""') === '')
	})

	test('creating a subfolder under a different parent does not auto-navigate (toast shows where it went)', async ({ page }) => {
		await stubObjectsApi(page, { commonPrefixesByPrefix: { '': ['a/'] } })
		await seedStorage(page)
		await page.goto('/objects')

		const prefixRow = page.locator('[data-objects-row="true"]', { hasText: 'a/' }).first()
		await expect(prefixRow).toBeVisible()
		await prefixRow.click({ button: 'right' })
		await page.getByRole('menuitem', { name: /New subfolder/i }).click()

		const dialog = page.getByRole('dialog', { name: 'New folder' })
		await dialog.getByLabel('Folder name').fill('b')
		await dialog.getByRole('button', { name: 'Create folder' }).click()

		await expect(page.getByRole('button', { name: 'Parent' })).toBeVisible()

		expect(await getStorageString(page, 'prefix')).toBe('')
		await page.getByRole('button', { name: 'Parent' }).click()
		await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('prefix') ?? '""') === 'a/')
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

		await page.getByRole('button', { name: 'New folder' }).first().click()
		const dialog = page.getByRole('dialog', { name: 'New folder' })
		await dialog.getByLabel('Allow nested path (a/b/c)').check()
		await dialog.getByLabel('Folder name').fill('a/b')
		await dialog.getByRole('button', { name: 'Create folder' }).click()

		await expect(dialog.getByText(/Failed to create folder/i)).toBeVisible()
		await expect(dialog.getByText(/Some intermediate folders may already exist/i)).toBeVisible()
		await expect(dialog.locator('code', { hasText: 'a/' })).toBeVisible()

		await dialog.getByRole('button', { name: 'Open last created' }).click()
		await page.waitForFunction(() => JSON.parse(window.localStorage.getItem('prefix') ?? '""') === 'a/')
	})
})
