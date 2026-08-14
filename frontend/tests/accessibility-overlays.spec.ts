import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'
import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import {
	installObjectsMobileResponsiveFixtures,
	seedObjectsMobileResponsiveStorage,
} from './support/objectsMobileResponsive'
import {
	buildAwsGovernanceFixture,
	buildAzureGovernanceFixture,
	buildAzureImmutabilityWarningGovernanceFixture,
	buildGcsGovernanceFixture,
	buildGcsLockedRetentionGovernanceFixture,
	buildOciGovernanceFixture,
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import {
	installLoginMobileResponsiveFixtures,
	installSettingsMobileResponsiveFixtures,
	seedLoginMobileResponsiveStorage,
	seedSettingsMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'
import { installUploadsMobileResponsiveFixtures, seedUploadsMobileResponsiveStorage } from './support/uploadsMobileResponsive'
import {
	clickBucketCardManageAction,
	dialogByName,
	gotoBucketsPage,
	gotoJobsPage,
	gotoProfilesPage,
	gotoUploadsPage,
	gotoWithDynamicImportRecovery,
	jobsTableRow,
	objectsListRow,
	openJobDetailsDrawer,
	openJobsMobileFilters,
} from './support/ui'

const now = '2024-01-01T00:00:00Z'
const apiToken = 'playwright-token'
const profileId = 'a11y-profile'
const bucket = 'a11y-bucket'
const bucketsA11yBucket = 'responsive-bucket'

const svgPreview = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <rect width="1200" height="900" fill="#155e75"/>
  <rect x="90" y="120" width="1020" height="620" rx="36" fill="#f8fafc"/>
  <text x="150" y="290" fill="#111827" font-size="84" font-family="Arial, sans-serif">S3Desk</text>
  <text x="150" y="400" fill="#1f2937" font-size="46" font-family="Arial, sans-serif">Accessible preview fixture</text>
</svg>
`.trim()

async function expectNoA11yViolations(page: Page, scope: Locator) {
	await scope.evaluate((element) => {
		element.setAttribute('data-a11y-scan-root', 'true')
	})
	try {
		const results = await new AxeBuilder({ page }).include('[data-a11y-scan-root="true"]').analyze()
		expect(results.violations).toEqual([])
	} finally {
		await scope.evaluate((element) => {
			element.removeAttribute('data-a11y-scan-root')
		})
	}
}

async function expectFocusedControlExposed(scope: Locator) {
	await expect.poll(() => scope.evaluate((container) => {
		const active = document.activeElement
		if (!(active instanceof HTMLElement) || !container.contains(active)) return false
		const rect = active.getBoundingClientRect() // e2e-geometry-allow verifies focused controls remain exposed inside overlays
		if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) return false
		const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2))
		const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2))
		const hit = document.elementFromPoint(x, y)
		return !!hit && (active.contains(hit) || hit.contains(active))
	})).toBe(true)
}

async function seedObjectsA11yStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken,
		profileId,
		bucket,
		objectsUIMode: 'advanced',
		objectsShowThumbnails: true,
		objectsAutoIndexEnabled: false,
	})
}

async function installObjectsA11yApi(page: Page) {
	const objectItem = {
		key: 'alpha.png',
		size: 12,
		lastModified: now,
	}

	await page.route('**/__test__/preview/**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'image/svg+xml',
			body: svgPreview,
		})
	})

	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', metaJson({ dataDir: '/tmp', staticDir: '/tmp' })),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: profileId,
				name: 'A11y Profile',
				provider: 's3_compatible',
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				tlsInsecureSkipVerify: true,
				createdAt: now,
				updatedAt: now,
			},
		]),
		jsonFixture('GET', '/api/v1/buckets', [{ name: bucket, createdAt: now }]),
		jsonFixture('GET', `/api/v1/buckets/${bucket}/objects`, {
			bucket,
			prefix: '',
			delimiter: '/',
			commonPrefixes: [],
			items: [objectItem],
			nextContinuationToken: null,
			isTruncated: false,
		}),
		jsonFixture('GET', `/api/v1/buckets/${bucket}/objects/favorites`, {
			bucket,
			prefix: '',
			items: [],
		}),
		jsonFixture('GET', `/api/v1/buckets/${bucket}/objects/search`, {
			items: [objectItem],
			nextCursor: null,
		}),
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/meta`,
			handler: ({ url }) => ({
				json: {
					bucket,
					key: url.searchParams.get('key') ?? objectItem.key,
					size: objectItem.size,
					lastModified: objectItem.lastModified,
					etag: 'etag-alpha',
					contentType: 'image/svg+xml',
					metadata: {},
				},
			}),
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/download-url`,
			handler: ({ url }) => ({
				json: {
					url: `${url.origin}/__test__/preview/${encodeURIComponent(url.searchParams.get('key') ?? objectItem.key)}`,
					expiresAt: '2024-01-01T01:00:00Z',
				},
			}),
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/thumbnail`,
			handler: () => ({ contentType: 'image/svg+xml', body: svgPreview }),
		},
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

async function seedJobsA11yStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken,
		profileId,
		bucket,
	})
}

