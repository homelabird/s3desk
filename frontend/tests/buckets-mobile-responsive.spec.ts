import { expect, test, type Page } from '@playwright/test'

import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import { gotoBucketsPage } from './support/ui'

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

		await bucketCard.getByRole('button', { name: 'Policy' }).click()
		const policySheet = page.getByRole('dialog', { name: `Policy: ${primaryBucket}` })
		await expect(policySheet).toBeVisible()
		await expect(policySheet.getByTestId('bucket-policy-mobile-shell')).toBeVisible()
		await policySheet.getByLabel('Close', { exact: true }).click()
		await expect(policySheet).toHaveCount(0)

		await bucketCard.getByRole('button', { name: 'Controls' }).click()
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
		await bucketCard.getByRole('button', { name: 'Delete' }).click()

		const confirmDialog = page.getByRole('dialog', { name: `Delete bucket "${primaryBucket}"?` })
		await expect(confirmDialog).toBeVisible()
		await confirmDialog.getByPlaceholder(primaryBucket).fill(primaryBucket)
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
})
