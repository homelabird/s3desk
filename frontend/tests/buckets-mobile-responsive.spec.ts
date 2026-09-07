import { expect, test, type Page } from '@playwright/test'

import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import { expectMinTouchTarget, restoreProjectViewport } from './support/geometry'
import { clickBucketCardManageAction, gotoBucketsPage, gotoProfilesPage } from './support/ui'

const primaryBucket = 'responsive-bucket'

function buildAwsGovernance(bucket: string) {
	return {
		provider: 'aws_s3',
		bucket,
		capabilities: {
			bucket_public_access_block: { enabled: true },
			bucket_object_ownership: { enabled: true },
			bucket_versioning: { enabled: true },
			bucket_default_encryption: { enabled: true },
			bucket_lifecycle: { enabled: true },
		},
		publicExposure: {
			provider: 'aws_s3',
			bucket,
			mode: 'private',
			blockPublicAccess: {
				blockPublicAcls: true,
				ignorePublicAcls: true,
				blockPublicPolicy: true,
				restrictPublicBuckets: true,
			},
		},
		access: {
			provider: 'aws_s3',
			bucket,
			objectOwnership: {
				supported: true,
				mode: 'bucket_owner_enforced',
			},
		},
		versioning: {
			provider: 'aws_s3',
			bucket,
			status: 'enabled',
		},
		encryption: {
			provider: 'aws_s3',
			bucket,
			mode: 'sse_s3',
		},
		lifecycle: {
			provider: 'aws_s3',
			bucket,
			rules: [],
		},
		advanced: {
			rawPolicySupported: true,
			rawPolicyEditable: true,
		},
	}
}

async function setupBucketsPage(page: Page, options?: Parameters<typeof installProfilesBucketsMobileResponsiveFixtures>[1]) {
	await installProfilesBucketsMobileResponsiveFixtures(page, options)
	await seedProfilesBucketsMobileResponsiveStorage(page, { bucket: primaryBucket })
	await gotoBucketsPage(page)
}

function getBucketCard(page: Page, bucketName: string) {
	return page.getByTestId('buckets-list-compact').locator('article').filter({ hasText: bucketName }).first()
}

