import { expect, test, type Page } from '@playwright/test'

import { legacyTokenProfileScopedStorageKey } from '../src/lib/profileScopedStorage'
import { installJobsMobileResponsiveFixtures } from './support/jobsMobileResponsive'
import { installObjectsMobileResponsiveFixtures } from './support/objectsMobileResponsive'
import { installUploadsMobileResponsiveFixtures } from './support/uploadsMobileResponsive'
import { seedLocalStorage } from './support/apiFixtures'
import {
	readProfileScopedLocalStorage,
	seedLegacyTokenProfileScopedLocalStorage,
} from './support/storage'
import {
	dialogByName,
	gotoJobsPage,
	gotoObjectsPage,
	gotoUploadsPage,
	objectsListRow,
	openJobsMobileFilters,
} from './support/ui'

async function expectProfileStorageValueMigrated(
	page: Page,
	args: {
		apiToken: string
		name: string
		namespace: string
		profileId: string | null
		value: string
	},
) {
	await expect
		.poll(() =>
			readProfileScopedLocalStorage(page, {
				apiToken: args.apiToken,
				name: args.name,
				namespace: args.namespace,
				profileId: args.profileId,
			}, null),
		)
		.toBe(args.value)
	await expect
		.poll(() =>
			page.evaluate(
				(key) => window.localStorage.getItem(key),
				legacyTokenProfileScopedStorageKey(args.namespace, args.apiToken, args.profileId, args.name),
			),
		)
		.toBeNull()
}

test.describe('profile-scoped storage migration', () => {
	test('migrates legacy raw-token Jobs filters into origin-scoped keys', async ({ page }) => {
		await installJobsMobileResponsiveFixtures(page)
		await seedLocalStorage(page, {
			apiToken: 'jobs-mobile-token',
			profileId: 'jobs-mobile-profile',
		})
		await seedLegacyTokenProfileScopedLocalStorage(page, {
			apiToken: 'jobs-mobile-token',
			namespace: 'jobs',
			profileId: 'jobs-mobile-profile',
			values: {
				statusFilter: 'failed',
			},
		})

		await page.setViewportSize({ width: 390, height: 844 })
		await gotoJobsPage(page)

		const sheet = await openJobsMobileFilters(page)
		await expect(sheet.getByRole('combobox', { name: 'Job status filter' })).toHaveValue('failed')
		await expectProfileStorageValueMigrated(page, {
			apiToken: 'jobs-mobile-token',
			name: 'statusFilter',
			namespace: 'jobs',
			profileId: 'jobs-mobile-profile',
			value: 'failed',
		})
	})

	test('migrates legacy raw-token Uploads destination state into origin-scoped keys', async ({ page }) => {
		await installUploadsMobileResponsiveFixtures(page)
		await seedLocalStorage(page, {
			apiToken: 'uploads-mobile-token',
			profileId: 'uploads-mobile-profile',
		})
		await seedLegacyTokenProfileScopedLocalStorage(page, {
			apiToken: 'uploads-mobile-token',
			namespace: 'uploads',
			profileId: 'uploads-mobile-profile',
			values: {
				bucket: 'uploads-mobile-bucket',
				prefix: 'legacy/photos',
			},
		})

		await page.setViewportSize({ width: 640, height: 844 })
		await gotoUploadsPage(page)

		await expect(page.getByLabel('Upload prefix (optional)')).toHaveValue('legacy/photos')
		await expect(page.locator('strong').filter({ hasText: 's3://uploads-mobile-bucket/legacy/photos' }).first()).toBeVisible()
		await expectProfileStorageValueMigrated(page, {
			apiToken: 'uploads-mobile-token',
			name: 'bucket',
			namespace: 'uploads',
			profileId: 'uploads-mobile-profile',
			value: 'uploads-mobile-bucket',
		})
		await expectProfileStorageValueMigrated(page, {
			apiToken: 'uploads-mobile-token',
			name: 'prefix',
			namespace: 'uploads',
			profileId: 'uploads-mobile-profile',
			value: 'legacy/photos',
		})
	})

	test('migrates legacy raw-token Objects location and global search state into origin-scoped keys', async ({ page }) => {
		await installObjectsMobileResponsiveFixtures(page)
		await seedLocalStorage(page, {
			apiToken: 'objects-mobile-token',
			objectsDetailsOpen: false,
			objectsUIMode: 'advanced',
			profileId: 'objects-mobile-profile',
		})
		await seedLegacyTokenProfileScopedLocalStorage(page, {
			apiToken: 'objects-mobile-token',
			namespace: 'objects',
			profileId: 'objects-mobile-profile',
			values: {
				bucket: 'objects-mobile-bucket',
				globalSearch: 'alpha',
				globalSearchExt: 'txt',
			},
		})

		await page.setViewportSize({ width: 390, height: 844 })
		await gotoObjectsPage(page)

		await expect(objectsListRow(page, 'alpha.txt')).toBeVisible()
		await page.getByRole('button', { name: /Indexed Search/ }).click()
		const drawer = dialogByName(page, 'Indexed Search')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByPlaceholder('Search query (substring)')).toHaveValue('alpha')
		await expect(drawer.getByLabel('Extension filter')).toHaveValue('txt')
		await expectProfileStorageValueMigrated(page, {
			apiToken: 'objects-mobile-token',
			name: 'bucket',
			namespace: 'objects',
			profileId: 'objects-mobile-profile',
			value: 'objects-mobile-bucket',
		})
		await expectProfileStorageValueMigrated(page, {
			apiToken: 'objects-mobile-token',
			name: 'globalSearch',
			namespace: 'objects',
			profileId: 'objects-mobile-profile',
			value: 'alpha',
		})
		await expectProfileStorageValueMigrated(page, {
			apiToken: 'objects-mobile-token',
			name: 'globalSearchExt',
			namespace: 'objects',
			profileId: 'objects-mobile-profile',
			value: 'txt',
		})
	})
})
