import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'

async function seedStorage(page: Page, themeMode?: 'light' | 'dark') {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId: null,
		...(themeMode ? { themeMode } : {}),
	})
}

async function setupApiMocks(page: Page, profiles: Array<Record<string, unknown>> = [], enableTLS = false) {
	const meta = metaJson()
	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', enableTLS
			? { ...meta, capabilities: { ...meta.capabilities, profileTls: { enabled: true } } }
			: meta),
		jsonFixture('GET', '/api/v1/profiles', profiles),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

async function selectProvider(page: Page, optionLabel: string) {
	const combobox = page.getByRole('combobox', { name: 'Provider' })
	await combobox.selectOption({ label: optionLabel })
}

test('profile provider forms toggle provider-specific fields', async ({ page }) => {
	test.setTimeout(45_000)
	await seedStorage(page)
	await setupApiMocks(page)

	await page.goto('/profiles?create=1')
	await expect(page.getByRole('dialog', { name: 'Create Profile' })).toBeVisible({ timeout: 30_000 })

	await expect(page.getByRole('textbox', { name: 'Endpoint URL', exact: true })).toBeVisible()
	await expect(page.getByLabel('Access Key ID')).toBeVisible()
	await expect(page.getByLabel('Secret')).toBeVisible()
	await expect(page.getByLabel('S3 Compatible setup status')).toContainText('Add endpoint URL, region, and profile name.')

	await selectProvider(page, 'Azure Blob Storage')
	await expect(page.getByLabel('Storage Account Name')).toBeVisible()
	await expect(page.getByLabel('Account Key')).toBeVisible()
	await expect(page.getByLabel('Access Key ID')).toHaveCount(0)
	await expect(page.getByLabel('Azure Blob setup status')).toContainText('Add profile name, storage account name, and account key.')

	await selectProvider(page, 'Google Cloud Storage (GCS)')
	await expect(page.getByLabel('Service Account JSON')).toBeVisible()
	await expect(page.getByLabel('Google Cloud Storage setup status')).toContainText('Add service account JSON or choose Anonymous for public access.')
	await page.getByRole('switch', { name: 'Anonymous' }).click()
	await expect(page.getByLabel('Service Account JSON')).toHaveCount(0)
	await expect(page.getByText('Anonymous mode only works when the endpoint allows unauthenticated access.')).toBeVisible()
	await expect(page.getByLabel('Google Cloud Storage setup status')).not.toContainText('Add service account JSON')

	await selectProvider(page, 'Oracle OCI Object Storage (Native)')
	await expect(page.getByLabel('Namespace')).toBeVisible()
	await expect(page.getByLabel('Compartment OCID')).toBeVisible()
	await expect(page.getByLabel('Storage Account Name')).toHaveCount(0)
	await expect(page.getByLabel('OCI Object Storage setup status')).toContainText('Add profile name, region, namespace, and compartment OCID.')
})

