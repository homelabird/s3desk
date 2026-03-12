import path from 'path'
import { fileURLToPath } from 'url'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { dialogByName, ensureDialogOpen, transferDownloadRow, transferUploadRow } from './support/ui'

const isLive = process.env.E2E_LIVE === '1'

const apiToken = process.env.E2E_API_TOKEN ?? 'change-me'
const s3Endpoint = process.env.E2E_S3_ENDPOINT ?? 'http://minio:9000'
const s3Region = process.env.E2E_S3_REGION ?? 'us-east-1'
const s3AccessKey = process.env.E2E_S3_ACCESS_KEY ?? 'minioadmin'
const s3SecretKey = process.env.E2E_S3_SECRET_KEY ?? 'minioadmin'
const forcePathStyle = process.env.E2E_S3_FORCE_PATH_STYLE !== 'false'
const tlsSkipVerify = process.env.E2E_S3_TLS_SKIP_VERIFY !== 'false'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const uploadFixture = path.join(testDir, 'fixtures', 'upload-folder', 'dir-a', 'alpha.txt')
const uploadFilename = 'alpha.txt'

const browserArgs = isLive
	? [
			'--host-resolver-rules=MAP minio 127.0.0.1',
			'--disable-web-security',
			'--disable-features=IsolateOrigins,site-per-process',
		]
	: []

test.use({
	acceptDownloads: true,
	launchOptions: { args: browserArgs },
})

async function seedStorage(page: Page) {
	await page.addInitScript((seed) => {
		const setIfMissing = (key: string, value: unknown) => {
			if (window.localStorage.getItem(key) !== null) return
			window.localStorage.setItem(key, JSON.stringify(value))
		}
		setIfMissing('apiToken', seed.apiToken)
		setIfMissing('profileId', null)
		setIfMissing('bucket', '')
		setIfMissing('prefix', '')
		setIfMissing('objectsUIMode', 'simple')
		setIfMissing('downloadLinkProxyEnabled', true)
	}, { apiToken })
}

async function setSwitch(scope: Page | Locator, label: string, enabled: boolean) {
	const control = scope.getByRole('switch', { name: label })
	const state = await control.getAttribute('aria-checked')
	if ((state === 'true') !== enabled) {
		await control.click()
	}
}

function uniqueId() {
	const now = Date.now().toString(36)
	const rand = Math.random().toString(36).slice(2, 8)
	return `${now}-${rand}`
}