async function installJobsA11yApi(page: Page) {
	const uploadJob = {
		id: 'job-a11y-upload-success',
		type: 'transfer_sync_staging_to_s3',
		status: 'succeeded',
		payload: {
			bucket,
			prefix: 'exports/',
			rootKind: 'folder',
			rootName: 'camera-roll',
			totalFiles: 1,
			totalBytes: 10,
			items: [{ path: 'camera-roll/alpha.txt', key: 'exports/camera-roll/alpha.txt', size: 10 }],
		},
		progress: null,
		createdAt: now,
		startedAt: now,
		finishedAt: now,
		errorCode: null,
		error: null,
	}

	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', metaJson({ dataDir: '/tmp', staticDir: '/tmp' })),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: profileId,
				provider: 's3_compatible',
				name: 'A11y Profile',
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: now,
				updatedAt: now,
			},
		]),
		jsonFixture('GET', '/api/v1/buckets', [{ name: bucket, createdAt: now }]),
		jsonFixture('GET', '/api/v1/jobs', { items: [uploadJob], nextCursor: null }),
		jsonFixture('GET', `/api/v1/jobs/${uploadJob.id}`, uploadJob),
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/meta`,
			handler: ({ url }) => ({
				json: {
					bucket,
					key: url.searchParams.get('key'),
					size: 10,
					lastModified: now,
					etag: 'etag-alpha',
				},
			}),
		},
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

async function setupBucketsA11yPage(
	page: Page,
	overrides: Parameters<typeof installProfilesBucketsMobileResponsiveFixtures>[1] = {},
) {
	await installProfilesBucketsMobileResponsiveFixtures(page, {
		profileProvider: 'aws_s3',
		bucketPolicy: {
			Version: '2012-10-17',
			Statement: [],
		},
		bucketGovernance: buildAwsGovernanceFixture(bucketsA11yBucket),
		...overrides,
	})
	await seedProfilesBucketsMobileResponsiveStorage(page, { bucket: bucketsA11yBucket })
	await gotoBucketsPage(page, {
		ready: (scope) => scope.getByText(bucketsA11yBucket),
	})
}

async function setupProfilesDesktopA11yPage(page: Page) {
	await page.setViewportSize({ width: 1440, height: 900 })
	await installProfilesBucketsMobileResponsiveFixtures(page)
	await seedProfilesBucketsMobileResponsiveStorage(page)
	await gotoProfilesPage(page)
	await expect(page.getByTestId('profiles-table-desktop').getByText('Backup Profile')).toBeVisible()
}

async function setupJobsDesktopA11yPage(page: Page) {
	await page.setViewportSize({ width: 1440, height: 900 })
	await installJobsMobileResponsiveFixtures(page)
	await seedJobsMobileResponsiveStorage(page)
	await gotoJobsPage(page)
	await expect(page.getByText('job-queued')).toBeVisible()
}

async function setupUploadsDesktopA11yPage(page: Page) {
	await page.setViewportSize({ width: 1440, height: 900 })
	await installUploadsMobileResponsiveFixtures(page)
	await seedUploadsMobileResponsiveStorage(page)
	await gotoUploadsPage(page)
	await expect(page.getByLabel('Upload prefix (optional)')).toBeVisible()
}

async function setupGcsBucketsMobileA11yPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installProfilesBucketsMobileResponsiveFixtures(page, {
		profileProvider: 'gcp_gcs',
		profiles: [
			{
				id: 'profiles-buckets-mobile-profile',
				name: 'GCS A11y Profile',
				provider: 'gcp_gcs',
				projectNumber: '1234567890',
				createdAt: now,
				updatedAt: now,
			},
		],
		bucketGovernance: buildGcsGovernanceFixture(bucketsA11yBucket),
	})
	await seedProfilesBucketsMobileResponsiveStorage(page, { bucket: bucketsA11yBucket })
	await gotoBucketsPage(page, {
		ready: (scope) => scope.getByText(bucketsA11yBucket),
	})
}

async function setupAzureBucketsMobileA11yPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installProfilesBucketsMobileResponsiveFixtures(page, {
		profileProvider: 'azure_blob',
		profiles: [
			{
				id: 'profiles-buckets-mobile-profile',
				name: 'Azure A11y Profile',
				provider: 'azure_blob',
				accountName: 'playwright',
				accountKey: 'secret',
				createdAt: now,
				updatedAt: now,
			},
		],
		bucketGovernance: buildAzureGovernanceFixture(bucketsA11yBucket),
	})
	await seedProfilesBucketsMobileResponsiveStorage(page, { bucket: bucketsA11yBucket })
	await gotoBucketsPage(page, {
		ready: (scope) => scope.getByText(bucketsA11yBucket),
	})
}

async function setupOciBucketsMobileA11yPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installProfilesBucketsMobileResponsiveFixtures(page, {
		profileProvider: 'oci_object_storage',
		profiles: [
			{
				id: 'profiles-buckets-mobile-profile',
				name: 'OCI A11y Profile',
				provider: 'oci_object_storage',
				namespace: 'playwrightns',
				compartment: 'ocid1.compartment.oc1..playwright',
				configFile: '~/.oci/config',
				configProfile: 'DEFAULT',
				createdAt: now,
				updatedAt: now,
			},
		],
		bucketGovernance: buildOciGovernanceFixture(bucketsA11yBucket),
	})
	await seedProfilesBucketsMobileResponsiveStorage(page, { bucket: bucketsA11yBucket })
	await gotoBucketsPage(page, {
		ready: (scope) => scope.getByText(bucketsA11yBucket),
	})
}

async function setupProfilesMobileA11yPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installProfilesBucketsMobileResponsiveFixtures(page)
	await seedProfilesBucketsMobileResponsiveStorage(page)
	await gotoProfilesPage(page)
	await expect(profileCard(page, 'Backup Profile')).toBeVisible()
}

async function setupObjectsMobileA11yPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installObjectsMobileResponsiveFixtures(page)
	await seedObjectsMobileResponsiveStorage(page)
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'), {
		timeout: 10_000,
		maxAttempts: 3,
	})
	await expect(objectsListRow(page, 'preview.png')).toBeVisible()
}

async function setupJobsMobileA11yPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installJobsMobileResponsiveFixtures(page)
	await seedJobsMobileResponsiveStorage(page)
	await gotoJobsPage(page)
	await expect(page.getByText('job-queued')).toBeVisible()
}

async function setupUploadsMobileA11yPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installUploadsMobileResponsiveFixtures(page)
	await seedUploadsMobileResponsiveStorage(page)
	await gotoUploadsPage(page)
	await expect(page.getByLabel('Upload prefix (optional)')).toBeVisible()
}

async function setupSettingsMobileA11yPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installSettingsMobileResponsiveFixtures(page)
	await seedSettingsMobileResponsiveStorage(page)
	await page.goto('/settings')
	const drawer = dialogByName(page, 'Settings')
	await expect(drawer).toBeVisible({ timeout: 15_000 })
	return drawer
}

function bucketCard(page: Page, bucketName: string) {
	return page.getByTestId('buckets-list-compact').locator('article').filter({ hasText: bucketName }).first()
}

function profileCard(page: Page, profileName: string) {
	return page.getByTestId('profiles-list-compact').locator('article').filter({ hasText: profileName }).first()
}

async function seedPersistedTransfer(page: Page) {
	await page.addInitScript((args) => {
		window.sessionStorage.setItem(
			'transfersHistoryV1',
			JSON.stringify({
				version: 1,
				savedAtMs: Date.now(),
				downloads: [
					{
						id: 'download-a11y-1',
						profileId: args.profileId,
						bucket: args.bucket,
						prefix: 'exports/',
						localPath: '/tmp/exports',
						status: 'succeeded',
						createdAtMs: 1704067200000,
						startedAtMs: 1704067201000,
						finishedAtMs: 1704067202000,
						loadedBytes: 2048,
						totalBytes: 2048,
						speedBps: 0,
						etaSeconds: 0,
						jobId: 'job-a11y-download-success',
						label: 'exports/',
					},
				],
				uploads: [
					{
						id: 'upload-a11y-1',
						profileId: args.profileId,
						bucket: args.bucket,
						prefix: '',
						fileCount: 1,
						status: 'succeeded',
						createdAtMs: 1704067200000,
						startedAtMs: 1704067201000,
						finishedAtMs: 1704067202000,
						loadedBytes: 1024,
						totalBytes: 1024,
						speedBps: 0,
						etaSeconds: 0,
						jobId: 'job-a11y-upload-success',
						label: 'a11y-upload.txt',
						filePaths: ['a11y-upload.txt'],
						uploadMode: 'staging',
					},
				],
			}),
		)
	}, { profileId, bucket })
}

test.describe('overlay accessibility scans', () => {
	test('Login error state has no whole-page axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 800 })
		await seedLoginMobileResponsiveStorage(page, 'stale-token')
		await installLoginMobileResponsiveFixtures(page, ['valid-token'])
		await gotoProfilesPage(page, { ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }) })

		await expect(page.getByText('Stored API token for this browser session is invalid.')).toBeVisible()
		await expectNoA11yViolations(page, page.locator('body'))
	})

	test('Profiles page has no whole-page axe violations', async ({ page }) => {
		await setupProfilesDesktopA11yPage(page)

		await expectNoA11yViolations(page, page.locator('body'))
	})

	test('Buckets page has no whole-page axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await setupBucketsA11yPage(page)

		await expectNoA11yViolations(page, page.locator('body'))
	})

	test('Buckets empty state has no whole-page axe violations', async ({ page }) => {
		await installProfilesBucketsMobileResponsiveFixtures(page, { buckets: [] })
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await gotoBucketsPage(page, { ready: (scope) => scope.getByText('No buckets found in this storage.') })

		await expectNoA11yViolations(page, page.locator('body'))
	})

	test('Buckets loading state has no whole-page axe violations', async ({ page }) => {
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
		let releaseBuckets: () => void = () => undefined
		const bucketsReleased = new Promise<void>((resolve) => {
			releaseBuckets = resolve
		})
		await page.route('**/api/v1/buckets', async (route) => {
			await bucketsReleased
			await route.fallback()
		})

		await gotoWithDynamicImportRecovery(page, '/buckets', (scope) => scope.getByLabel('Loading buckets'))
		await expectNoA11yViolations(page, page.locator('body'))
		releaseBuckets()
		await expect(page.getByText('responsive-bucket')).toBeVisible()
	})

	test('Objects page has no whole-page axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await seedObjectsA11yStorage(page)
		await installObjectsA11yApi(page)

		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'), {
			timeout: 10_000,
			maxAttempts: 5,
		})
		await expect(objectsListRow(page, 'alpha.png')).toBeVisible()

		await expectNoA11yViolations(page, page.locator('body'))
	})

	test('Uploads page has no whole-page axe violations', async ({ page }) => {
		await setupUploadsDesktopA11yPage(page)

		await expectNoA11yViolations(page, page.locator('body'))
	})

	test('Jobs page has no whole-page axe violations', async ({ page }) => {
		await setupJobsDesktopA11yPage(page)

		await expectNoA11yViolations(page, page.locator('body'))
	})

	test('app header and primary navigation have no axe violations on Objects', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await seedObjectsA11yStorage(page)
		await installObjectsA11yApi(page)

		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'), {
			timeout: 10_000,
			maxAttempts: 5,
		})
		await expect(objectsListRow(page, 'alpha.png')).toBeVisible()

		await expectNoA11yViolations(page, page.getByTestId('app-header'))
		await expectNoA11yViolations(page, page.getByRole('navigation', { name: 'Primary' }))
	})

	test('forced colors preserves Objects navigation, focus, and selection semantics', async ({ page }) => {
		await page.emulateMedia({ forcedColors: 'active' })
		await page.setViewportSize({ width: 1440, height: 900 })
		await seedObjectsA11yStorage(page)
		await installObjectsA11yApi(page)
		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'))

		await expect(page.locator('[aria-current="page"]')).toBeVisible()
		const search = page.getByPlaceholder('Search current folder')
		await search.focus()
		expect(await search.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')
		const selectObject = page.getByRole('button', { name: 'Select object alpha.png' })
		await selectObject.click()
		await expect(selectObject).toHaveAttribute('aria-pressed', 'true')
		await expectNoA11yViolations(page, page.locator('body'))
	})

	test('Objects global search drawer has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await seedObjectsA11yStorage(page)
		await installObjectsA11yApi(page)

		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'), {
			timeout: 10_000,
			maxAttempts: 5,
		})
		await expect(objectsListRow(page, 'alpha.png')).toBeVisible()

		await page.getByRole('button', { name: 'Search bucket' }).click()
		const drawer = dialogByName(page, 'Search bucket')
		await expect(drawer).toBeVisible()
		await drawer.getByPlaceholder('Search files or folders').fill('alpha')
		await expect(drawer.getByText('alpha.png')).toBeVisible()

		await expectNoA11yViolations(page, drawer)
	})

	test('Objects search drawer keeps keyboard focus exposed and restores its trigger', async ({ page }) => {
		await setupObjectsMobileA11yPage(page)
		const trigger = page.getByRole('button', { name: /Search bucket/ })
		await trigger.focus()
		await trigger.click()

		const drawer = dialogByName(page, 'Search bucket')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByLabel('Search files or folders')).toBeFocused()
		for (let index = 0; index < 8; index += 1) {
			await expectFocusedControlExposed(drawer)
			await page.keyboard.press('Tab')
		}

		await page.keyboard.press('Escape')
		await expect(drawer).toHaveCount(0)
		await expect(trigger).toBeFocused()
	})

	test('Objects image viewer modal has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await seedObjectsA11yStorage(page)
		await installObjectsA11yApi(page)

		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'), {
			timeout: 10_000,
			maxAttempts: 5,
		})
		const openPreview = page.getByRole('button', { name: 'Open large preview for alpha.png', exact: true })
		await expect(openPreview).toBeVisible()
		await openPreview.click()

		const modal = page.getByTestId('objects-image-viewer-modal')
		await expect(modal).toBeVisible()
		await expect(modal.getByTestId('objects-image-viewer-image')).toBeVisible()

		await expectNoA11yViolations(page, modal)
	})

	test('mobile Objects global search drawer has no axe violations', async ({ page }) => {
		await setupObjectsMobileA11yPage(page)

		await page.getByRole('button', { name: /Search bucket/ }).click()
		const drawer = dialogByName(page, 'Search bucket')
		await expect(drawer).toBeVisible()
		await drawer.getByPlaceholder('Search files or folders').fill('preview')
		await expect(drawer.getByText('preview.png')).toBeVisible()

		await expectNoA11yViolations(page, drawer)
	})

	test('mobile Objects filters drawer has no axe violations', async ({ page }) => {
		await setupObjectsMobileA11yPage(page)

		await page.getByRole('button', { name: /Filters|View|Filter/ }).click()
		const drawer = dialogByName(page, 'View options')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByLabel('Type filter')).toBeVisible()
		await drawer.getByLabel('Favorites only').check()
		await expect(drawer.getByLabel('Favorites first')).toBeDisabled()

		await expectNoA11yViolations(page, drawer)
	})

	test('mobile Objects image viewer modal has no axe violations', async ({ page }) => {
		await setupObjectsMobileA11yPage(page)

		await page.getByRole('button', { name: /Grid/i }).click()
		await expect(page.getByTestId('objects-grid-content')).toBeVisible()
		const previewButton = objectsListRow(page, 'preview.png').getByRole('button', { name: 'Open large preview for preview.png' })
		await expect(previewButton).toBeVisible()
		await previewButton.click()

		const modal = page.getByTestId('objects-image-viewer-modal')
		await expect(modal).toBeVisible()
		await expect(modal.getByTestId('objects-image-viewer-image')).toBeVisible()

		await expectNoA11yViolations(page, modal)
	})

	test('Bucket governance controls dialog has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await setupBucketsA11yPage(page)

		await clickBucketCardManageAction(page, page.locator('body'), bucketsA11yBucket, /Controls/)
		const dialog = dialogByName(page, `Controls: ${bucketsA11yBucket}`)
		await expect(dialog).toBeVisible()
		await expect(dialog.getByText('AWS Controls', { exact: true })).toBeVisible()

		await expectNoA11yViolations(page, dialog)
	})

	test('Bucket policy dialog has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await setupBucketsA11yPage(page)

		await clickBucketCardManageAction(page, page.locator('body'), bucketsA11yBucket, /Policy editor/)
		const dialog = dialogByName(page, `Policy: ${bucketsA11yBucket}`)
		await expect(dialog).toBeVisible()
		await expect(dialog.getByText('S3 policy editor workspace')).toBeVisible()

		await expectNoA11yViolations(page, dialog)
	})

	test('mobile Bucket governance controls sheet has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await setupBucketsA11yPage(page)

		const bucket = bucketCard(page, bucketsA11yBucket)
		await clickBucketCardManageAction(page, bucket, bucketsA11yBucket, /Controls/)
		const sheet = dialogByName(page, `Controls: ${bucketsA11yBucket}`)
		await expect(sheet).toBeVisible()
		await expect(sheet.getByTestId('bucket-governance-mobile-shell')).toBeVisible()

		await expectNoA11yViolations(page, sheet)
	})

	test('mobile Bucket policy sheet has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await setupBucketsA11yPage(page)

		const bucket = bucketCard(page, bucketsA11yBucket)
		await clickBucketCardManageAction(page, bucket, bucketsA11yBucket, /Policy editor/)
		const sheet = dialogByName(page, `Policy: ${bucketsA11yBucket}`)
		await expect(sheet).toBeVisible()
		await expect(sheet.getByTestId('bucket-policy-mobile-shell')).toBeVisible()

		await expectNoA11yViolations(page, sheet)
	})

	test('mobile Bucket delete confirmation, not-empty warning, and delete-job fallback have no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await setupBucketsA11yPage(page, {
			deleteBucketError: {
				bucketName: bucketsA11yBucket,
				code: 'bucket_not_empty',
				message: 'bucket contains objects',
			},
		})

		const bucket = bucketCard(page, bucketsA11yBucket)
		await clickBucketCardManageAction(page, bucket, bucketsA11yBucket, /Delete bucket/)
		const confirmDialog = dialogByName(page, `Delete bucket "${bucketsA11yBucket}"?`)
		await expect(confirmDialog).toBeVisible()
		await expect(confirmDialog.getByPlaceholder(bucketsA11yBucket)).toBeVisible()
		await expectNoA11yViolations(page, confirmDialog)

		const deleteResponse = page.waitForResponse((response) => (
			response.request().method() === 'DELETE'
			&& response.url().includes(`/api/v1/buckets/${encodeURIComponent(bucketsA11yBucket)}`)
		))
		await confirmDialog.getByPlaceholder(bucketsA11yBucket).fill(bucketsA11yBucket)
		const deleteButton = confirmDialog.getByRole('button', { name: 'Delete' })
		await deleteButton.focus()
		await expect(deleteButton).toBeFocused()
		await page.keyboard.press('Enter')
		await deleteResponse

		const warningDialog = dialogByName(page, `Bucket "${bucketsA11yBucket}" isn’t empty`)
		await expect(warningDialog).toBeVisible()
		await expect(warningDialog.getByRole('button', { name: 'Delete all objects (job)' })).toBeVisible()
		await expectNoA11yViolations(page, warningDialog)

		await warningDialog.getByRole('button', { name: 'Delete all objects (job)' }).click()
		await expect(page).toHaveURL(/\/jobs$/)
		const deleteJobSheet = dialogByName(page, 'Create delete job (S3)')
		await expect(deleteJobSheet).toBeVisible()
		await expect(deleteJobSheet.getByRole('switch', { name: 'Delete ALL objects in bucket' })).toHaveAttribute('aria-checked', 'true')
		await expectNoA11yViolations(page, deleteJobSheet)
	})

	test('mobile GCS governance controls sheet has no axe violations', async ({ page }) => {
		await setupGcsBucketsMobileA11yPage(page)

		const bucket = bucketCard(page, bucketsA11yBucket)
		await clickBucketCardManageAction(page, bucket, bucketsA11yBucket, /Controls/)
		const sheet = dialogByName(page, `Controls: ${bucketsA11yBucket}`)
		await expect(sheet).toBeVisible()
		await expect(sheet.getByText('GCS Controls', { exact: true })).toBeVisible()
		await expect(sheet.getByTestId('bucket-governance-gcs-binding-card')).toBeVisible()

		await expectNoA11yViolations(page, sheet)
	})

	test('mobile GCS governance locked retention sheet has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await installProfilesBucketsMobileResponsiveFixtures(page, {
			profileProvider: 'gcp_gcs',
			profiles: [
				{
					id: 'profiles-buckets-mobile-profile',
					name: 'GCS Warning A11y Profile',
					provider: 'gcp_gcs',
					projectNumber: '1234567890',
					createdAt: now,
					updatedAt: now,
				},
			],
			bucketGovernance: buildGcsLockedRetentionGovernanceFixture(bucketsA11yBucket),
		})
		await seedProfilesBucketsMobileResponsiveStorage(page, { bucket: bucketsA11yBucket })
		await gotoBucketsPage(page, {
			ready: (scope) => scope.getByText(bucketsA11yBucket),
		})

		const bucket = bucketCard(page, bucketsA11yBucket)
		await clickBucketCardManageAction(page, bucket, bucketsA11yBucket, /Controls/)
		const sheet = dialogByName(page, `Controls: ${bucketsA11yBucket}`)
		await expect(sheet).toBeVisible()
		await expect(sheet.getByText('GCS Controls', { exact: true })).toBeVisible()
		await expect(sheet.getByTestId('bucket-governance-retention').getByText('Locked retention', { exact: true })).toBeVisible()
		await expect(sheet.getByTestId('bucket-governance-retention').getByText('Locked GCS retention policies are read-only from this controls surface.')).toBeVisible()

		await expectNoA11yViolations(page, sheet)
	})

	test('mobile Azure governance controls sheet has no axe violations', async ({ page }) => {
		await setupAzureBucketsMobileA11yPage(page)

		const bucket = bucketCard(page, bucketsA11yBucket)
		await clickBucketCardManageAction(page, bucket, bucketsA11yBucket, /Controls/)
		const sheet = dialogByName(page, `Controls: ${bucketsA11yBucket}`)
		await expect(sheet).toBeVisible()
		await expect(sheet.getByText('Azure Controls', { exact: true })).toBeVisible()
		await expect(sheet.getByRole('button', { name: 'Add policy' })).toBeVisible()

		await expectNoA11yViolations(page, sheet)
	})

	test('mobile Azure governance immutability warning sheet has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await installProfilesBucketsMobileResponsiveFixtures(page, {
			profileProvider: 'azure_blob',
			profiles: [
				{
					id: 'profiles-buckets-mobile-profile',
					name: 'Azure Warning A11y Profile',
					provider: 'azure_blob',
					accountName: 'playwright',
					accountKey: 'secret',
					createdAt: now,
					updatedAt: now,
				},
			],
			bucketGovernance: buildAzureImmutabilityWarningGovernanceFixture(bucketsA11yBucket),
		})
		await seedProfilesBucketsMobileResponsiveStorage(page, { bucket: bucketsA11yBucket })
		await gotoBucketsPage(page, {
			ready: (scope) => scope.getByText(bucketsA11yBucket),
		})

		const bucket = bucketCard(page, bucketsA11yBucket)
		await clickBucketCardManageAction(page, bucket, bucketsA11yBucket, /Controls/)
		const sheet = dialogByName(page, `Controls: ${bucketsA11yBucket}`)
		await expect(sheet).toBeVisible()
		await expect(sheet.getByText('Azure Controls', { exact: true })).toBeVisible()
		await expect(sheet.getByText('Azure ARM credentials required for legal hold editing')).toBeVisible()
		await expect(sheet.getByText('Policy is locked')).toBeVisible()

		await expectNoA11yViolations(page, sheet)
	})

	test('mobile OCI governance warning sheet has no axe violations', async ({ page }) => {
		await setupOciBucketsMobileA11yPage(page)

		const bucket = bucketCard(page, bucketsA11yBucket)
		await clickBucketCardManageAction(page, bucket, bucketsA11yBucket, /Controls/)
		const sheet = dialogByName(page, `Controls: ${bucketsA11yBucket}`)
		await expect(sheet).toBeVisible()
		await expect(sheet.getByText('OCI Controls', { exact: true })).toBeVisible()
		await expect(sheet.getByText('Locked retention rules can only be extended.')).toBeVisible()
		await expect(sheet.getByText('Existing PAR links cannot be edited in place.')).toBeVisible()

		await expectNoA11yViolations(page, sheet)
	})

	test('Jobs details drawer has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await seedJobsA11yStorage(page)
		await installJobsA11yApi(page)

		await gotoJobsPage(page)
		const uploadRow = jobsTableRow(page, 'job-a11y-upload-success')
		const drawer = await openJobDetailsDrawer(page, uploadRow)
		await expect(drawer.getByText('Upload details')).toBeVisible()

		await expectNoA11yViolations(page, drawer)
	})

	test('Transfers drawer has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await seedJobsA11yStorage(page)
		await seedPersistedTransfer(page)
		await installJobsA11yApi(page)

		await gotoJobsPage(page)
		await page.getByRole('button', { name: 'Transfers' }).click()
		const drawer = dialogByName(page, 'Transfers')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('tab', { name: /Uploads/ }).click()
		await expect(drawer.getByText('a11y-upload.txt')).toBeVisible()

		await expectNoA11yViolations(page, drawer)
	})

	test('mobile Transfers downloads drawer has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await seedJobsA11yStorage(page)
		await seedPersistedTransfer(page)
		await installJobsA11yApi(page)

		await gotoJobsPage(page)
		await page.getByRole('button', { name: 'Transfers' }).click()
		const drawer = dialogByName(page, 'Transfers')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('tab', { name: /Downloads/ }).click()
		await expect(drawer.getByText('exports/')).toBeVisible()

		await expectNoA11yViolations(page, drawer)
	})

	test('mobile Transfers uploads drawer has no axe violations', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await seedJobsA11yStorage(page)
		await seedPersistedTransfer(page)
		await installJobsA11yApi(page)

		await gotoJobsPage(page)
		await page.getByRole('button', { name: 'Transfers' }).click()
		const drawer = dialogByName(page, 'Transfers')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('tab', { name: /Uploads/ }).click()
		await expect(drawer.getByText('a11y-upload.txt')).toBeVisible()

		await expectNoA11yViolations(page, drawer)
	})

	test('mobile Profiles edit dialog has no axe violations', async ({ page }) => {
		await setupProfilesMobileA11yPage(page)

		const card = profileCard(page, 'Backup Profile')
		await card.getByRole('button', { name: 'Profile tools for Backup Profile' }).click()
		await page.getByRole('menuitem', { name: 'Edit' }).click()
		const dialog = dialogByName(page, 'Edit Profile')
		await expect(dialog).toBeVisible()
		await expect(dialog.getByLabel('Name')).toHaveValue('Backup Profile')

		await expectNoA11yViolations(page, dialog)
	})

	test('mobile Profiles import YAML dialog has no axe violations', async ({ page }) => {
		await setupProfilesMobileA11yPage(page)

		await page.getByRole('button', { name: 'Import profile' }).click()
		const dialog = dialogByName(page, 'Import Profile YAML')
		await expect(dialog).toBeVisible()
		await expect(dialog.getByRole('textbox', { name: 'Paste YAML' })).toBeVisible()

		await expectNoA11yViolations(page, dialog)
	})

	test('mobile Jobs filters sheet has no axe violations', async ({ page }) => {
		await setupJobsMobileA11yPage(page)

		const sheet = await openJobsMobileFilters(page)
		await expect(sheet.getByRole('combobox', { name: 'Job status filter' })).toBeVisible()

		await expectNoA11yViolations(page, sheet)
	})

	test('mobile Jobs upload source sheet has no axe violations', async ({ page }) => {
		await setupJobsMobileA11yPage(page)

		await page.getByRole('button', { name: 'Upload from device' }).click()
		const sheet = dialogByName(page, 'Upload from device')
		await expect(sheet).toBeVisible()
		await expect(sheet.getByRole('button', { name: 'Choose from device…' })).toBeVisible()

		await expectNoA11yViolations(page, sheet)
	})

	test('mobile Uploads source dialog has no axe violations', async ({ page }) => {
		await setupUploadsMobileA11yPage(page)

		await page.getByRole('button', { name: /Add from device/i }).click()
		const dialog = dialogByName(page, 'Add upload source')
		await expect(dialog).toBeVisible()
		await expect(dialog.getByRole('button', { name: 'Choose files' })).toBeVisible()

		await expectNoA11yViolations(page, dialog)
	})

	test('mobile Settings drawer has no axe violations', async ({ page }) => {
		const drawer = await setupSettingsMobileA11yPage(page)

		await drawer.getByRole('tab', { name: 'Transfers' }).click()
		await drawer.getByText('Advanced transfer options').click()
		await expect(drawer.getByText('Force server proxy for downloads and previews')).toBeVisible()

		await expectNoA11yViolations(page, drawer)
	})
})
