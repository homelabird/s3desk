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
		const navButton = page.getByRole('button', { name: 'Open navigation' })
		const profileSelect = page.getByRole('combobox', { name: 'Profile' })
		const transfersButton = page.getByRole('button', { name: 'Transfers' })
		const moreActionsButton = page.getByTestId('app-header').getByRole('button', { name: 'More actions' })

		await expect(navButton).toBeVisible()
		await expect(profileSelect).toBeVisible()
		await expect(transfersButton).toBeVisible()
		await expect(page.getByRole('button', { name: /Settings/i })).toHaveCount(0)

		for (const locator of [navButton, profileSelect, transfersButton, moreActionsButton]) {
			const box = await locator.boundingBox()
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
		}

		await moreActionsButton.click()
		await expect(page.getByRole('menuitem', { name: /Settings/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Logout/i })).toBeVisible()
	})

	test('settings tabs keep mobile-sized touch targets and horizontal scrolling', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/settings')

		const tablist = page.getByRole('tablist').first()
		const workspaceTab = page.getByRole('tab', { name: 'Workspace' })

		await expect(tablist).toBeVisible()
		await expect(workspaceTab).toBeVisible()

		const tabMetrics = await tablist.evaluate((node) => {
			const element = node as HTMLElement
			const styles = window.getComputedStyle(element)
			return {
				clientWidth: element.clientWidth,
				scrollWidth: element.scrollWidth,
				scrollSnapType: styles.scrollSnapType,
				gap: styles.gap,
			}
		})
		expect(tabMetrics.scrollWidth).toBeGreaterThan(tabMetrics.clientWidth)
		expect(tabMetrics.scrollSnapType).toContain('x')
		expect(tabMetrics.gap).toBe('8px')

		const workspaceBox = await workspaceTab.boundingBox()
		expect(workspaceBox?.height ?? 0).toBeGreaterThanOrEqual(44)
	})

	test('extra-small mobile layouts keep metadata and search actions readable', async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 740 })
		await stubCoreApi(page)
		await seedStorage(page, { objectsUIMode: 'advanced' })

		await page.goto('/profiles')
		const profileCard = page.getByTestId('profiles-list-compact').locator('article').first()
		const profileMeta = profileCard.locator('[class*="mobileMetaGrid"]').first()
		const profileMetaStyles = await profileMeta.evaluate((node) => {
			const element = node as HTMLElement
			const firstValue = element.querySelector('[class*="mobileMetaValue"]') as HTMLElement | null
			return {
				gridTemplateColumns: window.getComputedStyle(element).gridTemplateColumns,
				valueFontSize: firstValue ? window.getComputedStyle(firstValue).fontSize : null,
			}
		})
		expect(profileMetaStyles.gridTemplateColumns.trim().split(/\s+/)).toHaveLength(1)
		expect(profileMetaStyles.valueFontSize).toBe('13px')

		await page.goto('/buckets')
		const bucketCard = page.getByTestId('buckets-list-compact').locator('article').first()
		const bucketMeta = bucketCard.locator('[class*="mobileMetaGrid"]').first()
		const bucketMetaStyles = await bucketMeta.evaluate((node) => {
			const element = node as HTMLElement
			const firstValue = element.querySelector('[class*="metaValue"]') as HTMLElement | null
			return {
				gridTemplateColumns: window.getComputedStyle(element).gridTemplateColumns,
				valueFontSize: firstValue ? window.getComputedStyle(firstValue).fontSize : null,
			}
		})
		expect(bucketMetaStyles.gridTemplateColumns.trim().split(/\s+/)).toHaveLength(1)
		expect(bucketMetaStyles.valueFontSize).toBe('13px')

		await page.goto('/jobs')
		await expect(page.getByTestId('jobs-mobile-filters-hint')).toBeVisible()

		await page.goto('/objects')
		await expect(page.getByRole('button', { name: 'Filters' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Bucket search' })).toBeVisible()
		await expect(page.getByText('Search this folder here, or use Bucket search for indexed results across the whole bucket.')).toBeVisible()
		await page.getByRole('button', { name: 'Bucket search' }).click()
		await expect(page.getByText('Search the whole bucket')).toBeVisible()

		await page.goto('/uploads')
		const addFromDeviceButton = page.getByRole('button', { name: 'Add from device…' })
		const uploadsHint = page.getByText('Add files or a folder first.')
		const addBox = await addFromDeviceButton.boundingBox()
		const hintBox = await uploadsHint.boundingBox()
		expect(hintBox?.y ?? 0).toBeGreaterThan((addBox?.y ?? 0) + (addBox?.height ?? 0) - 1)

		await page.goto('/settings')
		const tokenField = page.getByPlaceholder('Must match API_TOKEN…')
		const applyButton = page.getByRole('button', { name: 'Apply' })
		const tokenBox = await tokenField.boundingBox()
		const applyBox = await applyButton.boundingBox()
		expect(applyBox?.y ?? 0).toBeGreaterThan((tokenBox?.y ?? 0) + (tokenBox?.height ?? 0) - 1)
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

	test('narrow mobile dialogs and job filters stay phone-safe', async ({ page }) => {
		await page.setViewportSize({ width: 350, height: 560 })
		await stubCoreApi(page)
		await seedStorage(page)

		await page.goto('/objects')
		await page.getByRole('button', { name: 'New folder' }).click()

		const newFolderDialog = page.getByRole('dialog')
		await expect(newFolderDialog).toBeVisible()
		await expect(page.getByRole('heading', { name: 'New folder' })).toBeVisible()

		const dialogMetrics = await newFolderDialog.evaluate((node) => {
			const element = node as HTMLElement
			const header = element.querySelector('div') as HTMLElement | null
			const body = element.querySelector('[class*="body"]') as HTMLElement | null
			return {
				width: element.getBoundingClientRect().width,
				maxWidth: window.innerWidth,
				bodyPaddingInline: body ? window.getComputedStyle(body).paddingLeft : null,
				headerPaddingInline: header ? window.getComputedStyle(header).paddingLeft : null,
			}
		})
		expect(dialogMetrics.width).toBeLessThanOrEqual(dialogMetrics.maxWidth)
		expect(dialogMetrics.bodyPaddingInline).toBe('12px')
		expect(dialogMetrics.headerPaddingInline).toBe('12px')

		await page.getByRole('button', { name: 'Close' }).click()
		await page.goto('/jobs')

		await expect(page.getByTestId('jobs-mobile-filters-trigger')).toBeVisible()
		await expect(page.getByRole('combobox', { name: 'Job status filter' })).toHaveCount(0)
		await page.getByTestId('jobs-mobile-filters-trigger').click()
		await expect(page.getByTestId('jobs-mobile-filters-sheet')).toBeVisible()
		await expect(page.getByRole('combobox', { name: 'Job status filter' })).toBeVisible()
		await expect(page.getByRole('combobox', { name: 'Job type filter' })).toBeVisible()
		await expect(page.getByRole('combobox', { name: 'Job error code filter' })).toBeVisible()

		const activeCard = page.getByTestId('jobs-health-active')
		const queuedCard = page.getByTestId('jobs-health-queued')
		const activeBox = await activeCard.boundingBox()
		const queuedBox = await queuedCard.boundingBox()
		expect(queuedBox?.y ?? 0).toBeGreaterThan((activeBox?.y ?? 0) + (activeBox?.height ?? 0) - 1)

		await page.getByRole('button', { name: 'Done' }).click()
		await expect(page.getByTestId('jobs-mobile-filters-sheet')).toHaveCount(0)

		await page.getByRole('button', { name: 'Upload…' }).first().click()
		const uploadSheet = page.getByRole('dialog')
		await expect(page.getByRole('heading', { name: 'Upload from device' })).toBeVisible()
		const sheetMetrics = await uploadSheet.evaluate((node) => {
			const element = node as HTMLElement
			const body = element.querySelector('[class*="body"]') as HTMLElement | null
			return {
				height: element.getBoundingClientRect().height,
				maxHeight: window.innerHeight,
				bodyPaddingBottom: body ? window.getComputedStyle(body).paddingBottom : null,
			}
		})
		expect(sheetMetrics.height).toBeLessThanOrEqual(sheetMetrics.maxHeight)
		expect(sheetMetrics.bodyPaddingBottom).toBe('20px')
	})

	test('uploads page renders', async ({ page }) => {
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/uploads')
		await expect(page.getByRole('heading', { name: 'Uploads' })).toBeVisible()
		await expect(page.getByRole('combobox', { name: 'Bucket' })).toBeVisible()
	})
})
