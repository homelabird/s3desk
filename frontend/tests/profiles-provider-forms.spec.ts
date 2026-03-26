import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'

async function seedStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId: null,
	})
}

async function setupApiMocks(page: Page, profiles: Array<Record<string, unknown>> = []) {
	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', metaJson()),
		jsonFixture('GET', '/api/v1/profiles', profiles),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

async function selectProvider(page: Page, optionLabel: string) {
	const combobox = page.getByRole('combobox', { name: 'Provider' })
	await combobox.selectOption({ label: optionLabel })
}

test('profile provider forms toggle provider-specific fields', async ({ page }) => {
	await seedStorage(page)
	await setupApiMocks(page)

	await page.goto('/profiles?create=1')
	await expect(page.getByRole('dialog', { name: 'Create Profile' })).toBeVisible()

	await expect(page.getByRole('textbox', { name: 'Endpoint URL', exact: true })).toBeVisible()
	await expect(page.getByLabel('Access Key ID')).toBeVisible()
	await expect(page.getByLabel('Secret')).toBeVisible()

	await selectProvider(page, 'Azure Blob Storage')
	await expect(page.getByLabel('Storage Account Name')).toBeVisible()
	await expect(page.getByLabel('Account Key')).toBeVisible()
	await expect(page.getByLabel('Access Key ID')).toHaveCount(0)

	await selectProvider(page, 'Google Cloud Storage (GCS)')
	await expect(page.getByLabel('Service Account JSON')).toBeVisible()
	await page.getByRole('switch', { name: 'Anonymous' }).click()
	await expect(page.getByLabel('Service Account JSON')).toHaveCount(0)
	await expect(page.getByText('Anonymous mode only works when the endpoint allows unauthenticated access.')).toBeVisible()

	await selectProvider(page, 'Oracle OCI Object Storage (Native)')
	await expect(page.getByLabel('Namespace')).toBeVisible()
	await expect(page.getByLabel('Compartment OCID')).toBeVisible()
	await expect(page.getByLabel('Storage Account Name')).toHaveCount(0)
})

test('profile edit drawer keeps credentials collapsed by default', async ({ page }) => {
	await seedStorage(page)
	await setupApiMocks(page, [
		{
			id: 'existing-profile',
			name: 'Existing MinIO',
			provider: 's3_compatible',
			endpoint: 'http://127.0.0.1:9000',
			region: 'us-east-1',
			forcePathStyle: true,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
	])

	await page.goto('/profiles?advanced=1')
	await page.getByRole('button', { name: 'More actions for Existing MinIO' }).click()
	await page.getByRole('menuitem', { name: 'Edit' }).click()

	const drawer = page.getByRole('dialog', { name: 'Edit Profile' })
	await expect(drawer).toBeVisible()
	await expect(drawer.getByText('Credentials', { exact: true })).toBeVisible()
	await expect(drawer.getByLabel('Access Key ID')).toHaveCount(0)

	await drawer.getByText('Credentials', { exact: true }).click()
	await expect(drawer.getByLabel('Access Key ID')).toBeVisible()
	await expect(drawer.getByLabel('Secret')).toBeVisible()
})
