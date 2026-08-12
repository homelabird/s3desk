import { expect, test, type Locator, type Page } from '@playwright/test'

import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import { clickBucketCardManageAction, gotoBucketsPage } from './support/ui'

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

async function expectMinTouchHeight(locator: Locator, minHeight = 44) {
	await expect.poll(() => locator.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(minHeight) // e2e-geometry-allow validates compact bucket-card action touch target height
}

test.describe('@mobile-responsive Buckets mobile workflows', () => {
	test('opens and closes the create bucket flow on mobile', async ({ page }) => {
		await setupBucketsPage(page)

		await page.getByRole('button', { name: 'New Bucket' }).click()

		const dialog = page.getByRole('dialog', { name: 'Create Bucket' })
		await expect(dialog).toBeVisible()
		await dialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(dialog).toHaveCount(0)
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

		await expectMinTouchHeight(manageButton)

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

	test('switches between table and cards without creating a nested vertical scroller', async ({ page }) => {
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

		await page.setViewportSize({ width: 390, height: 844 })
		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()
		await expect(page.getByTestId('buckets-table-desktop')).toHaveCount(0)
		await appScroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
		await expect(getBucketCard(page, 'responsive-bucket-79')).toBeVisible()
	})
})