test.describe('@mobile-responsive Buckets mobile workflows', () => {
	test('finds a bucket beyond the virtual window and clears search on profile changes', async ({ page }) => {
		const buckets = Array.from({ length: 50 }, (_, index) => ({ name: `audit-bucket-${String(index + 1).padStart(2, '0')}` }))
		await installProfilesBucketsMobileResponsiveFixtures(page, { buckets })
		await page.route('**/api/v1/buckets', (route) => route.fulfill({ json:
			route.request().headers()['x-profile-id'] === 'profiles-buckets-mobile-secondary' ? [{ name: 'backup-only' }] : buckets,
		}))
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await gotoBucketsPage(page)
		const search = page.getByRole('searchbox', { name: 'Search buckets' })
		await expect(page.getByText('audit-bucket-50', { exact: true })).toHaveCount(0)
		await search.fill(' BUCKET-50 ')
		await expect(page.getByText('1 of 50 buckets', { exact: true })).toBeVisible()
		await page.getByRole('button', { name: 'Manage bucket audit-bucket-50', exact: true }).click()
		await expect(page.getByRole('menuitem', { name: /Policy editor$/ })).toBeVisible()
		await page.keyboard.press('Escape')
		await search.fill('missing')
		await expect(page.getByText('No buckets match your search.')).toBeVisible()
		await page.getByRole('button', { name: 'Clear search', exact: true }).click()
		await expect(page.getByText('50 of 50 buckets', { exact: true })).toBeVisible()
		await search.fill('bucket-50')
		await page.getByRole('combobox', { name: 'Profile', exact: true }).selectOption('profiles-buckets-mobile-secondary')
		await expect(search).toHaveValue('')
		await expect(page.getByText('backup-only', { exact: true })).toBeVisible()
		await expect(page.getByText('audit-bucket-50', { exact: true })).toHaveCount(0)
		await page.getByRole('combobox', { name: 'Profile', exact: true }).selectOption('profiles-buckets-mobile-profile')
		await expect(search).toHaveValue('')
		await search.fill('bucket-50')
		await page.getByRole('button', { name: 'Open objects for bucket audit-bucket-50', exact: true }).click()
		await expect(page).toHaveURL(/\/objects/)
	})

	test('keeps short bucket actions on one row at the 320px mobile floor', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 568 })
		await setupBucketsPage(page)

		const bucketCard = getBucketCard(page, primaryBucket)
		const openButton = bucketCard.getByRole('button', { name: `Open objects for bucket ${primaryBucket}` })
		const manageButton = bucketCard.getByRole('button', { name: `Manage bucket ${primaryBucket}` })
		const [openBox, manageBox] = await Promise.all([
			openButton.boundingBox(), // e2e-geometry-allow compares compact-card action rows at the narrow mobile floor
			manageButton.boundingBox(), // e2e-geometry-allow compares compact-card action rows at the narrow mobile floor
		])

		expect(Math.abs((openBox?.y ?? 0) - (manageBox?.y ?? 0))).toBeLessThanOrEqual(2)
		await expectMinTouchTarget(openButton, 48)
		await expectMinTouchTarget(manageButton, 48)
	})

	test('opens and closes the create bucket flow on mobile', async ({ page }) => {
		await setupBucketsPage(page)

		await page.getByRole('button', { name: 'New Bucket' }).click()

		const dialog = page.getByRole('dialog', { name: 'Create Bucket' })
		await expect(dialog).toBeVisible()
		await dialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(dialog).toHaveCount(0)
	})

	for (const outcome of ['success', 'partial'] as const) {
		test(`refreshes the bucket list after creation with ${outcome} result and after deletion`, async ({ page }) => {
			await setupBucketsPage(page, { profileProvider: 'aws_s3' })
			const bucketName = `created-${outcome}-bucket`
			let created = false
			const creates: Array<{ profileId?: string; request: unknown }> = []
			const deletes: Array<string | undefined> = []
			await page.route('**/api/v1/buckets', async (route) => {
				if (route.request().method() === 'GET') {
					return route.fulfill({ json: [{ name: primaryBucket }, ...(created ? [{ name: bucketName }] : [])] })
				}
				if (route.request().method() !== 'POST') return route.fallback()
				creates.push({ profileId: route.request().headers()['x-profile-id'], request: route.request().postDataJSON() })
				created = true
				return route.fulfill(outcome === 'success' ? { status: 201, json: { name: bucketName } } : {
					status: 500, json: { error: {
						code: 'bucket_defaults_apply_failed', message: 'secure defaults failed',
						details: { bucketCreated: true, applySection: 'encryption' },
					} },
				})
			})
			await page.route(`**/api/v1/buckets/${bucketName}`, async (route) => {
				if (route.request().method() !== 'DELETE') return route.fallback()
				deletes.push(route.request().headers()['x-profile-id'])
				created = false
				return route.fulfill({ status: 204 })
			})
			await page.getByRole('button', { name: 'New Bucket' }).click()
			const dialog = page.getByRole('dialog', { name: 'Create Bucket' })
			await dialog.getByLabel('Bucket name').fill(bucketName)
			await dialog.getByRole('switch', { name: 'Apply recommended AWS secure defaults' }).click()
			await dialog.getByRole('button', { name: 'Create', exact: true }).click()
			await expect(dialog).toHaveCount(0)
			expect(creates).toEqual([{ profileId: 'profiles-buckets-mobile-profile', request: expect.objectContaining({
				name: bucketName, defaults: expect.objectContaining({ encryption: { mode: 'sse_s3' } }),
			}) }])
			const feedback = page.locator('.ant-message-notice-content').filter({
				hasText: outcome === 'success' ? 'Bucket created' : 'Bucket created, but secure defaults failed while applying encryption.',
			})
			await expect(feedback).toBeVisible()
			const bucketCard = getBucketCard(page, bucketName)
			await expect(bucketCard).toBeVisible()
			await clickBucketCardManageAction(page, bucketCard, bucketName, /Delete bucket/)
			const confirmDialog = page.getByRole('dialog', { name: `Delete bucket "${bucketName}"?` })
			await confirmDialog.getByLabel(`Type "${bucketName}" to confirm`).fill(bucketName)
			await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click()
			await expect(confirmDialog).toHaveCount(0)
			await expect(bucketCard).toHaveCount(0)
			expect(deletes).toEqual(['profiles-buckets-mobile-profile'])
		})
	}

	test('does not show a late creation warning after browser back and refreshes the list on return', async ({ page }) => {
		await installProfilesBucketsMobileResponsiveFixtures(page, { profileProvider: 'aws_s3' })
		await seedProfilesBucketsMobileResponsiveStorage(page)
		const bucketName = 'late-created-bucket'
		let created = false
		let started = false
		let releaseCreate!: () => void
		const createGate = new Promise<void>((resolve) => { releaseCreate = resolve })
		await page.route('**/api/v1/buckets', async (route) => {
			if (route.request().method() === 'GET') {
				return route.fulfill({ json: [{ name: primaryBucket }, ...(created ? [{ name: bucketName }] : [])] })
			}
			if (route.request().method() !== 'POST') return route.fallback()
			started = true
			await createGate
			created = true
			return route.fulfill({ status: 500, json: { error: {
				code: 'bucket_defaults_apply_failed', message: 'secure defaults failed',
				details: { bucketCreated: true, applySection: 'encryption' },
			} } })
		})
		await gotoProfilesPage(page)
		await page.getByRole('button', { name: 'Open navigation' }).click()
		await page.getByRole('link', { name: 'Buckets', exact: true }).click()
		await page.getByRole('button', { name: 'New Bucket' }).click()
		const dialog = page.getByRole('dialog', { name: 'Create Bucket' })
		await dialog.getByLabel('Bucket name').fill(bucketName)
		await dialog.getByRole('switch', { name: 'Apply recommended AWS secure defaults' }).click()
		const response = page.waitForResponse((resp) => resp.request().method() === 'POST' && new URL(resp.url()).pathname === '/api/v1/buckets')
		await dialog.getByRole('button', { name: 'Create', exact: true }).click()
		await expect.poll(() => started).toBe(true)
		await page.goBack()
		await expect(page).toHaveURL(/\/profiles$/)
		await expect(dialog).toHaveCount(0)
		releaseCreate()
		await response
		await page.goForward()
		await expect(getBucketCard(page, bucketName)).toBeVisible()
		expect(await page.locator('.ant-message-notice-content').filter({ hasText: 'secure defaults failed' }).count()).toBe(0)
	})

	test('opens policy and controls overlays from compact bucket cards', async ({ page }) => {
		await setupBucketsPage(page, {
			profileProvider: 'aws_s3',
			bucketPolicy: {
				Version: '2012-10-17',
				Statement: [],
			},
			bucketGovernance: buildAwsGovernance(primaryBucket),
		})

		const bucketCard = getBucketCard(page, primaryBucket)
		const manageButton = bucketCard.getByRole('button', { name: `Manage bucket ${primaryBucket}` })

		await expectMinTouchTarget(manageButton)

		await clickBucketCardManageAction(page, bucketCard, primaryBucket, /Policy editor/)
		const policySheet = page.getByRole('dialog', { name: `Policy: ${primaryBucket}` })
		await expect(policySheet).toBeVisible()
		await expect(policySheet.getByTestId('bucket-policy-mobile-shell')).toBeVisible()
		await policySheet.getByLabel('Close', { exact: true }).click()
		await expect(policySheet).toHaveCount(0)

		await clickBucketCardManageAction(page, bucketCard, primaryBucket, /Controls/)
		const controlsSheet = page.getByRole('dialog', { name: `Controls: ${primaryBucket}` })
		await expect(controlsSheet).toBeVisible()
		await expect(controlsSheet.getByTestId('bucket-governance-mobile-shell')).toBeVisible()
		await controlsSheet.getByLabel('Close', { exact: true }).click()
		await expect(controlsSheet).toHaveCount(0)
	})

	test('routes non-empty delete fallback into a prefilled delete-job sheet', async ({ page }) => {
		await setupBucketsPage(page, {
			profileProvider: 'aws_s3',
			deleteBucketError: {
				bucketName: primaryBucket,
				code: 'bucket_not_empty',
				message: 'bucket contains objects',
			},
		})

		const bucketCard = getBucketCard(page, primaryBucket)
		await clickBucketCardManageAction(page, bucketCard, primaryBucket, /Delete bucket/)

		const confirmDialog = page.getByRole('dialog', { name: `Delete bucket "${primaryBucket}"?` })
		await expect(confirmDialog).toBeVisible()
		await confirmDialog.getByLabel(`Type "${primaryBucket}" to confirm`).fill(primaryBucket)
		const deleteResponse = page.waitForResponse((response) => {
			return (
				response.request().method() === 'DELETE' &&
				response.url().includes(`/api/v1/buckets/${encodeURIComponent(primaryBucket)}`)
			)
		})
		const deleteButton = confirmDialog.getByRole('button', { name: 'Delete' })
		await deleteButton.focus()
		await expect(deleteButton).toBeFocused()
		await page.keyboard.press('Enter')
		await deleteResponse

		const warningDialog = page.getByRole('dialog', { name: `Bucket "${primaryBucket}" isn’t empty` })
		await expect(warningDialog).toBeVisible()
		await warningDialog.getByRole('button', { name: 'Delete all objects (job)' }).click()

		await expect(page).toHaveURL(/\/jobs$/)
		const deleteJobSheet = page.getByRole('dialog', { name: 'Create delete job (S3)' })
		await expect(deleteJobSheet).toBeVisible()
		await expect(deleteJobSheet.getByRole('combobox', { name: 'Bucket' })).toHaveValue(primaryBucket)
		await expect(deleteJobSheet.getByRole('switch', { name: 'Delete ALL objects in bucket' })).toHaveAttribute('aria-checked', 'true')
	})

	test('keeps compact-card actions usable on the last bucket', async ({ page }) => {
		const lastBucket = 'zz-final-mobile-bucket'
		await setupBucketsPage(page, {
			buckets: [
				{ name: primaryBucket, createdAt: '2024-01-01T00:00:00Z' },
				{ name: 'archive-mobile-bucket', createdAt: '2024-01-01T00:00:00Z' },
				{ name: 'logs-mobile-bucket', createdAt: '2024-01-01T00:00:00Z' },
				{ name: lastBucket, createdAt: '2024-01-01T00:00:00Z' },
			],
		})

		const lastCard = getBucketCard(page, lastBucket)
		await lastCard.scrollIntoViewIfNeeded()
		await expect(lastCard).toBeVisible()
		await expect(lastCard.getByRole('button', { name: `Manage bucket ${lastBucket}` })).toBeVisible()

		await clickBucketCardManageAction(page, lastCard, lastBucket, /Delete bucket/)

		const confirmDialog = page.getByRole('dialog', { name: `Delete bucket "${lastBucket}"?` })
		await expect(confirmDialog).toBeVisible()
		await confirmDialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(confirmDialog).toHaveCount(0)
	})

	test('switches between table and cards without creating a nested vertical scroller', async ({ page }, testInfo) => {
		const buckets = Array.from({ length: 80 }, (_, index) => ({
			name: index === 0 ? primaryBucket : `responsive-bucket-${index}`,
			createdAt: '2024-01-01T00:00:00Z',
		}))
		await page.setViewportSize({ width: 1280, height: 800 })
		await setupBucketsPage(page, { buckets })

		await expect(page.getByTestId('buckets-table-desktop')).toBeVisible()
		await expect(page.getByTestId('buckets-list-compact')).toHaveCount(0)
		const appScroller = page.locator('main[data-scroll-container="app-content"]')
		await appScroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
		await expect(page.getByTestId('buckets-table-desktop').getByText('responsive-bucket-79')).toBeVisible()
		await appScroller.evaluate((element) => element.scrollTo({ top: 0 }))

		await restoreProjectViewport(page, testInfo)
		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()
		await expect(page.getByTestId('buckets-table-desktop')).toHaveCount(0)
		await appScroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
		await expect(getBucketCard(page, 'responsive-bucket-79')).toBeVisible()
	})
})
