import { expect, test, type Page } from '@playwright/test'

import { dialogByName, gotoProfilesPage } from './support/ui'
import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'

async function seedStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken: '',
		profileId: null,
	})
}

async function setupApiMocks(page: Page, validTokens: string[]) {
	await installApiFixtures(page, [
		{
			method: 'GET',
			path: '/api/v1/meta',
			handler: ({ request }) => {
				const token = request.headers()['x-api-token'] ?? ''
				if (!validTokens.includes(token)) {
					return { status: 401, json: { error: { code: 'unauthorized', message: 'invalid token' } } }
				}
				return { json: metaJson() }
			},
		},
		jsonFixture('GET', '/api/v1/profiles', []),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

test('@check-smoke login gate opens settings after successful auth', async ({ page }) => {
	const validToken = 'valid-token'

	await seedStorage(page)
	await setupApiMocks(page, [validToken])

	await gotoProfilesPage(page, {
		ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }),
	})

	await page.getByPlaceholder('API_TOKEN').fill(validToken)
	await page.getByRole('button', { name: 'Login' }).click()
	await expect(page.getByText('No profiles yet')).toBeVisible({ timeout: 10_000 })

	await page.getByRole('button', { name: 'App menu' }).click()
	await page.getByRole('menuitem', { name: /Settings/ }).click()
	const drawer = dialogByName(page, 'Settings')
	await expect(drawer).toBeVisible()
	const tokenInput = drawer.getByPlaceholder('Must match API_TOKEN')
	await expect(tokenInput).toHaveValue(validToken)
	await drawer.getByRole('button', { name: 'Close' }).click()
	await expect(drawer).toHaveCount(0)
	await expect(page.getByText('No profiles yet')).toBeVisible()
})