test.describe('Live UI flow', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('profiles -> buckets -> uploads -> objects -> downloads -> deletes', async ({ page, request }) => {
		test.setTimeout(240_000)

		const runId = uniqueId()
		const profileName = `e2e-ui-${runId}`
		const bucketName = `e2e-ui-${runId}`
		let profileId: string | null = null

		try {
			await seedStorage(page)
			await page.goto('/profiles')
			const profileModal = await ensureDialogOpen(page, 'Create Profile', async () => {
				const createButton = page.getByRole('button', { name: 'New Profile' })
				if (await createButton.isVisible().catch(() => false)) {
					await createButton.click()
					return
				}
				await page.getByRole('button', { name: 'Create profile' }).click()
			})
			await profileModal.getByLabel('Name').fill(profileName)
			await profileModal.getByRole('textbox', { name: 'Endpoint URL', exact: true }).fill(s3Endpoint)
			await profileModal.getByLabel('Region').fill(s3Region)
			await profileModal.getByLabel('Access Key ID').fill(s3AccessKey)
			await profileModal.getByLabel('Secret').fill(s3SecretKey)
			const forcePathSwitch = profileModal.getByRole('switch', { name: 'Force Path Style' })
			if (!(await forcePathSwitch.isVisible().catch(() => false))) {
				await profileModal.getByRole('button', { name: /Advanced Options/ }).click()
			}
			await setSwitch(profileModal, 'Force Path Style', forcePathStyle)
			await setSwitch(profileModal, 'TLS Insecure Skip Verify', tlsSkipVerify)
			await profileModal.getByRole('button', { name: 'Create', exact: true }).click()

			const createdProfileRow = page.getByRole('row', { name: new RegExp(profileName) })
			await expect(createdProfileRow).toBeVisible({ timeout: 30_000 })
			const useButton = createdProfileRow.getByRole('button', { name: 'Use' })
			if (await useButton.isVisible().catch(() => false)) {
				await useButton.click()
			}
			await page.waitForFunction(() => {
				const value = window.localStorage.getItem('profileId')
				return value && JSON.parse(value)
			})
			profileId = await page.evaluate(() => JSON.parse(window.localStorage.getItem('profileId') ?? 'null'))

			await page.goto('/buckets')
			await page.getByRole('button', { name: 'New Bucket' }).click()
			await page.getByLabel('Bucket name').fill(bucketName)
			const bucketModal = dialogByName(page, 'Create Bucket')
			await bucketModal.getByRole('button', { name: 'Create', exact: true }).click()
			await expect(page.getByRole('row', { name: new RegExp(bucketName) })).toBeVisible({ timeout: 30_000 })

			await page.goto('/uploads')
			const uploadsBucketSelect = page.getByRole('combobox', { name: 'Bucket' })
			await uploadsBucketSelect.click()
			await uploadsBucketSelect.fill(bucketName)
			await page.keyboard.press('Enter')

			await page.getByRole('button', { name: 'Add from device…' }).click()
			const sourceDialog = dialogByName(page, 'Add upload source')
			await expect(sourceDialog).toBeVisible({ timeout: 10_000 })
			const chooserPromise = page.waitForEvent('filechooser')
			await sourceDialog.getByRole('button', { name: 'Choose files' }).click()
			const chooser = await chooserPromise
			await chooser.setFiles(uploadFixture)
			await page.getByRole('button', { name: /Queue upload/i }).click()

			const uploadRow = transferUploadRow(page, `Upload: ${uploadFilename}`)
			await expect(uploadRow).toBeVisible({ timeout: 30_000 })
			await expect(uploadRow.getByText('Done', { exact: true })).toBeVisible({ timeout: 180_000 })

			await page.goto('/objects')
			await page.getByTestId('objects-bucket-picker-desktop').click()
			await page.getByTestId(`objects-bucket-picker-option-${bucketName}`).click()

			const objectRow = page.locator('[data-objects-row="true"]', { hasText: uploadFilename }).first()
			await expect(objectRow).toBeVisible({ timeout: 60_000 })

			await objectRow.getByRole('button', { name: 'Object actions' }).click()
			await page.getByRole('menuitem', { name: 'Download (client)' }).click()
			await page.getByRole('button', { name: /Transfers/ }).first().click()
			const transfersDialog = dialogByName(page, /Transfers/i)
			await expect(transfersDialog).toBeVisible({ timeout: 30_000 })
			const downloadRow = transferDownloadRow(transfersDialog, uploadFilename)
			await expect(downloadRow).toBeVisible({ timeout: 30_000 })
			await expect(downloadRow.getByText('Done', { exact: true })).toBeVisible({ timeout: 120_000 })
			await transfersDialog.getByRole('button', { name: 'Close' }).click()
			await expect(transfersDialog).toBeHidden({ timeout: 10_000 })

			await expect(page.getByText('1 selected')).toBeVisible({ timeout: 10_000 })
			await page.getByRole('button', { name: /Delete/ }).last().click()
			const objectConfirm = dialogByName(page, 'Delete object?')
			await objectConfirm.getByPlaceholder('DELETE').fill('DELETE')
			await objectConfirm.getByRole('button', { name: 'Delete' }).click()
			await expect(page.locator('[data-objects-row="true"]', { hasText: uploadFilename })).toHaveCount(0, { timeout: 60_000 })

			await page.goto('/buckets')
			const bucketRow = page.getByRole('row', { name: new RegExp(bucketName) })
			await bucketRow.getByRole('button', { name: 'Delete' }).click()
			const bucketConfirm = dialogByName(page, new RegExp(bucketName))
			await bucketConfirm.getByPlaceholder(bucketName).fill(bucketName)
			await bucketConfirm.getByRole('button', { name: 'Delete' }).click()
			await expect(bucketRow).toHaveCount(0, { timeout: 60_000 })

		} finally {
			if (profileId) {
				const profileHeaders = {
					'X-Api-Token': apiToken,
					'X-Profile-Id': profileId,
				}

				try {
					const listObjects = await request.get(`/api/v1/buckets/${bucketName}/objects`, { headers: profileHeaders })
					if (listObjects.ok()) {
						const payload = (await listObjects.json()) as { items?: { key: string }[] }
						const keys = payload.items?.map((item) => item.key) ?? []
						if (keys.length) {
							await request.delete(`/api/v1/buckets/${bucketName}/objects`, {
								headers: profileHeaders,
								data: { keys },
							})
						}
					}
				} catch {
					// best-effort cleanup
				}

				try {
					await request.delete(`/api/v1/buckets/${bucketName}`, { headers: profileHeaders })
				} catch {
					// best-effort cleanup
				}

				try {
					await request.delete(`/api/v1/profiles/${profileId}`, { headers: { 'X-Api-Token': apiToken } })
				} catch {
					// best-effort cleanup
				}
			}
		}
	})
})
