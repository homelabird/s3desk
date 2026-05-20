import { expect, test, type Locator, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage } from './support/apiFixtures'
import {
	closeJobsMobileFilters,
	gotoBucketsPage,
	gotoJobsPage,
	gotoProfilesPage,
	gotoWithDynamicImportRecovery,
	openJobsMobileFilters,
} from './support/ui'

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

async function openObjectsMobilePage(page: Page) {
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'), {
		timeout: 10_000,
		maxAttempts: 3,
	})
}

async function expectMinTouchTarget(locator: Locator, minSize = 44) {
	const rect = await locator.evaluate((element) => {
		const { height, width } = element.getBoundingClientRect() // e2e-geometry-allow validates shared mobile touch-target sizing
		return { height, width }
	})
	expect(rect.height).toBeGreaterThanOrEqual(minSize)
	expect(rect.width).toBeGreaterThanOrEqual(minSize)
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

test.describe('@mobile-responsive mobile smoke', () => {
	test('dashboard header routes compact mobile actions through the overflow menu', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await gotoProfilesPage(page)

		const navButton = page.getByRole('button', { name: 'Open navigation' })
		const profileSelect = page.getByRole('combobox', { name: 'Profile' })
		const transfersButton = page.getByRole('button', { name: 'Transfers' })
		const moreActionsButton = page.getByTestId('app-header').getByRole('button', { name: 'More actions' })

		await expect(navButton).toBeVisible()
		await expect(profileSelect).toBeVisible()
		await expect(transfersButton).toBeVisible()
		await expect(page.getByRole('button', { name: /Settings/i })).toHaveCount(0)
		await expectMinTouchTarget(navButton)
		await expectMinTouchTarget(profileSelect)
		await expectMinTouchTarget(transfersButton)
		await expectMinTouchTarget(moreActionsButton)

		await moreActionsButton.click()
		const settingsItem = page.getByRole('menuitem', { name: /Settings/i })
		await expect(settingsItem).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Logout/i })).toBeVisible()

		await settingsItem.click()
		const settingsDrawer = page.getByRole('dialog', { name: 'Settings' })
		await expect(settingsDrawer).toBeVisible()
		await settingsDrawer.getByRole('button', { name: 'Close' }).click()
		await expect(settingsDrawer).toHaveCount(0)
	})

	test('mobile buckets list can scroll to the final bucket and open its delete flow', async ({ page }) => {
		const bucketNames = Array.from(
			{ length: MOBILE_SCROLL_TEST_BUCKET_COUNT },
			(_, index) => `mobile-bucket-${index.toString().padStart(2, '0')}`,
		)
		const lastBucket = bucketNames.at(-1) ?? 'mobile-bucket-23'

		await stubCoreApi(page, {
			buckets: bucketNames.map((name) => ({ name, createdAt: '2024-01-01T00:00:00Z' })),
		})
		await seedStorage(page)
		await gotoBucketsPage(page)

		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()

		const scrollContainer = page.locator('main[data-scroll-container="app-content"]')
		await scrollContainer.evaluate((node) => {
			const element = node as HTMLElement
			element.scrollTo({ top: element.scrollHeight })
		})
		const lastBucketCard = page.getByTestId('buckets-list-compact').locator('article').filter({ hasText: lastBucket }).first()
		await expect(lastBucketCard).toBeVisible()
		await lastBucketCard.getByRole('button', { name: 'Delete' }).click()
		const confirmDialog = page.getByRole('dialog', { name: `Delete bucket "${lastBucket}"?` })
		await expect(confirmDialog).toBeVisible()
		await confirmDialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(confirmDialog).toHaveCount(0)
	})

	test('root redirects to objects when an active profile is stored', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/')
		await expect(page).toHaveURL(/\/objects$/)
		await openObjectsMobilePage(page)
	})

	test('narrow mobile dialogs and job filters stay usable on phones', async ({ page }) => {
		await page.setViewportSize({ width: 350, height: 560 })
		await stubCoreApi(page)
		await seedStorage(page)

		await openObjectsMobilePage(page)
		await page.getByRole('button', { name: 'New folder' }).click()

		const newFolderDialog = page.getByRole('dialog')
		await expect(newFolderDialog).toBeVisible()
		await expect(page.getByRole('heading', { name: 'New folder' })).toBeVisible()
		await newFolderDialog.getByPlaceholder('new-folder').fill('mobile-folder')
		await newFolderDialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(newFolderDialog).toHaveCount(0)

		await gotoJobsPage(page)
		await expect(page.getByRole('combobox', { name: 'Job status filter' })).toHaveCount(0)
		const jobsFiltersSheet = await openJobsMobileFilters(page)
		await jobsFiltersSheet.getByRole('combobox', { name: 'Job status filter' }).selectOption('failed')
		await expect(jobsFiltersSheet.getByRole('combobox', { name: 'Job type filter' })).toBeVisible()
		await expect(jobsFiltersSheet.getByRole('combobox', { name: 'Job error code filter' })).toBeVisible()

		await closeJobsMobileFilters(jobsFiltersSheet)
		await expect(page.getByTestId('jobs-mobile-filters-trigger')).toContainText('Filters active')

		await page.getByRole('button', { name: 'Upload…' }).first().click()
		const uploadSheet = page.getByRole('dialog')
		await expect(page.getByRole('heading', { name: 'Upload from device' })).toBeVisible()
		await uploadSheet.getByLabel('Close', { exact: true }).click()
		await expect(uploadSheet).toHaveCount(0)
	})
})
