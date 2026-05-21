import { expect, test, type Page } from '@playwright/test'

import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import { readServerScopedLocalStorage } from './support/storage'
import { gotoProfilesPage } from './support/ui'

async function setupProfilesPage(
	page: Page,
	options?: Parameters<typeof installProfilesBucketsMobileResponsiveFixtures>[1],
) {
	await installProfilesBucketsMobileResponsiveFixtures(page, options)
	await seedProfilesBucketsMobileResponsiveStorage(page)
	await gotoProfilesPage(page)
}

function getProfileCard(page: Page, name: string) {
	return page.getByTestId('profiles-list-compact').locator('article').filter({ hasText: name }).first()
}

test.describe('@mobile-responsive Profiles mobile workflows', () => {
	test('switches the active profile from compact mobile cards', async ({ page }) => {
		await setupProfilesPage(page)

		const primaryCard = getProfileCard(page, 'Responsive Profile')
		const secondaryCard = getProfileCard(page, 'Backup Profile')

		await expect(primaryCard).toContainText('profiles-buckets-mobile-profile')
		await expect(secondaryCard).toContainText('profiles-buckets-mobile-secondary')
		await expect(primaryCard.getByRole('button', { name: 'Selected' })).toBeVisible()
		await expect(secondaryCard.getByRole('button', { name: 'Use profile' })).toBeVisible()

		await secondaryCard.getByRole('button', { name: 'Use profile' }).click()

		await expect(secondaryCard.getByRole('button', { name: 'Selected' })).toBeVisible()
		await expect(primaryCard.getByRole('button', { name: 'Use profile' })).toBeVisible()
		await expect
			.poll(() =>
				readServerScopedLocalStorage(page, {
					apiToken: 'profiles-buckets-mobile-token',
					name: 'profileId',
					namespace: 'app',
				}, null),
			)
			.toBe('profiles-buckets-mobile-secondary')

		await page.reload({ waitUntil: 'load' })

		await expect(
			getProfileCard(page, 'Backup Profile').getByRole('button', { name: 'Selected' }),
		).toBeVisible()
		await expect(
			getProfileCard(page, 'Responsive Profile').getByRole('button', { name: 'Use profile' }),
		).toBeVisible()
	})

	test('opens the compact-card edit flow on mobile', async ({ page }) => {
		await setupProfilesPage(page)

		const secondaryCard = getProfileCard(page, 'Backup Profile')
		await secondaryCard.getByRole('button', { name: 'More actions for Backup Profile' }).click()
		await page.getByRole('menuitem', { name: 'Edit' }).click()

		const dialog = page.getByRole('dialog', { name: 'Edit Profile' })
		await expect(dialog).toBeVisible()
		await expect(dialog.getByLabel('Name')).toHaveValue('Backup Profile')
		await dialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(dialog).toHaveCount(0)
	})

	test('opens and closes the import profile flow on mobile', async ({ page }) => {
		await setupProfilesPage(page)

		await page.getByRole('button', { name: 'Import profile' }).click()

		const dialog = page.getByRole('dialog', { name: 'Import Profile YAML' })
		await expect(dialog).toBeVisible()
		await dialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(dialog).toHaveCount(0)
	})

	test('keeps validation warning labels readable after switching cards', async ({ page }) => {
		await setupProfilesPage(page, {
			profiles: [
				{
					id: 'profiles-buckets-mobile-profile',
					name: 'Responsive Profile',
					provider: 's3_compatible',
					endpoint: 'http://localhost:9000',
					region: 'us-east-1',
					forcePathStyle: true,
					preserveLeadingSlash: false,
					tlsInsecureSkipVerify: true,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
				{
					id: 'profiles-buckets-mobile-secondary',
					name: 'Backup Profile',
					provider: 's3_compatible',
					endpoint: '',
					region: 'us-east-1',
					forcePathStyle: true,
					preserveLeadingSlash: false,
					tlsInsecureSkipVerify: true,
					validation: {
						valid: false,
						issues: [{ field: 'endpoint', message: 'Endpoint URL is required' }],
					},
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
			],
		})

		const warningCard = getProfileCard(page, 'Backup Profile')
		await expect(warningCard.getByText('Needs update')).toHaveAttribute('title', 'Endpoint URL is required')
		await expect(warningCard.getByText('needs-update')).toBeVisible()

		await warningCard.getByRole('button', { name: 'Use profile' }).click()

		await expect(warningCard.getByRole('button', { name: 'Selected' })).toBeVisible()
		await expect(warningCard.getByText('Needs update')).toHaveAttribute('title', 'Endpoint URL is required')
	})
})
