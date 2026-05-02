import { expect, test, type Page } from '@playwright/test'

import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import {
	buildAzureGovernanceFixture,
	buildAzureImmutabilityWarningGovernanceFixture,
	buildGcsGovernanceFixture,
	buildGcsLockedRetentionGovernanceFixture,
	buildOciGovernanceFixture,
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import {
	installSettingsMobileResponsiveFixtures,
	seedSettingsMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'
import { installUploadsMobileResponsiveFixtures, seedUploadsMobileResponsiveStorage } from './support/uploadsMobileResponsive'
import { dialogByName, gotoBucketsPage, gotoJobsPage, gotoProfilesPage, gotoUploadsPage, openJobsMobileFilters } from './support/ui'

const visualScreenshotOptions = {
	animations: 'disabled',
	caret: 'hide',
	maxDiffPixelRatio: 0.01,
} as const
const profilesBucketsVisualBucket = 'responsive-bucket'

type ProviderGovernanceVisualCase = {
	provider: NonNullable<
		NonNullable<Parameters<typeof installProfilesBucketsMobileResponsiveFixtures>[1]>['profileProvider']
	>
	profile: Record<string, unknown>
	governance: Record<string, unknown>
	title: string
	expectedText: string | RegExp
	screenshotName: string
}

const providerGovernanceVisualCases = [
	{
		provider: 'gcp_gcs',
		profile: {
			id: 'profiles-buckets-mobile-profile',
			name: 'GCS Visual Profile',
			provider: 'gcp_gcs',
			projectNumber: '1234567890',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
		governance: buildGcsGovernanceFixture(profilesBucketsVisualBucket),
		title: 'GCS Controls',
		expectedText: 'user:dev@example.com',
		screenshotName: 'buckets-mobile-gcs-governance-sheet.png',
	},
	{
		provider: 'azure_blob',
		profile: {
			id: 'profiles-buckets-mobile-profile',
			name: 'Azure Visual Profile',
			provider: 'azure_blob',
			accountName: 'playwright',
			accountKey: 'secret',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
		governance: buildAzureGovernanceFixture(profilesBucketsVisualBucket),
		title: 'Azure Controls',
		expectedText: 'Add policy',
		screenshotName: 'buckets-mobile-azure-governance-sheet.png',
	},
	{
		provider: 'oci_object_storage',
		profile: {
			id: 'profiles-buckets-mobile-profile',
			name: 'OCI Visual Profile',
			provider: 'oci_object_storage',
			namespace: 'playwrightns',
			compartment: 'ocid1.compartment.oc1..playwright',
			configFile: '~/.oci/config',
			configProfile: 'DEFAULT',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
		governance: buildOciGovernanceFixture(profilesBucketsVisualBucket),
		title: 'OCI Controls',
		expectedText: 'Locked retention rules can only be extended.',
		screenshotName: 'buckets-mobile-oci-governance-sheet.png',
	},
] satisfies readonly ProviderGovernanceVisualCase[]

const providerGovernanceWarningVisualCases = [
	{
		provider: 'gcp_gcs',
		profile: {
			id: 'profiles-buckets-mobile-profile',
			name: 'GCS Warning Visual Profile',
			provider: 'gcp_gcs',
			projectNumber: '1234567890',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
		governance: buildGcsLockedRetentionGovernanceFixture(profilesBucketsVisualBucket),
		title: 'GCS Controls',
		expectedText: 'Locked retention',
		screenshotName: 'buckets-mobile-gcs-locked-retention-warning-sheet.png',
	},
	{
		provider: 'azure_blob',
		profile: {
			id: 'profiles-buckets-mobile-profile',
			name: 'Azure Warning Visual Profile',
			provider: 'azure_blob',
			accountName: 'playwright',
			accountKey: 'secret',
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
		governance: buildAzureImmutabilityWarningGovernanceFixture(profilesBucketsVisualBucket),
		title: 'Azure Controls',
		expectedText: /Legal hold detected|Policy is locked/,
		screenshotName: 'buckets-mobile-azure-immutability-warning-sheet.png',
	},
] satisfies readonly ProviderGovernanceVisualCase[]

async function setupJobsVisualPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installJobsMobileResponsiveFixtures(page)
	await seedJobsMobileResponsiveStorage(page)
	await gotoJobsPage(page)
	await expect(page.getByText('job-queued')).toBeVisible()
}

async function setupUploadsVisualPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installUploadsMobileResponsiveFixtures(page)
	await seedUploadsMobileResponsiveStorage(page)
	await gotoUploadsPage(page)
	await expect(page.getByLabel('Upload prefix (optional)')).toBeVisible()
}

async function setupSettingsVisualPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installSettingsMobileResponsiveFixtures(page)
	await seedSettingsMobileResponsiveStorage(page)
	await page.goto('/settings')
	const drawer = dialogByName(page, 'Settings')
	await expect(drawer).toBeVisible()
	return drawer
}

async function setupProfilesVisualPage(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installProfilesBucketsMobileResponsiveFixtures(page)
	await seedProfilesBucketsMobileResponsiveStorage(page)
	await gotoProfilesPage(page)
	await expect(profileCard(page, 'Backup Profile')).toBeVisible()
}

async function setupBucketsVisualPage(
	page: Page,
	options: Parameters<typeof installProfilesBucketsMobileResponsiveFixtures>[1] = {},
) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installProfilesBucketsMobileResponsiveFixtures(page, options)
	await seedProfilesBucketsMobileResponsiveStorage(page, { bucket: profilesBucketsVisualBucket })
	await gotoBucketsPage(page)
	await expect(bucketCard(page, profilesBucketsVisualBucket)).toBeVisible()
}

async function openProviderGovernanceVisualSheet(
	page: Page,
	config: ProviderGovernanceVisualCase,
) {
	await setupBucketsVisualPage(page, {
		profileProvider: config.provider,
		profiles: [config.profile],
		bucketGovernance: config.governance,
	})
	await bucketCard(page, profilesBucketsVisualBucket).getByRole('button', { name: 'Controls' }).click()
	const sheet = dialogByName(page, `Controls: ${profilesBucketsVisualBucket}`)
	await expect(sheet).toBeVisible()
	await expect(sheet.getByText(config.title, { exact: true })).toBeVisible()
	await expect(sheet.getByText(config.expectedText).first()).toBeVisible()
	return sheet
}

function bucketCard(page: Page, bucketName: string) {
	return page.getByTestId('buckets-list-compact').locator('article').filter({ hasText: bucketName }).first()
}

function profileCard(page: Page, profileName: string) {
	return page.getByTestId('profiles-list-compact').locator('article').filter({ hasText: profileName }).first()
}

async function seedPersistedTransfers(page: Page) {
	await page.addInitScript(() => {
		window.sessionStorage.setItem(
			'transfersHistoryV1',
			JSON.stringify({
				version: 1,
				savedAtMs: 1704067200000,
				downloads: [
					{
						id: 'download-visual-done',
						profileId: 'jobs-mobile-profile',
						kind: 'object',
						bucket: 'jobs-mobile-bucket',
						key: 'exports/archive.zip',
						label: 'archive.zip',
						status: 'succeeded',
						createdAtMs: 1704067200000,
						startedAtMs: 1704067201000,
						finishedAtMs: 1704067205000,
						loadedBytes: 1048576,
						totalBytes: 1048576,
						speedBps: 0,
						etaSeconds: 0,
					},
					{
						id: 'download-visual-failed',
						profileId: 'jobs-mobile-profile',
						kind: 'job_artifact',
						jobId: 'job-logs-visual',
						label: 'job-logs-visual.log',
						status: 'failed',
						createdAtMs: 1704067210000,
						startedAtMs: 1704067211000,
						finishedAtMs: 1704067213000,
						loadedBytes: 4096,
						totalBytes: 16384,
						speedBps: 0,
						etaSeconds: 0,
						error: 'Artifact expired before download completed.',
					},
				],
				uploads: [
					{
						id: 'upload-visual-done',
						profileId: 'jobs-mobile-profile',
						bucket: 'jobs-mobile-bucket',
						prefix: 'photos/mobile',
						fileCount: 2,
						status: 'succeeded',
						createdAtMs: 1704067220000,
						startedAtMs: 1704067221000,
						finishedAtMs: 1704067226000,
						loadedBytes: 2097152,
						totalBytes: 2097152,
						speedBps: 0,
						etaSeconds: 0,
						jobId: 'job-upload-visual',
						label: 'mobile-photo-batch',
						filePaths: ['mobile/alpha.jpg', 'mobile/beta.jpg'],
						uploadMode: 'staging',
					},
					{
						id: 'upload-visual-failed',
						profileId: 'jobs-mobile-profile',
						bucket: 'jobs-mobile-bucket',
						prefix: 'reports',
						fileCount: 1,
						status: 'failed',
						createdAtMs: 1704067230000,
						startedAtMs: 1704067231000,
						finishedAtMs: 1704067232000,
						loadedBytes: 1024,
						totalBytes: 8192,
						speedBps: 0,
						etaSeconds: 0,
						label: 'quarterly-report.csv',
						filePaths: ['reports/quarterly-report.csv'],
						uploadMode: 'staging',
						error: 'Checksum verification failed.',
					},
				],
			}),
		)
	})
}

test.describe('Workflow visual regression @visual', () => {
	test('mobile Profiles edit dialog remains stable', async ({ page }) => {
		await setupProfilesVisualPage(page)

		await profileCard(page, 'Backup Profile').getByRole('button', { name: 'More actions for Backup Profile' }).click()
		await page.getByRole('menuitem', { name: 'Edit' }).click()
		const dialog = dialogByName(page, 'Edit Profile')
		await expect(dialog).toBeVisible()
		await expect(dialog.getByLabel('Name')).toHaveValue('Backup Profile')

		await expect(dialog).toHaveScreenshot('profiles-mobile-edit-dialog.png', visualScreenshotOptions)
	})

	test('mobile Profiles YAML import dialog remains stable', async ({ page }) => {
		await setupProfilesVisualPage(page)

		await page.getByRole('button', { name: 'Import YAML' }).click()
		const dialog = dialogByName(page, 'Import Profile YAML')
		await expect(dialog).toBeVisible()
		await expect(dialog.getByRole('textbox', { name: 'Paste YAML here…' })).toBeVisible()

		await expect(dialog).toHaveScreenshot('profiles-mobile-yaml-import-dialog.png', visualScreenshotOptions)
	})

	test('mobile Bucket create dialog remains stable', async ({ page }) => {
		await setupBucketsVisualPage(page)

		await page.getByRole('button', { name: 'New Bucket' }).click()
		const dialog = dialogByName(page, 'Create Bucket')
		await expect(dialog).toBeVisible()
		await expect(dialog.getByLabel('Bucket name')).toBeVisible()

		await expect(dialog).toHaveScreenshot('buckets-mobile-create-dialog.png', visualScreenshotOptions)
	})

	test('mobile Bucket policy sheet remains stable', async ({ page }) => {
		await setupBucketsVisualPage(page, {
			bucketPolicy: {
				Version: '2012-10-17',
				Statement: [],
			},
		})

		await bucketCard(page, profilesBucketsVisualBucket).getByRole('button', { name: 'Policy' }).click()
		const sheet = dialogByName(page, `Policy: ${profilesBucketsVisualBucket}`)
		await expect(sheet).toBeVisible()
		await expect(sheet.getByTestId('bucket-policy-mobile-shell')).toBeVisible()

		await expect(sheet).toHaveScreenshot('buckets-mobile-policy-sheet.png', visualScreenshotOptions)
	})

	test('mobile Bucket delete warning flow remains stable', async ({ page }) => {
		await setupBucketsVisualPage(page, {
			deleteBucketError: {
				bucketName: profilesBucketsVisualBucket,
				code: 'bucket_not_empty',
				message: 'bucket contains objects',
			},
		})

		await bucketCard(page, profilesBucketsVisualBucket).getByRole('button', { name: 'Delete' }).click()
		const confirmDialog = dialogByName(page, `Delete bucket "${profilesBucketsVisualBucket}"?`)
		await expect(confirmDialog).toBeVisible()
		await expect(confirmDialog.getByPlaceholder(profilesBucketsVisualBucket)).toBeVisible()

		await expect(confirmDialog).toHaveScreenshot('buckets-mobile-delete-confirmation.png', visualScreenshotOptions)

		const deleteResponse = page.waitForResponse((response) => (
			response.request().method() === 'DELETE'
			&& response.url().includes(`/api/v1/buckets/${encodeURIComponent(profilesBucketsVisualBucket)}`)
		))
		await confirmDialog.getByPlaceholder(profilesBucketsVisualBucket).fill(profilesBucketsVisualBucket)
		const deleteButton = confirmDialog.getByRole('button', { name: 'Delete' })
		await deleteButton.focus()
		await expect(deleteButton).toBeFocused()
		await page.keyboard.press('Enter')
		await deleteResponse

		const warningDialog = dialogByName(page, `Bucket "${profilesBucketsVisualBucket}" isn’t empty`)
		await expect(warningDialog).toBeVisible()
		await expect(warningDialog.getByRole('button', { name: 'Delete all objects (job)' })).toBeVisible()

		await expect(warningDialog).toHaveScreenshot('buckets-mobile-not-empty-warning.png', visualScreenshotOptions)
	})

	for (const governanceVisualCase of providerGovernanceVisualCases) {
		test(`mobile ${governanceVisualCase.title} sheet remains stable`, async ({ page }) => {
			const sheet = await openProviderGovernanceVisualSheet(page, governanceVisualCase)

			await expect(sheet).toHaveScreenshot(governanceVisualCase.screenshotName, visualScreenshotOptions)
		})
	}

	for (const governanceVisualCase of providerGovernanceWarningVisualCases) {
		test(`mobile ${governanceVisualCase.title} warning sheet remains stable`, async ({ page }) => {
			const sheet = await openProviderGovernanceVisualSheet(page, governanceVisualCase)

			await expect(sheet).toHaveScreenshot(governanceVisualCase.screenshotName, visualScreenshotOptions)
		})
	}

	test('mobile Jobs filters sheet remains stable', async ({ page }) => {
		await setupJobsVisualPage(page)

		const sheet = await openJobsMobileFilters(page)
		await sheet.getByRole('combobox', { name: 'Job status filter' }).selectOption('failed')
		await expect(sheet.getByRole('combobox', { name: 'Job status filter' })).toHaveValue('failed')

		await expect(sheet).toHaveScreenshot('jobs-mobile-filters-sheet.png', visualScreenshotOptions)
	})

	test('mobile Transfers drawer states remain stable', async ({ page }) => {
		await seedPersistedTransfers(page)
		await setupJobsVisualPage(page)

		await page.getByRole('button', { name: 'Transfers' }).click()
		const drawer = dialogByName(page, 'Transfers')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByText('archive.zip', { exact: true })).toBeVisible()

		await expect(drawer).toHaveScreenshot('transfers-mobile-downloads-state.png', visualScreenshotOptions)

		await drawer.getByRole('tab', { name: /Uploads/ }).click()
		await expect(drawer.getByText('mobile-photo-batch')).toBeVisible()

		await expect(drawer).toHaveScreenshot('transfers-mobile-uploads-state.png', visualScreenshotOptions)
	})

	test('mobile Uploads source selection dialog remains stable', async ({ page }) => {
		await setupUploadsVisualPage(page)

		await page.getByRole('button', { name: /Add from device/i }).click()
		const dialog = dialogByName(page, 'Add upload source')
		await expect(dialog).toBeVisible()
		await expect(dialog.getByRole('button', { name: 'Choose files' })).toBeVisible()

		await expect(dialog).toHaveScreenshot('uploads-mobile-source-selection-dialog.png', visualScreenshotOptions)
	})

	test('mobile Settings drawer remains stable', async ({ page }) => {
		const drawer = await setupSettingsVisualPage(page)

		await expect(drawer.getByPlaceholder('Must match API_TOKEN')).toBeVisible()

		await expect(drawer).toHaveScreenshot('settings-mobile-drawer.png', visualScreenshotOptions)
	})
})
