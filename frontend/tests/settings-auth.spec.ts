import { expect, test, type Page } from '@playwright/test'

import { dialogByName } from './support/ui'
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

async function setSwitch(scope: Page, enabled: boolean) {
	const control = scope.getByRole('switch').first()
	const state = await control.getAttribute('aria-checked')
	if ((state === 'true') !== enabled) {
		await control.click()
	}
}

test('@check-smoke login gate opens settings after successful auth', async ({ page }) => {
	const validToken = 'valid-token'

	await seedStorage(page)
	await setupApiMocks(page, [validToken])

	await page.goto('/profiles')
	await expect(page.getByRole('heading', { name: 'S3Desk' })).toBeVisible()

	await page.getByPlaceholder('API_TOKEN').fill(validToken)
	await page.getByRole('button', { name: 'Login' }).click()
	await expect(page.getByText('No profiles yet')).toBeVisible({ timeout: 10_000 })

	await page.getByRole('button', { name: /Settings/ }).click()
	const drawer = dialogByName(page, 'Settings')
	await expect(drawer).toBeVisible()
	await expect(drawer.getByPlaceholder('Must match API_TOKEN')).toBeVisible()
})

test('settings persist local state', async ({ page }) => {
	const validToken = 'valid-token'
	const updatedToken = 'updated-token'

	await seedStorage(page)
	await setupApiMocks(page, [validToken, updatedToken])

	await page.goto('/profiles')
	await expect(page.getByRole('heading', { name: 'S3Desk' })).toBeVisible()

	await page.getByPlaceholder('API_TOKEN').fill(validToken)
	await page.getByRole('button', { name: 'Login' }).click()
	await expect(page.getByText('No profiles yet')).toBeVisible({ timeout: 10_000 })

	await page.getByRole('button', { name: /Settings/ }).click()
	const drawer = dialogByName(page, 'Settings')
	await expect(drawer).toBeVisible()

	const tokenInput = drawer.getByPlaceholder('Must match API_TOKEN')
	await expect(tokenInput).toBeVisible()
	await tokenInput.fill(updatedToken)
	await drawer.getByRole('button', { name: 'Apply' }).click()
	await expect
		.poll(async () => page.evaluate(() => JSON.parse(window.sessionStorage.getItem('apiToken') ?? '""')))
		.toBe(updatedToken)

	await page.getByRole('button', { name: /Settings/ }).click()
	await expect(drawer).toBeVisible()
	await drawer.getByRole('tab', { name: 'Transfers' }).click()
	await setSwitch(drawer, true)
	const downloadProxy = await page.evaluate(() => JSON.parse(window.localStorage.getItem('downloadLinkProxyEnabled') ?? 'false'))
	expect(downloadProxy).toBe(true)
})
