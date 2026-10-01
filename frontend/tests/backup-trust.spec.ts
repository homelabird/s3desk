import { expect, test } from '@playwright/test'

import { installSettingsMobileResponsiveFixtures, seedSettingsMobileResponsiveStorage } from './support/settingsLoginMobileResponsive'

for (const width of [1280, 390]) {
	test(`backup trust requires a fresh preview and reports partial imports at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 })
		await installSettingsMobileResponsiveFixtures(page)
		await seedSettingsMobileResponsiveStorage(page)
		await page.route('**/api/v1/server/restores', (route) => route.fulfill({ json: { items: [] } }))
		const requests: { preview: boolean; trusted: boolean }[] = []
		await page.route(/\/api\/v1\/server\/import-portable(?:\/preview)?$/, async (route) => {
			const preview = route.request().url().endsWith('/preview')
			const trusted = route.request().postData()?.includes('name="allowUnsigned"') ?? false
			requests.push({ preview, trusted })
			await route.fulfill({
				status: preview ? 200 : 201,
				json: {
					status: preview ? 'ready' : 'partial',
					mode: preview ? 'dry_run' : 'replace',
					recoveryDir: preview ? undefined : '/data/import-recovery/import-example',
					recoveryBundlePath: preview ? undefined : '/data/import-recovery/import-example/before.tar.gz',
					targetDbBackend: 'sqlite',
					preflight: { schemaReady: true, encryptionReady: true, spaceReady: true, blockers: [] },
					warnings: preview ? [] : ['Synthetic thumbnail replacement failure.'],
				},
			})
		})

		await page.goto('/settings')
		const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
		await settings.getByRole('tab', { name: 'Support' }).click()
		await settings.getByRole('button', { name: 'Server and backup' }).click()
		await settings.getByRole('button', { name: 'Backup', exact: true }).click()
		const drawer = page.getByRole('dialog', { name: 'Backup and restore', exact: true })
		await drawer.getByRole('button', { name: 'Stage restore', exact: true }).click()
		await expect(drawer.getByRole('checkbox', { name: /I trust this unsigned backup/ })).not.toBeChecked()
		await drawer.getByRole('button', { name: 'Import portable bundle', exact: true }).click()
		const trust = drawer.getByRole('checkbox', { name: /I trust this unsigned backup/ })
		await expect(trust).not.toBeChecked()
		const bundle = { name: 'synthetic.tar.gz', mimeType: 'application/gzip', buffer: Buffer.from('synthetic bundle') }
		await drawer.getByTestId('sidebar-portable-preview-input').setInputFiles(bundle)
		const runImport = drawer.getByRole('button', { name: /Run portable import$/ })
		await expect(runImport).toBeEnabled()
		await trust.focus()
		await page.keyboard.press('Space')
		await expect(trust).toBeChecked()
		await expect(runImport).toBeDisabled()
		await drawer.getByTestId('sidebar-portable-preview-input').setInputFiles(bundle)
		await expect(runImport).toBeEnabled()
		await runImport.click()
		const confirmation = page.getByRole('dialog', { name: 'Run portable import?', exact: true })
		await confirmation.getByPlaceholder('IMPORT', { exact: true }).fill('IMPORT')
		await confirmation.getByRole('button', { name: 'Run import', exact: true }).click()
		await expect(drawer.getByText('Import partially completed', { exact: true })).toBeVisible()
		await expect(runImport).toBeDisabled()
		await expect(drawer.getByText('Pre-import recovery saved', { exact: true })).toBeVisible()
		await expect(drawer.getByText('/data/import-recovery/import-example/before.tar.gz', { exact: true })).toBeVisible()
		const overflow = await drawer.evaluate((element) => element.scrollWidth - element.clientWidth) // e2e-geometry-allow verifies the recovery path does not overflow the mobile drawer
		expect(overflow).toBeLessThanOrEqual(1)
		expect(requests).toEqual([
			{ preview: true, trusted: false },
			{ preview: true, trusted: true },
			{ preview: false, trusted: true },
		])
	})
}