test('profile edit drawer keeps saved-credential guidance visible', async ({ page }) => {
	await seedStorage(page)
	await setupApiMocks(page, [
		{
			id: 'existing-profile',
			name: 'Existing SeaweedFS',
			provider: 's3_compatible',
			endpoint: 'http://127.0.0.1:8333',
			region: 'us-east-1',
			forcePathStyle: true,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
	])

	await page.goto('/profiles?advanced=1')
	await page.getByRole('button', { name: 'Profile tools for Existing SeaweedFS' }).click()
	await page.getByRole('menuitem', { name: 'Edit' }).click()

	const drawer = page.getByRole('dialog', { name: 'Edit Profile' })
	await expect(drawer).toBeVisible()
	await expect(drawer.getByLabel('S3 Compatible setup status')).toContainText('Ready to save')
	await expect(drawer.getByText('Leave blank to keep stored credentials.')).toBeVisible()
	await expect(drawer.getByText('Credentials', { exact: true })).toBeVisible()
	await expect(drawer.getByLabel('Access Key ID')).toBeVisible()
	await expect(drawer.getByLabel('Secret')).toBeVisible()
})

for (const width of [320, 1440]) {
	const themeMode = width === 320 ? 'light' : 'dark'
	const colors = themeMode === 'light'
		? {
			error: 'rgb(185, 74, 67)', focus: 'rgb(47, 111, 174)', inputBackground: 'rgba(253, 254, 254, 0.98)',
			text: 'rgb(32, 37, 43)', disabledBackground: 'rgb(229, 232, 234)',
			mutedText: 'rgb(104, 115, 126)', inputBorder: 'rgb(170, 179, 187)',
		}
		: {
			error: 'rgb(220, 145, 141)', focus: 'rgb(139, 181, 218)', inputBackground: 'rgba(25, 31, 37, 0.98)',
			text: 'rgb(215, 220, 225)', disabledBackground: 'rgb(43, 50, 57)',
			mutedText: 'rgb(143, 154, 165)', inputBorder: 'rgba(208, 218, 230, 0.42)',
		}
	test(`reveals hidden browser endpoint errors at ${width}px (${themeMode})`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 })
		await seedStorage(page, themeMode)
		await setupApiMocks(page)
		let saves = 0
		await page.route('**/api/v1/profiles', (route) => {
			if (route.request().method() !== 'POST') return route.fallback()
			saves += 1
			return route.fulfill({ status: 500 })
		})
		await page.goto('/profiles?create=1')
		const dialog = page.getByRole('dialog', { name: 'Create Profile' })
		await dialog.getByLabel(/^Name/).fill('Browser endpoint validation')
		await dialog.getByLabel(/^Endpoint URL/).fill('https://s3.example.com')
		await dialog.getByLabel(/^Access Key ID/).fill('test-key')
		await dialog.getByLabel(/^Secret/).fill('test-secret')
		const summary = dialog.locator('summary').filter({ hasText: 'Browser endpoint' })
		const endpoint = dialog.getByLabel('Browser Endpoint (optional)', { exact: true })
		await summary.click()
		await endpoint.fill('not-a-url')
		await summary.click()
		await expect(endpoint).toBeHidden()
		await dialog.getByRole('button', { name: 'Create', exact: true }).click()
		await expect(endpoint).toBeVisible()
		await expect(endpoint).toBeFocused()
		await expect(endpoint).toBeInViewport({ ratio: 1 })
		await expect(endpoint).toHaveAttribute('aria-invalid', 'true')
		await expect(dialog.locator('#profile-public-endpoint-error')).toBeVisible()
		await dialog.getByRole('button', { name: 'Create', exact: true }).focus()
		await page.mouse.move(0, 0)
		await expect(endpoint).toHaveCSS('border-top-color', colors.error)
		await endpoint.hover()
		await expect(endpoint).toHaveCSS('border-top-color', colors.error)
		await endpoint.focus()
		await page.keyboard.press('Tab')
		await page.keyboard.press('Shift+Tab')
		await expect(endpoint).toBeFocused()
		await expect(endpoint).toHaveCSS('border-top-color', colors.error)
		await page.screenshot({ path: testInfo.outputPath(`profiles-browser-endpoint-error-${width}.png`), fullPage: true })

		await summary.click()
		await dialog.getByRole('button', { name: 'Create', exact: true }).click()
		await expect(endpoint).toBeVisible()
		await expect(endpoint).toBeFocused()
		await endpoint.fill('https://browser.example.com')
		await expect(endpoint).not.toHaveAttribute('aria-invalid')
		await expect(endpoint).toBeVisible()
		await expect(endpoint).toHaveCSS('border-top-color', colors.focus)
		expect(saves).toBe(0)
	})

	test(`reveals Azure ARM errors in both advanced panels at ${width}px (${themeMode})`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 })
		await seedStorage(page, themeMode)
		await setupApiMocks(page)
		await page.goto('/profiles?create=1')
		await selectProvider(page, 'Azure Blob Storage')
		const dialog = page.getByRole('dialog', { name: 'Create Profile' })
		await dialog.getByLabel(/^Name/).fill('Azure ARM validation')
		await dialog.getByLabel(/^Storage Account Name/).fill('testaccount')
		await dialog.getByLabel(/^Account Key/).fill('test-key')
		const summary = dialog.locator('summary').filter({ hasText: 'Azure connection overrides' })
		await summary.click()
		await dialog.getByLabel('Subscription ID', { exact: true }).fill('11111111-1111-4111-8111-111111111111')
		await summary.click()
		await dialog.getByRole('button', { name: 'Create', exact: true }).click()
		const resourceGroup = dialog.getByLabel('Resource Group', { exact: true })
		const clientSecret = dialog.getByLabel('Client Secret (optional)', { exact: true })
		await expect(resourceGroup).toBeFocused()
		await expect(resourceGroup).toBeInViewport({ ratio: 1 })
		await expect(resourceGroup).toHaveAttribute('aria-invalid', 'true')
		await expect(resourceGroup).toHaveCSS('border-top-color', colors.error)
		await expect(clientSecret).toBeVisible()
		await expect(clientSecret).toHaveAttribute('aria-invalid', 'true')
		const secretWrapper = dialog.locator('.ant-input-affix-wrapper').filter({ has: page.getByLabel('Client Secret (optional)', { exact: true }) })
		await expect(secretWrapper).toHaveCSS('border-top-color', colors.error)
		await expect(dialog.locator('#profile-azure-resource-group-error')).toBeVisible()
		await expect(dialog.locator('#profile-azure-client-secret-error')).toBeVisible()
		await page.screenshot({ path: testInfo.outputPath(`profiles-azure-arm-error-${width}.png`), fullPage: true })
		await secretWrapper.hover()
		await expect(secretWrapper).toHaveCSS('border-top-color', colors.error)
		await clientSecret.focus()
		await page.keyboard.press('Tab')
		await page.keyboard.press('Shift+Tab')
		await expect(clientSecret).toBeFocused()
		await expect(secretWrapper).toHaveCSS('border-top-color', colors.error)
	})

	for (const editMode of [false, true]) {
		test(`locks profile ${editMode ? 'edit' : 'create'} inputs while saving at ${width}px (${themeMode})`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width, height: 900 })
			await seedStorage(page, themeMode)
			const profile = {
				id: 'pending-profile', name: 'Existing Profile', provider: 's3_compatible',
				endpoint: 'https://s3.example.com', region: 'us-east-1', forcePathStyle: false,
				preserveLeadingSlash: false, tlsInsecureSkipVerify: false,
				createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
			}
			const profiles: Array<Record<string, unknown>> = editMode ? [profile] : []
			await setupApiMocks(page, profiles, true)
			await page.route('**/api/v1/profiles/pending-profile/tls', (route) => route.fulfill({ json: {
				mode: 'mtls', hasClientCert: true, hasClientKey: true, hasCa: false,
			} }))
			let releaseSave!: () => void
			const saveGate = new Promise<void>((resolve) => { releaseSave = resolve })
			const requests: Array<Record<string, unknown>> = []
			await page.route(editMode ? '**/api/v1/profiles/pending-profile' : '**/api/v1/profiles', async (route) => {
				if (route.request().method() !== (editMode ? 'PATCH' : 'POST')) return route.fallback()
				const submitted = route.request().postDataJSON() as Record<string, unknown>
				requests.push(submitted)
				await saveGate
				const saved = { ...profile, ...submitted }
				profiles.splice(0, profiles.length, saved)
				return route.fulfill({ json: saved })
			})
			try {
				await page.goto(editMode ? '/profiles?advanced=1' : '/profiles?create=1')
				if (editMode) {
					await page.getByRole('button', { name: 'Profile tools for Existing Profile' }).click()
					await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
				}
				const dialog = page.getByRole('dialog', { name: editMode ? 'Edit Profile' : 'Create Profile' })
				const name = dialog.getByLabel(/^Name/)
				const secret = dialog.getByLabel(/^Secret/)
				const secretWrapper = dialog.locator('.ant-input-affix-wrapper').filter({ has: page.getByLabel(/^Secret/) })
				await name.fill('Submitted Profile')
				if (!editMode) {
					await dialog.getByLabel(/^Endpoint URL/).fill('https://s3.example.com')
					await dialog.getByLabel(/^Access Key ID/).fill('test-key')
					await dialog.getByLabel(/^Secret/).fill('test-secret')
					await expect(dialog.getByRole('combobox', { name: 'Provider', exact: true })).toBeEnabled()
				}
				if (editMode) {
					await dialog.locator('summary').filter({ hasText: 'Session token' }).click()
					const sessionToken = dialog.getByLabel('Session Token', { exact: true })
					const sessionWrapper = dialog.locator('.ant-input-affix-wrapper').filter({ has: page.getByLabel('Session Token', { exact: true }) })
					const clearSessionToken = dialog.getByRole('checkbox', { name: 'Clear existing session token', exact: true })
					await expect(sessionToken).toBeEnabled()
					await clearSessionToken.check()
					await expect(sessionToken).toBeDisabled()
					await expect(sessionWrapper).toHaveCSS('background-color', colors.disabledBackground)
					await expect(sessionToken).toHaveCSS('color', colors.mutedText)
					await clearSessionToken.uncheck()
					await expect(sessionToken).toBeEnabled()
					await expect(sessionWrapper).toHaveCSS('background-color', colors.inputBackground)
					await expect(sessionToken).toHaveCSS('color', colors.text)
				}
				await dialog.locator('summary').filter({ hasText: 'TLS' }).click()
				const tlsControl = editMode
					? dialog.getByRole('combobox', { name: 'mTLS action', exact: true })
					: dialog.getByRole('switch', { name: 'Enable mTLS', exact: true })
				await expect(tlsControl).toBeEnabled()
				await expect(name).toHaveCSS('background-color', colors.inputBackground)
				await expect(name).toHaveCSS('color', colors.text)
				await expect(secretWrapper).toHaveCSS('background-color', colors.inputBackground)
				await dialog.getByRole('button', { name: editMode ? 'Save' : 'Create', exact: true }).click()
				await expect.poll(() => requests.length).toBe(1)
				await expect(name).toBeDisabled()
				await expect(dialog.getByLabel(/^Endpoint URL/)).toBeDisabled()
				await expect(dialog.getByLabel(/^Access Key ID/)).toBeDisabled()
				await expect(secret).toBeDisabled()
				await expect(dialog.getByLabel(/^Provider/)).toBeDisabled()
				await expect(tlsControl).toBeDisabled()
				await expect(dialog.getByRole('switch', { name: 'TLS Insecure Skip Verify', exact: true })).toBeDisabled()
				await expect(dialog.getByRole('button', { name: 'Close disabled while busy', exact: true })).toBeDisabled()
				await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
				await expect(name).toHaveValue('Submitted Profile')
				for (const input of [name, secret, secretWrapper]) {
					await expect(input).toHaveCSS('background-color', colors.disabledBackground)
					await expect(input).toHaveCSS('color', colors.mutedText)
					await expect(input).toHaveCSS('border-top-color', colors.inputBorder)
					await expect(input).toHaveCSS('box-shadow', 'none')
				}
				await name.hover()
				await expect(name).toHaveCSS('border-top-color', colors.inputBorder)
				await expect(name).toHaveCSS('box-shadow', 'none')
				await page.keyboard.press('Escape')
				await expect(dialog).toBeVisible()
				await page.screenshot({ path: testInfo.outputPath(`profiles-${editMode ? 'edit' : 'create'}-pending-${width}.png`), fullPage: true })
				releaseSave()
				await expect(dialog).toHaveCount(0)
				await expect(page.getByRole('button', { name: 'Profile tools for Submitted Profile' })).toBeVisible()
				expect(requests).toHaveLength(1)
				expect(requests[0].name).toBe('Submitted Profile')
				if (!editMode) expect(requests[0].provider).toBe('s3_compatible')
			} finally {
				releaseSave()
			}
		})
	}
}
