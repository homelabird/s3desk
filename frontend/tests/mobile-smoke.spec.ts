import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage } from './support/apiFixtures'

type StorageSeed = {
	apiToken: string
	profileId: string | null
	bucket: string
	objectsUIMode: 'simple' | 'advanced'
}

type StubCoreApiOptions = Partial<StorageSeed> & {
	profiles?: Array<Record<string, unknown>>
	buckets?: Array<Record<string, unknown>>
}

const defaultStorage: StorageSeed = {
	apiToken: 'change-me',
	profileId: 'playwright-mobile',
	bucket: 'mobile-bucket',
	objectsUIMode: 'simple',
}

const MOBILE_SCROLL_TEST_BUCKET_COUNT = 24

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

async function stubCoreApi(page: Page, overrides?: StubCoreApiOptions) {
	const seed = { ...defaultStorage, ...overrides }
	const now = '2024-01-01T00:00:00Z'
	const profiles = overrides?.profiles ?? [
		{
			id: seed.profileId,
			name: 'Playwright Mobile',
			provider: 's3_compatible',
			endpoint: 'http://localhost:9000',
			region: 'us-east-1',
			forcePathStyle: true,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: true,
			createdAt: now,
			updatedAt: now,
		},
	]
	const buckets = overrides?.buckets ?? [{ name: seed.bucket, createdAt: now }]

	await installApiFixtures(page, [
		jsonFixture(
			'GET',
			'/api/v1/meta',
			metaJson({
				dataDir: '/tmp',
				staticDir: '/tmp',
				capabilities: { profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' } },
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
		jsonFixture('GET', `/api/v1/buckets/${seed.bucket}/objects`, {
			bucket: seed.bucket,
			prefix: '',
			delimiter: '/',
			commonPrefixes: [],
			items: [],
			nextContinuationToken: null,
			isTruncated: false,
		}),
		jsonFixture('GET', `/api/v1/buckets/${seed.bucket}/objects/favorites`, {
			bucket: seed.bucket,
			prefix: '',
			items: [],
		}),
		jsonFixture('GET', '/api/v1/jobs', { items: [], nextCursor: null }),
	], { status: 200, json: {} })
}

test.describe('mobile smoke', () => {
	test('setup page renders', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page, { profileId: null })
		await page.goto('/setup')
		await expect(page.getByText('Choose a profile')).toBeVisible()
		await expect(page.getByRole('link', { name: /Create profile/i })).toBeVisible()
	})

	test('profiles page renders', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/profiles')
		await expect(page.getByText('Profiles', { exact: true }).first()).toBeVisible()
		await expect(page.getByRole('button', { name: /New Profile/i })).toBeVisible()
		await expect(page.getByRole('button', { name: /^Selected$/ }).first()).toBeVisible()
	})

	test('dashboard header uses compact mobile actions', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/profiles')
		await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
		await expect(page.getByRole('combobox', { name: 'Profile' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Transfers' })).toBeVisible()
		await expect(page.getByRole('button', { name: /Settings/i })).toHaveCount(0)

		await page.getByTestId('app-header').getByRole('button', { name: 'More actions' }).click()
		await expect(page.getByRole('menuitem', { name: /Settings/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Logout/i })).toBeVisible()
	})

	test('buckets page renders', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/buckets')
		await expect(page.getByRole('heading', { name: 'Buckets' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'New Bucket' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Policy' })).toBeVisible()
	})

	test('mobile app shell keeps dashboard content scrollable without horizontal overflow', async ({ page }) => {
		const bucketNames = Array.from(
			{ length: MOBILE_SCROLL_TEST_BUCKET_COUNT },
			(_, index) => `mobile-bucket-${index.toString().padStart(2, '0')}`,
		)
		await stubCoreApi(page, {
			buckets: bucketNames.map((name) => ({ name, createdAt: '2024-01-01T00:00:00Z' })),
		})
		await seedStorage(page)
		await page.goto('/buckets')

		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()

		const scrollContainer = page.locator('main[data-scroll-container="app-content"]')
		const beforeScroll = await scrollContainer.evaluate((node) => {
			const element = node as HTMLElement
			return {
				clientHeight: element.clientHeight,
				scrollHeight: element.scrollHeight,
				scrollTop: element.scrollTop,
			}
		})

		expect(beforeScroll.scrollHeight).toBeGreaterThan(beforeScroll.clientHeight)
		expect(beforeScroll.scrollTop).toBe(0)

		const afterScrollTop = await scrollContainer.evaluate((node) => {
			const element = node as HTMLElement
			element.scrollTo({ top: element.scrollHeight })
			return element.scrollTop
		})

		expect(afterScrollTop).toBeGreaterThan(0)

		const viewportMetrics = await page.evaluate(() => ({
			innerWidth: window.innerWidth,
			scrollWidth: document.documentElement.scrollWidth,
		}))
		expect(viewportMetrics.scrollWidth).toBeLessThanOrEqual(viewportMetrics.innerWidth)
	})

	test('root redirects to objects when an active profile is stored', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/')
		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
	})

	test('objects page renders', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/objects')
		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await expect(page.getByTestId('objects-upload-dropzone')).toBeVisible()
	})

	test('jobs page renders', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/jobs')
		await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
		await expect(page.locator('button').filter({ hasText: 'Upload…' }).first()).toBeVisible()
	})

	test('uploads page renders', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/uploads')
		await expect(page.getByRole('heading', { name: 'Uploads' })).toBeVisible()
		await expect(page.getByRole('combobox', { name: 'Bucket' })).toBeVisible()
	})
})
