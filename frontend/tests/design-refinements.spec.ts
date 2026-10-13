import { expect, test } from '@playwright/test'

import { installSettingsMobileResponsiveFixtures, seedSettingsMobileResponsiveStorage } from './support/settingsLoginMobileResponsive'

for (const width of [320, 768]) {
	for (const theme of ['light', 'dark']) {
		test(`backup choices and password labels remain clear at ${width}px in ${theme} mode`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width, height: 900 })
			await installSettingsMobileResponsiveFixtures(page)
			await seedSettingsMobileResponsiveStorage(page)
			await page.addInitScript((theme) => localStorage.setItem('themeMode', JSON.stringify(theme)), theme)
			await page.route('**/api/v1/server/restores', (route) => route.fulfill({ json: { items: [] } }))
			await page.goto('/settings')
			const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
			await settings.getByRole('tab', { name: 'Support' }).click()
			await settings.getByRole('button', { name: 'Server and backup' }).click()
			await settings.getByRole('button', { name: 'Backup', exact: true }).click()
			const drawer = page.getByRole('dialog', { name: 'Backup and restore', exact: true })
			await expect(drawer.getByText('Backup export', { exact: true })).toBeVisible()
			await drawer.getByRole('radio', { name: 'Protect with password', exact: true }).check()
			await drawer.screenshot({ path: testInfo.outputPath('backup-export-password.png') })
			const bounds = await drawer.getByRole('radio').evaluateAll((inputs) => inputs.map((input) => {
				const label = input.closest('label')!
				const rect = label.getBoundingClientRect() // e2e-geometry-allow verifies complete backup choice labels fit inside the drawer
				return { text: label.textContent, left: rect.left, right: rect.right }
			}))
			await testInfo.attach('backup-choice-bounds', { body: JSON.stringify(bounds), contentType: 'application/json' })
			const exportTask = drawer.getByRole('button', { name: 'Export backup', exact: true })
			await expect(exportTask).toHaveAttribute('aria-pressed', 'true')
			const password = drawer.getByLabel(/^Backup password/)
			const confirmation = drawer.getByLabel(/^Confirm backup password/)
			await expect(password).toHaveAttribute('aria-required', 'true')
			await expect(confirmation).toHaveAttribute('aria-required', 'true')
			const download = drawer.getByRole('button', { name: 'Download backup', exact: true })
			await expect(download).toBeDisabled()
			await password.fill('synthetic-password')
			await confirmation.fill('different-password')
			await expect(confirmation).toHaveAttribute('aria-invalid', 'true')
			await expect(drawer.getByText('Backup password confirmation does not match.', { exact: true })).toBeVisible()
			await expect(download).toBeDisabled()
			await drawer.screenshot({ path: testInfo.outputPath('backup-password-mismatch.png') })
			await confirmation.fill('synthetic-password')
			await expect(confirmation).not.toHaveAttribute('aria-invalid')
			await expect(drawer.getByText('Backup password confirmation does not match.', { exact: true })).toHaveCount(0)
			await expect(download).toBeEnabled()
			await expect(password).toHaveValue('synthetic-password')
			await expect(confirmation).toHaveValue('synthetic-password')
			await drawer.screenshot({ path: testInfo.outputPath('backup-export-labelled.png') })
			for (const task of ['Stage restore', 'Import portable bundle']) {
				const trigger = drawer.getByRole('button', { name: task, exact: true })
				await trigger.click()
				await expect(trigger).toHaveAttribute('aria-pressed', 'true')
				await expect(exportTask).toHaveAttribute('aria-pressed', 'false')
				const bundlePassword = drawer.getByLabel(task === 'Stage restore' ? 'Bundle password (optional)' : 'Portable bundle password (optional)', { exact: true })
				await bundlePassword.fill('synthetic-password')
				await expect(bundlePassword).toHaveValue('synthetic-password')
				await drawer.screenshot({ path: testInfo.outputPath(`backup-${task === 'Stage restore' ? 'restore' : 'portable'}-password.png`) })
			}
			const overflow = await drawer.evaluate((element) => element.scrollWidth - element.clientWidth) // e2e-geometry-allow verifies backup controls do not overflow narrow drawers
			expect(overflow).toBeLessThanOrEqual(1)
		})
	}
}
