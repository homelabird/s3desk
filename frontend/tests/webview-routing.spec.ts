import { expect, test, type Locator } from '@playwright/test'

import { buildProfileFixture, seedLocalStorage } from './support/apiFixtures'
import { defaultWebviewStorage, escapeRegExp, seedWebviewStorage, stubWebviewApi } from './support/webviewFixtures'

test.describe('webview routing', () => {
	test('WV-001 redirects `/` to `/setup` when no stored profile exists', async ({ page }) => {
		await stubWebviewApi(page, {
			profiles: [buildProfileFixture({ id: 'available-profile', name: 'Available Profile' })],
		})
		await seedLocalStorage(page, { apiToken: defaultWebviewStorage.apiToken })

		await page.goto('/')

		await expect(page).toHaveURL(/\/setup$/)
		await expect(page.getByText('Choose a profile')).toBeVisible()
		await expect(page.getByText('No profile selected')).toBeVisible()
	})

	test('WV-001 redirects `/` to `/objects` when a stored profile exists', async ({ page }) => {
		await stubWebviewApi(page)
		await seedWebviewStorage(page)

		await page.goto('/')

		await expect(page).toHaveURL(/\/objects$/)
		await expect(page.getByTestId('topbar-profile-select').getByLabel('Profile')).toHaveValue(defaultWebviewStorage.profileId)
		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
	})

	test('WV-003 keeps the active profile and route context across refresh on main routes', async ({ page }) => {
		await stubWebviewApi(page)
		await seedWebviewStorage(page)

		const profileSelect = page.getByTestId('topbar-profile-select').getByLabel('Profile')
		const objectsLocation = page.getByText(`s3://${defaultWebviewStorage.bucket}/${defaultWebviewStorage.prefix}`, { exact: true })
		const uploadsBucket = page.getByRole('combobox', { name: 'Bucket' })
		const navigateTo = async (label: 'Buckets' | 'Objects' | 'Uploads' | 'Jobs') => {
			await page.getByRole('link', { name: label }).first().click()
		}

		const expectRouteState = async (
			path: string,
			navigate: () => Promise<void>,
			ready: Locator,
			extraAssertion?: () => Promise<void>,
		) => {
			await navigate()

			await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`))
			await expect(ready).toBeVisible()
			await expect(profileSelect).toHaveValue(defaultWebviewStorage.profileId)
			if (extraAssertion) await extraAssertion()

			await page.reload()

			await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`))
			await expect(ready).toBeVisible()
			await expect(profileSelect).toHaveValue(defaultWebviewStorage.profileId)
			if (extraAssertion) await extraAssertion()
		}

		await page.goto('/objects')

		await expectRouteState('/objects', () => navigateTo('Objects'), page.getByPlaceholder('Search current folder'), async () => {
			await expect(objectsLocation).toBeVisible()
		})

		await expectRouteState('/buckets', () => navigateTo('Buckets'), page.getByRole('button', { name: 'New Bucket' }))

		await expectRouteState('/uploads', () => navigateTo('Uploads'), page.getByRole('heading', { name: 'Uploads' }), async () => {
			await expect(uploadsBucket).toHaveValue(defaultWebviewStorage.bucket)
		})

		await expectRouteState('/jobs', () => navigateTo('Jobs'), page.getByRole('heading', { name: 'Jobs' }))

		await navigateTo('Objects')
		await expect(page).toHaveURL(/\/objects$/)
		await expect(profileSelect).toHaveValue(defaultWebviewStorage.profileId)
		await expect(objectsLocation).toBeVisible()
	})
})
