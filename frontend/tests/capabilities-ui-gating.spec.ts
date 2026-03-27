import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'

const now = '2024-01-01T00:00:00Z'
const profileId = 'capability-profile'
const bucket = 'capability-bucket'

async function seedStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId,
		bucket,
		objectsUIMode: 'simple',
	})
}

async function mockProviderWithUploadDisabled(page: Page) {
	await installApiFixtures(page, [
		textFixture('GET', '/api/v1/events', '', { status: 200, contentType: 'text/event-stream' }),
		jsonFixture(
			'GET',
			'/api/v1/meta',
			metaJson({
				dataDir: '/tmp',
				staticDir: '/tmp',
				capabilities: {
					profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' },
					providers: {
						azure_blob: {
							bucketCrud: true,
							objectCrud: false,
							jobTransfer: false,
							bucketPolicy: false,
							gcsIamPolicy: false,
							azureContainerAccessPolicy: true,
							presignedUpload: false,
							presignedMultipartUpload: false,
							directUpload: false,
						},
					},
				},
				jobLogMaxBytes: null,
				jobRetentionSeconds: null,
				uploadSessionTTLSeconds: 86400,
				uploadMaxBytes: null,
				uploadDirectStream: false,
				allowedLocalDirs: [],
			}),
		),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: profileId,
				provider: 'azure_blob',
				name: 'Playwright Azure',
				accountName: 'playwright',
				accountKey: 'secret',
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
			items: [],
			nextContinuationToken: null,
			isTruncated: false,
		}),
		jsonFixture('GET', `/api/v1/buckets/${bucket}/objects/favorites`, {
			bucket,
			prefix: '',
			items: [],
		}),
	])
}

test('uploads page disables upload controls when provider capability blocks uploads', async ({ page }) => {
	await mockProviderWithUploadDisabled(page)
	await seedStorage(page)
	await page.goto('/uploads')

	await expect(page.getByText('Uploads are not available for this provider')).toBeVisible()
	await expect(page.getByRole('button', { name: 'Add from device…' })).toBeDisabled()
	await expect(page.getByRole('button', { name: /Queue upload/i })).toBeDisabled()
})

test('objects page disables upload button when provider capability blocks uploads', async ({ page }) => {
	await mockProviderWithUploadDisabled(page)
	await seedStorage(page)
	await page.goto('/objects')

	await expect(page.getByRole('heading', { name: 'Objects' })).toBeVisible()
	await expect(page.locator('button').filter({ hasText: 'Upload…' }).first()).toBeDisabled()
})
