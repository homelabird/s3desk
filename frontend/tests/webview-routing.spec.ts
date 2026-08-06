import { expect, test, type Locator } from '@playwright/test'

import { buildProfileFixture, seedLocalStorage } from './support/apiFixtures'
import { gotoWithDynamicImportRecovery } from './support/ui'
import { defaultWebviewStorage, escapeRegExp, seedWebviewStorage, stubWebviewApi } from './support/webviewFixtures'

const webviewObjectsReadyTimeoutMs = 90_000
const webviewRouteStateTestTimeoutMs = 180_000

test.describe('webview routing', () => {
	test('WV-001 redirects `/` to `/profiles` when no stored profile exists', async ({ page }) => {
		const fallbackProfile = 'available-profile'
		await stubWebviewApi(page, {
			profiles: [buildProfileFixture({ id: fallbackProfile, name: 'Available Profile' })],
		})
		await seedLocalStorage(page, { apiToken: defaultWebviewStorage.apiToken })

		await page.goto('/')

		await expect(page).toHaveURL(/\/profiles$/)
		await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'New Profile' })).toBeVisible()
		await expect(page.getByTestId('profiles-table-desktop').getByText('Available Profile', { exact: true })).toBeVisible()
	})

	test('WV-001 redirects `/` to `/objects` when a stored profile exists', async ({ page }) => {
		test.setTimeout(webviewRouteStateTestTimeoutMs)
		await stubWebviewApi(page)
		await seedWebviewStorage(page)

		await page.goto('/')

		await expect(page).toHaveURL(/\/objects$/)
		await expect(page.getByTestId('topbar-profile-select').getByLabel('Profile')).toHaveValue(defaultWebviewStorage.profileId)
		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'), {
			timeout: webviewObjectsReadyTimeoutMs,
			maxAttempts: 3,
		})
	})

	test('WV-003 keeps the active profile and route context across refresh on main routes', async ({ page }) => {
		test.setTimeout(webviewRouteStateTestTimeoutMs)
		await stubWebviewApi(page)
		await seedWebviewStorage(page)

		const profileSelect = page.getByTestId('topbar-profile-select').getByLabel('Profile')
		const objectsLocation = page.getByText(`s3://${defaultWebviewStorage.bucket}/${defaultWebviewStorage.prefix}`, { exact: true })
		const navigateTo = async (label: 'Buckets' | 'Objects' | 'Activity') => {
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
			if (path === '/objects') {
				await gotoWithDynamicImportRecovery(page, '/objects', () => ready, {
					timeout: webviewObjectsReadyTimeoutMs,
					maxAttempts: 3,
				})
			} else {
				await expect(ready).toBeVisible()
			}
			await expect(profileSelect).toHaveValue(defaultWebviewStorage.profileId)
			if (extraAssertion) await extraAssertion()

			await page.reload()

			await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`))
			if (path === '/objects') {
				await gotoWithDynamicImportRecovery(page, '/objects', () => ready, {
					timeout: webviewObjectsReadyTimeoutMs,
					maxAttempts: 3,
				})
			} else {
				await expect(ready).toBeVisible()
			}
			await expect(profileSelect).toHaveValue(defaultWebviewStorage.profileId)
			if (extraAssertion) await extraAssertion()
		}

		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'), {
			timeout: webviewObjectsReadyTimeoutMs,
			maxAttempts: 3,
		})

		await expectRouteState('/objects', () => navigateTo('Objects'), page.getByPlaceholder('Search current folder'), async () => {
			await expect(objectsLocation).toBeVisible({ timeout: 15_000 })
		})

		await expectRouteState('/buckets', () => navigateTo('Buckets'), page.getByRole('button', { name: 'New Bucket' }))

		await expectRouteState('/jobs', () => navigateTo('Activity'), page.getByRole('heading', { name: 'Activity' }))

		await navigateTo('Objects')
		await expect(page).toHaveURL(/\/objects$/)
		await expect(profileSelect).toHaveValue(defaultWebviewStorage.profileId)
		await expect(objectsLocation).toBeVisible({ timeout: 15_000 })
	})
})
