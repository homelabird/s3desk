import path from 'path'
import { fileURLToPath } from 'url'

import { expect, test, type Page } from '@playwright/test'

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

test.use({ acceptDownloads: true })

async function seedStorage(page: Page) {
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(null))
		window.localStorage.setItem('bucket', JSON.stringify(''))
		window.localStorage.setItem('prefix', JSON.stringify(''))
		window.localStorage.setItem('objectsUIMode', JSON.stringify('simple'))
		window.localStorage.setItem('downloadLinkProxyEnabled', JSON.stringify(true))
	}, { apiToken })
}

async function setSwitch(page: Page, label: string, enabled: boolean) {
	const control = page.getByRole('switch', { name: label })
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

			await page.getByRole('button', { name: 'New Profile' }).click()
			await page.getByLabel('Name').fill(profileName)
			await page.getByLabel('Endpoint URL').fill(s3Endpoint)
			await page.getByLabel('Region').fill(s3Region)
			await page.getByLabel('Access Key ID').fill(s3AccessKey)
			await page.getByLabel('Secret').fill(s3SecretKey)
			await setSwitch(page, 'Force Path Style', forcePathStyle)
			await setSwitch(page, 'TLS Insecure Skip Verify', tlsSkipVerify)
			await page.getByRole('button', { name: 'Create' }).click()

			await expect(page.getByText(profileName, { exact: true })).toBeVisible({ timeout: 30_000 })
			profileId = await page.evaluate(() => JSON.parse(window.localStorage.getItem('profileId') ?? 'null'))

			await page.goto('/buckets')
			await page.getByRole('button', { name: 'New Bucket' }).click()
			await page.getByLabel('Bucket name').fill(bucketName)
			await page.getByRole('button', { name: 'Create' }).click()
			await expect(page.getByText(bucketName, { exact: true })).toBeVisible({ timeout: 30_000 })

			await page.goto('/uploads')
			await page.getByRole('combobox', { name: 'Bucket' }).click()
			await page.getByRole('option', { name: bucketName }).click()

			const fileInput = page.locator('input[type="file"]').first()
			await fileInput.setInputFiles(uploadFixture)
			await page.getByRole('button', { name: 'Queue upload' }).click()

			const uploadRow = page.getByText(`Upload: ${uploadFilename}`, { exact: true }).locator('xpath=ancestor::div[contains(@style, "border: 1px solid")]')
			await expect(uploadRow).toBeVisible({ timeout: 30_000 })
			await expect(uploadRow.getByText('Done', { exact: true })).toBeVisible({ timeout: 180_000 })

			await page.goto('/objects')
			await page.getByRole('combobox', { name: 'Bucket' }).click()
			await page.getByRole('option', { name: bucketName }).click()

			const objectRow = page.locator('[data-objects-row="true"]', { hasText: uploadFilename }).first()
			await expect(objectRow).toBeVisible({ timeout: 60_000 })

			const downloadPromise = page.waitForEvent('download')
			await objectRow.getByRole('button', { name: 'Object actions' }).click()
			await page.getByRole('menuitem', { name: 'Download (client)' }).click()
			const download = await downloadPromise
			expect(download.suggestedFilename()).toContain(uploadFilename)

			await objectRow.getByRole('button', { name: 'Object actions' }).click()
			await page.getByRole('menuitem', { name: /Delete \(Del\)/ }).click()
			const objectConfirm = page.locator('.ant-modal').filter({ hasText: 'Delete object?' })
			await objectConfirm.getByPlaceholder('DELETE').fill('DELETE')
			await objectConfirm.getByRole('button', { name: 'Delete' }).click()
			await expect(page.locator('[data-objects-row="true"]', { hasText: uploadFilename })).toHaveCount(0, { timeout: 60_000 })

			await page.goto('/buckets')
			const bucketRow = page.getByRole('row', { name: new RegExp(bucketName) })
			await bucketRow.getByRole('button', { name: 'Delete' }).click()
			const bucketConfirm = page.locator('.ant-modal').filter({ hasText: bucketName })
			await bucketConfirm.getByPlaceholder(bucketName).fill(bucketName)
			await bucketConfirm.getByRole('button', { name: 'Delete' }).click()
			await expect(page.getByText(bucketName, { exact: true })).toHaveCount(0, { timeout: 60_000 })

			await page.goto('/profiles')
			const profileRow = page.getByRole('row', { name: new RegExp(profileName) })
			await profileRow.getByRole('button', { name: 'Delete' }).click()
			const profileConfirm = page.locator('.ant-modal').filter({ hasText: profileName })
			await profileConfirm.getByPlaceholder(profileName).fill(profileName)
			await profileConfirm.getByRole('button', { name: 'Delete' }).click()
			await expect(page.getByText(profileName, { exact: true })).toHaveCount(0, { timeout: 60_000 })
		} finally {
			if (!profileId) return

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
	})
})
