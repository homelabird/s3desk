import { expect, test, type Locator, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage } from './support/apiFixtures'
import {
	clickBucketCardManageAction,
	closeJobsMobileFilters,
	gotoBucketsPage,
	gotoJobsPage,
	gotoProfilesPage,
	gotoUploadsPage,
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

async function openNewFolderFromMoreActions(page: Page) {
	const moreActionsButton = page.getByRole('button', { name: 'More actions' })
	await moreActionsButton.click()
	await page.getByRole('menuitem', { name: 'New folder…' }).click()
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
		jsonFixture('GET', '/api/v1/jobs', {
			items: [
				{
					id: 'mobile-job',
					type: 'transfer_upload',
					status: 'queued',
					payload: { bucket: seed.bucket },
					progress: null,
					createdAt: now,
					startedAt: null,
					finishedAt: null,
					error: null,
				},
			],
			nextCursor: null,
		}),
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
		const appHeader = page.getByTestId('app-header')
		const appMenuButton = appHeader.getByRole('button', { name: 'App menu' })

		await expect(navButton).toBeVisible()
		await expect(profileSelect).toBeVisible()
		await expect(transfersButton).toBeVisible()
		await expect(page.getByRole('button', { name: /Settings/i })).toHaveCount(0)
		await expectMinTouchTarget(navButton)
		await expectMinTouchTarget(profileSelect)
		await expectMinTouchTarget(transfersButton)
		await expectMinTouchTarget(appMenuButton)
		const headerGeometry = await appHeader.evaluate((header) => {
			const headerRect = header.getBoundingClientRect() // e2e-geometry-allow verifies the stacked header owns both rows
			const profileRect = header.querySelector('[data-testid="app-header-profile-row"]')?.getBoundingClientRect() // e2e-geometry-allow verifies the stacked profile row remains inside the app header
			const mainRect = document.querySelector('main[data-scroll-container="app-content"]')?.getBoundingClientRect() // e2e-geometry-allow verifies main content starts after the stacked app header
			return {
				headerBottom: headerRect.bottom,
				profileBottom: profileRect?.bottom ?? 0,
				mainTop: mainRect?.top ?? 0,
			}
		})
		expect(headerGeometry.profileBottom).toBeLessThanOrEqual(headerGeometry.headerBottom + 1)
		expect(headerGeometry.mainTop).toBeGreaterThanOrEqual(headerGeometry.headerBottom - 1)

		await appMenuButton.click()
		const settingsItem = page.getByRole('menuitem', { name: /Settings/i })
		await expect(settingsItem).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Dark mode/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Logout/i })).toBeVisible()

		await page.getByRole('menuitem', { name: /Dark mode/i }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

		await appMenuButton.click()
		await page.getByRole('menuitem', { name: /Logout/i }).click()
		const logoutDialog = page.getByRole('dialog', { name: 'Log out of this session?' })
		await expect(logoutDialog).toBeVisible()
		await logoutDialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(logoutDialog).toHaveCount(0)

		await appMenuButton.click()
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
		await clickBucketCardManageAction(page, lastBucketCard, lastBucket, /Delete bucket/)
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
		await openNewFolderFromMoreActions(page)

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

		await gotoUploadsPage(page)
		await page.getByRole('button', { name: /Add from device/i }).click()
		const uploadSheet = page.getByRole('dialog', { name: 'Add upload source' })
		await expect(uploadSheet).toBeVisible()
		await uploadSheet.getByLabel('Close', { exact: true }).click()
		await expect(uploadSheet).toHaveCount(0)
	})
})
