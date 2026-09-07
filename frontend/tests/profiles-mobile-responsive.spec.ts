import { expect, test, type Page } from '@playwright/test'

import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import { restoreProjectViewport } from './support/geometry'
import { readServerScopedLocalStorage } from './support/storage'
import { metaJson } from './support/apiFixtures'
import { gotoBucketsPage, gotoProfilesPage } from './support/ui'

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
	test('onboarding guide keeps next navigation hidden before setup is complete', async ({ page }) => {
		await installProfilesBucketsMobileResponsiveFixtures(page, { profiles: [], buckets: [] })
		await seedProfilesBucketsMobileResponsiveStorage(page, { profileId: '' })
		await gotoProfilesPage(page)

		const guide = page.getByRole('region', { name: 'Getting started' })
		await expect(guide.getByText('Create a storage profile')).toBeVisible()
		await expect(guide.getByText('Choose the active profile')).toBeVisible()
		await expect(guide.getByRole('button', { name: 'Create profile' })).toBeVisible()
		await expect(guide.getByText('Create a profile to open buckets and objects.')).toBeVisible()
		await expect(guide.getByRole('link', { name: 'Open objects' })).toHaveCount(0)
		await expect(guide.getByText('Connection checks')).toBeVisible()
	})

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

	test('preserves a selection made in another tab while deletion refresh is pending', async ({ page, context }) => {
		const profiles = ['Responsive Profile', 'Backup Profile', 'Chosen Profile'].map((name, index) => ({
			id: index === 0 ? 'profiles-buckets-mobile-profile' : `profile-${index}`,
			name, provider: 's3_compatible', endpoint: 'http://localhost:9000', region: 'us-east-1',
			forcePathStyle: true, preserveLeadingSlash: false, tlsInsecureSkipVerify: true,
			createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
		}))
		await installProfilesBucketsMobileResponsiveFixtures(page, { profiles })
		await seedProfilesBucketsMobileResponsiveStorage(page)
		let deleted = false
		let refreshStarted = false
		let releaseRefresh!: () => void
		const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve })
		await page.route('**/api/v1/profiles', async (route) => {
			if (route.request().method() !== 'GET') return route.fallback()
			if (deleted) {
				refreshStarted = true
				await refreshGate
			}
			return route.fulfill({ json: deleted ? profiles.slice(1) : profiles })
		})
		await page.route('**/api/v1/profiles/profiles-buckets-mobile-profile', async (route) => {
			if (route.request().method() !== 'DELETE') return route.fallback()
			deleted = true
			return route.fulfill({ status: 204 })
		})
		await gotoProfilesPage(page)
		const otherTab = await context.newPage()
		try {
			await installProfilesBucketsMobileResponsiveFixtures(otherTab, { profiles })
			await otherTab.addInitScript((token) => window.sessionStorage.setItem('apiToken', JSON.stringify(token)), 'profiles-buckets-mobile-token')
			await gotoProfilesPage(otherTab)
			await getProfileCard(page, 'Responsive Profile').getByRole('button', { name: 'Profile tools for Responsive Profile' }).click()
			await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
			const confirm = page.getByRole('dialog', { name: 'Delete profile "Responsive Profile"?' })
			await confirm.getByLabel('Type "Responsive Profile" to confirm').fill('Responsive Profile')
			await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
			await expect.poll(() => refreshStarted).toBe(true)
			await getProfileCard(otherTab, 'Chosen Profile').getByRole('button', { name: 'Use profile' }).click()
			const selectedProfile = page.getByRole('combobox', { name: 'Profile', exact: true })
			await expect(selectedProfile).toHaveValue('profile-2')
			releaseRefresh()
			await expect(confirm).toHaveCount(0)
			await expect(getProfileCard(page, 'Responsive Profile')).toHaveCount(0)
			await expect(selectedProfile).toHaveValue('profile-2')
			await expect(getProfileCard(otherTab, 'Chosen Profile').getByRole('button', { name: 'Selected' })).toBeVisible()
		} finally {
			releaseRefresh()
			await otherTab.close()
		}
	})

	test('opens the compact-card edit flow on mobile', async ({ page }) => {
		await setupProfilesPage(page)

		const secondaryCard = getProfileCard(page, 'Backup Profile')
		await secondaryCard.getByRole('button', { name: 'Profile tools for Backup Profile' }).click()
		await page.getByRole('menuitem', { name: 'Edit' }).click()

		const dialog = page.getByRole('dialog', { name: 'Edit Profile' })
		await expect(dialog).toBeVisible()
		await expect(dialog.getByLabel('Name')).toHaveValue('Backup Profile')
		await dialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(dialog).toHaveCount(0)
	})

	test('finishes profile refresh and mTLS changes after browser back during save', async ({ page }) => {
		let profile = {
			id: 'profiles-buckets-mobile-profile', name: 'Responsive Profile', provider: 's3_compatible',
			endpoint: 'http://localhost:9000', region: 'us-east-1', forcePathStyle: true,
			preserveLeadingSlash: false, tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
		}
		await installProfilesBucketsMobileResponsiveFixtures(page, { profiles: [profile] })
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await page.route('**/api/v1/meta', (route) => route.fulfill({ json: metaJson({
			capabilities: { profileTls: { enabled: true }, providers: {} },
		}) }))
		await page.route('**/api/v1/profiles', (route) => route.request().method() === 'GET'
			? route.fulfill({ json: [profile] }) : route.fallback())
		let started = false
		let releaseSave!: () => void
		const saveGate = new Promise<void>((resolve) => { releaseSave = resolve })
		await page.route('**/api/v1/profiles/profiles-buckets-mobile-profile', async (route) => {
			if (route.request().method() !== 'PATCH') return route.fallback()
			started = true
			await saveGate
			profile = { ...profile, ...route.request().postDataJSON() }
			return route.fulfill({ json: profile })
		})
		const tlsChanges: string[] = []
		await page.route('**/api/v1/profiles/profiles-buckets-mobile-profile/tls', (route) => {
			if (route.request().method() === 'GET') return route.fulfill({ json: {
				mode: 'mtls', hasClientCert: true, hasClientKey: true, hasCa: false,
			} })
			tlsChanges.push(route.request().method())
			return route.fulfill({ status: 204 })
		})
		try {
			await gotoBucketsPage(page)
			await page.getByRole('button', { name: 'Open navigation' }).click()
			await page.getByRole('link', { name: 'Profiles', exact: true }).click()
			await getProfileCard(page, 'Responsive Profile').getByRole('button', { name: 'Profile tools for Responsive Profile' }).click()
			await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
			const dialog = page.getByRole('dialog', { name: 'Edit Profile' })
			await dialog.getByLabel('Name').fill('Updated Profile')
			await dialog.locator('summary').filter({ hasText: 'TLS' }).click()
			await dialog.getByLabel('mTLS action').selectOption('disable')
			await dialog.getByRole('button', { name: 'Save', exact: true }).click()
			await expect.poll(() => started).toBe(true)
			await page.goBack()
			await expect(page.getByRole('heading', { name: 'Buckets', exact: true })).toBeVisible()
			await expect(dialog).toHaveCount(0)
			releaseSave()
			await expect.poll(() => tlsChanges).toEqual(['DELETE'])
			await expect(page.getByRole('combobox', { name: 'Profile', exact: true }).locator('option:checked')).toHaveText('Updated Profile')
			await page.goForward()
			await expect(getProfileCard(page, 'Updated Profile')).toBeVisible()
		} finally {
			releaseSave()
		}
	})

	test('opens and closes the import profile flow on mobile', async ({ page }) => {
		await setupProfilesPage(page)

		await page.getByRole('button', { name: 'Import profile' }).click()

		const dialog = page.getByRole('dialog', { name: 'Import Profile YAML' })
		await expect(dialog).toBeVisible()
		await dialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(dialog).toHaveCount(0)
	})

	for (const reopen of [false, true]) {
		test(`preserves a newer YAML draft when an earlier save completes (reopened: ${reopen})`, async ({ page }) => {
			let profile = {
				id: 'profiles-buckets-mobile-profile', name: 'Responsive Profile', provider: 's3_compatible',
				endpoint: 'http://localhost:9000', region: 'us-east-1', forcePathStyle: true,
				preserveLeadingSlash: false, tlsInsecureSkipVerify: false,
				createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
			}
			await installProfilesBucketsMobileResponsiveFixtures(page, { profiles: [profile] })
			await seedProfilesBucketsMobileResponsiveStorage(page)
			await page.route('**/api/v1/profiles', (route) => route.request().method() === 'GET'
				? route.fulfill({ json: [profile] }) : route.fallback())
			await page.route('**/api/v1/profiles/profiles-buckets-mobile-profile/export', (route) => route.fulfill({
				contentType: 'application/yaml', body: `name: ${profile.name}\nprovider: s3_compatible\nendpoint: http://localhost:9000\nregion: us-east-1\naccessKeyId: test-access\n`,
			}))
			let started = false
			let releaseSave!: () => void
			const saveGate = new Promise<void>((resolve) => { releaseSave = resolve })
			await page.route('**/api/v1/profiles/profiles-buckets-mobile-profile', async (route) => {
				if (route.request().method() !== 'PATCH') return route.fallback()
				started = true
				await saveGate
				profile = { ...profile, ...route.request().postDataJSON() }
				return route.fulfill({ json: profile })
			})
			try {
				await gotoProfilesPage(page)
				await getProfileCard(page, 'Responsive Profile').getByRole('button', { name: 'Profile tools for Responsive Profile' }).click()
				await page.getByRole('menuitem', { name: /Diagnostics & export/ }).click()
				await page.getByRole('menuitem', { name: 'Export/Edit YAML', exact: true }).click()
				const dialog = page.getByRole('dialog', { name: 'Profile YAML', exact: true })
				const editor = dialog.getByRole('textbox', { name: 'Profile YAML contents' })
				await expect(editor).toHaveValue(/name: Responsive Profile/)
				await editor.fill((await editor.inputValue()).replace('Responsive Profile', 'Saved Profile'))
				await dialog.getByRole('button', { name: /Save$/ }).click()
				await expect.poll(() => started).toBe(true)
				if (reopen) {
					await dialog.getByRole('button', { name: 'Close', exact: true }).last().click()
					await expect(dialog).toHaveCount(0)
					await getProfileCard(page, 'Responsive Profile').getByRole('button', { name: 'Profile tools for Responsive Profile' }).click()
					await page.getByRole('menuitem', { name: /Diagnostics & export/ }).click()
					await page.getByRole('menuitem', { name: 'Export/Edit YAML', exact: true }).click()
					await expect(editor).toHaveValue(/name: Responsive Profile/)
				}
				const draft = (await editor.inputValue()).replace(/^name:.*$/m, 'name: New unsaved draft')
				await editor.fill(draft)
				await expect(dialog.getByRole('button', { name: /Save$/ })).toHaveClass(/ant-btn-loading/)
				releaseSave()
				await expect(dialog.getByRole('button', { name: /Save$/ })).not.toHaveClass(/ant-btn-loading/)
				await expect(editor).toHaveValue(draft)
				await dialog.getByRole('button', { name: 'Close', exact: true }).last().click()
				await expect(getProfileCard(page, 'Saved Profile')).toBeVisible()
			} finally {
				releaseSave()
			}
		})
	}

	test('refreshes a finished import while preserving the next import draft', async ({ page }) => {
		const profile = {
			id: 'profiles-buckets-mobile-profile', name: 'Responsive Profile', provider: 'gcp_gcs',
			anonymous: true, projectNumber: '123456789012', preserveLeadingSlash: false, tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
		}
		const profiles = [profile]
		await installProfilesBucketsMobileResponsiveFixtures(page, { profiles })
		await seedProfilesBucketsMobileResponsiveStorage(page)
		let started = false
		let releaseImport!: () => void
		const importGate = new Promise<void>((resolve) => { releaseImport = resolve })
		await page.route('**/api/v1/profiles', async (route) => {
			if (route.request().method() === 'GET') return route.fulfill({ json: profiles })
			if (route.request().method() !== 'POST') return route.fallback()
			started = true
			await importGate
			const created = { ...profile, ...route.request().postDataJSON(), id: 'imported-profile' }
			profiles.push(created)
			return route.fulfill({ status: 201, json: created })
		})
		try {
			await gotoProfilesPage(page)
			await page.getByRole('button', { name: 'Import profile' }).click()
			const dialog = page.getByRole('dialog', { name: 'Import Profile YAML' })
			const editor = dialog.getByRole('textbox', { name: 'Paste YAML' })
			await editor.fill('name: Imported Profile\nprovider: gcp_gcs\nanonymous: true\nprojectNumber: "123456789012"\n')
			await dialog.getByRole('button', { name: 'Import', exact: true }).click()
			await expect.poll(() => started).toBe(true)
			await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
			await page.getByRole('button', { name: 'Import profile' }).click()
			await editor.fill('name: Next import draft\n')
			releaseImport()
			await expect(getProfileCard(page, 'Imported Profile')).toHaveCount(1)
			await expect(dialog).toBeVisible()
			await expect(editor).toHaveValue('name: Next import draft\n')
			await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
			await expect(getProfileCard(page, 'Imported Profile')).toBeVisible()
		} finally {
			releaseImport()
		}
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

	test('keeps the selected profile and outer-scroll ownership across responsive transitions', async ({ page }, testInfo) => {
		const profiles = Array.from({ length: 80 }, (_, index) => ({
			id: index === 0 ? 'profiles-buckets-mobile-profile' : `responsive-profile-${index}`,
			name: index === 0 ? 'Responsive Profile' : `Responsive Profile ${index}`,
			provider: 's3_compatible',
			endpoint: 'http://localhost:9000',
			region: 'us-east-1',
			forcePathStyle: true,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: true,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		}))
		await page.setViewportSize({ width: 1280, height: 800 })
		await setupProfilesPage(page, { profiles })

		await expect(page.getByTestId('profiles-table-desktop')).toBeVisible()
		await expect(page.getByTestId('profiles-list-compact')).toHaveCount(0)
		const appScroller = page.locator('main[data-scroll-container="app-content"]')
		await appScroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
		await expect(page.getByTestId('profiles-table-desktop').getByText('Responsive Profile 79')).toBeVisible()
		await appScroller.evaluate((element) => element.scrollTo({ top: 0 }))

		await restoreProjectViewport(page, testInfo)
		await expect(page.getByTestId('profiles-list-compact')).toBeVisible()
		await expect(page.getByTestId('profiles-table-desktop')).toHaveCount(0)
		await expect(getProfileCard(page, 'Responsive Profile').getByRole('button', { name: 'Selected' })).toBeVisible()

		await appScroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
		await expect(getProfileCard(page, 'Responsive Profile 79')).toBeVisible()
	})
})
