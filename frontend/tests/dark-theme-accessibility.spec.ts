import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

import { seedLocalStorage } from './support/apiFixtures'
import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import {
	installObjectsMobileResponsiveFixtures,
	seedObjectsMobileResponsiveStorage,
} from './support/objectsMobileResponsive'
import {
	buildAwsGovernanceFixture,
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import {
	installLoginMobileResponsiveFixtures,
	installSettingsMobileResponsiveFixtures,
	seedLoginMobileResponsiveStorage,
	seedSettingsMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'
import { clickBucketCardManageAction, dialogByName, gotoBucketsPage, gotoJobsPage, gotoProfilesPage, gotoWithDynamicImportRecovery, objectsListRow } from './support/ui'

const bucketName = 'responsive-bucket'
const jobsProfileId = 'jobs-mobile-profile'
const jobsBucket = 'jobs-mobile-bucket'

async function seedDarkTheme(page: Page) {
	await seedLocalStorage(page, { themeMode: 'dark' })
}

async function expectDarkThemeApplied(page: Page) {
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
	await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark')
}

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

async function setupDarkObjectsPage(page: Page, viewport: { width: number; height: number }) {
	await page.setViewportSize(viewport)
	await installObjectsMobileResponsiveFixtures(page)
	await seedObjectsMobileResponsiveStorage(page)
	await seedDarkTheme(page)
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'), {
		timeout: 10_000,
		maxAttempts: 3,
	})
	await expectDarkThemeApplied(page)
	await expect(objectsListRow(page, 'preview.png')).toBeVisible()
}

async function setupDarkBucketGovernanceSheet(page: Page) {
	await page.setViewportSize({ width: 390, height: 844 })
	await installProfilesBucketsMobileResponsiveFixtures(page, {
		profileProvider: 'aws_s3',
		bucketGovernance: buildAwsGovernanceFixture(bucketName),
	})
	await seedProfilesBucketsMobileResponsiveStorage(page, { bucket: bucketName })
	await seedDarkTheme(page)
	await gotoBucketsPage(page, {
		ready: (scope) => scope.getByText(bucketName),
	})
	await expectDarkThemeApplied(page)

	const bucketCard = page.getByTestId('buckets-list-compact').locator('article').filter({ hasText: bucketName }).first()
	await clickBucketCardManageAction(page, bucketCard, bucketName, /Controls/)

	const sheet = dialogByName(page, `Controls: ${bucketName}`)
	await expect(sheet).toBeVisible()
	await expect(sheet.getByTestId('bucket-governance-mobile-shell')).toBeVisible()
	return sheet
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
						id: 'dark-download-1',
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
						jobId: 'job-dark-download',
						label: 'exports/',
					},
				],
				uploads: [],
			}),
		)
	}, { profileId: jobsProfileId, bucket: jobsBucket })
}

test.describe('dark theme accessibility scans', () => {
	test('Login has no whole-page axe violations in dark mode', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 800 })
		await seedLoginMobileResponsiveStorage(page, '')
		await seedDarkTheme(page)
		await installLoginMobileResponsiveFixtures(page, ['valid-token'])
		await gotoProfilesPage(page, { ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }) })
		await expectDarkThemeApplied(page)

		await expectNoA11yViolations(page, page.locator('body'))
	})

	test('Objects chrome and global search drawer have no axe violations in dark mode', async ({ page }) => {
		await setupDarkObjectsPage(page, { width: 1440, height: 900 })

		await expectNoA11yViolations(page, page.getByTestId('app-header'))
		await expectNoA11yViolations(page, page.getByRole('navigation', { name: 'Primary' }))

		await page.getByRole('button', { name: 'Search bucket' }).click()
		const drawer = dialogByName(page, 'Search bucket')
		await expect(drawer).toBeVisible()
		await drawer.getByPlaceholder('Search files or folders').fill('preview')
		await expect(drawer.getByText('preview.png')).toBeVisible()

		await expectNoA11yViolations(page, drawer)
	})

	test('theme switch disables intermediate color transitions', async ({ page }) => {
		await setupDarkObjectsPage(page, { width: 1440, height: 900 })
		await page.getByRole('button', { name: 'App menu' }).click()

		const transitionProof = page.evaluate(() => new Promise<{ changing: boolean; sampled: number; nonZero: string[] }>((resolve) => {
			const observer = new MutationObserver(() => {
				observer.disconnect()
				const elements = [...document.querySelectorAll<HTMLElement>('.ant-btn, .ant-menu-item, .ant-layout, .ant-layout-sider')]
				const durations = elements.map((element) => getComputedStyle(element).transitionDuration)
				resolve({
					changing: document.documentElement.dataset.themeChanging === 'true',
					sampled: durations.length,
					nonZero: durations.filter((duration) => duration.split(', ').some((value) => value !== '0s')),
				})
			})
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
		}))

		await page.getByRole('menuitem', { name: /Light mode/i }).click()
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
		const proof = await transitionProof
		expect(proof.changing).toBe(true)
		expect(proof.sampled).toBeGreaterThan(5)
		expect(proof.nonZero).toEqual([])
	})

	test('mobile profile edit dialog has no axe violations in dark mode', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await seedDarkTheme(page)
		await gotoProfilesPage(page)
		await expectDarkThemeApplied(page)

		const profileCard = page.getByTestId('profiles-list-compact').locator('article').filter({ hasText: 'Backup Profile' }).first()
		await profileCard.getByRole('button', { name: 'Profile tools for Backup Profile' }).click()
		await page.getByRole('menuitem', { name: 'Edit' }).click()
		const dialog = dialogByName(page, 'Edit Profile')
		await expect(dialog).toBeVisible()

		await expectNoA11yViolations(page, dialog)
	})

	test('mobile bucket governance sheet has no axe violations in dark mode', async ({ page }) => {
		const sheet = await setupDarkBucketGovernanceSheet(page)

		await expectNoA11yViolations(page, sheet)
	})

	test('mobile settings drawer has no axe violations in dark mode', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await installSettingsMobileResponsiveFixtures(page)
		await seedSettingsMobileResponsiveStorage(page)
		await seedDarkTheme(page)

		await page.goto('/settings')
		await expectDarkThemeApplied(page)

		const drawer = dialogByName(page, 'Settings')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('tab', { name: 'Support' }).click()
		await drawer.getByRole('button', { name: 'Server and backup' }).click()
		await expect(drawer.getByText('Runtime diagnostics')).toBeVisible()

		await expectNoA11yViolations(page, drawer)
	})

	test('Transfers drawer has no axe violations in dark mode', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
		await seedPersistedTransfer(page)
		await seedDarkTheme(page)

		await gotoJobsPage(page)
		await expectDarkThemeApplied(page)

		await page.getByRole('button', { name: 'Transfers' }).click()
		const drawer = dialogByName(page, 'Transfers')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByText('exports/')).toBeVisible()

		await expectNoA11yViolations(page, drawer)
	})
})
