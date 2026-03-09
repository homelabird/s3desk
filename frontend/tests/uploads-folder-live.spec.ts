import path from 'path'
import { fileURLToPath } from 'url'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { transferUploadRow } from './support/ui'

const isLive = process.env.E2E_LIVE === '1'

const apiToken = process.env.E2E_API_TOKEN ?? 'change-me'
const s3Endpoint = process.env.E2E_S3_ENDPOINT ?? 'http://minio:9000'
const s3Region = process.env.E2E_S3_REGION ?? 'us-east-1'
const s3AccessKey = process.env.E2E_S3_ACCESS_KEY ?? 'minioadmin'
const s3SecretKey = process.env.E2E_S3_SECRET_KEY ?? 'minioadmin'
const forcePathStyle = process.env.E2E_S3_FORCE_PATH_STYLE !== 'false'
const tlsSkipVerify = process.env.E2E_S3_TLS_SKIP_VERIFY !== 'false'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.join(testDir, 'fixtures', 'upload-folder')

function apiHeaders(profileId?: string) {
	const headers: Record<string, string> = {}
	if (apiToken) headers['X-Api-Token'] = apiToken
	if (profileId) headers['X-Profile-Id'] = profileId
	return headers
}

function uniqueId() {
	const now = Date.now().toString(36)
	const rand = Math.random().toString(36).slice(2, 8)
	return `${now}-${rand}`
}

async function seedStorage(page: Page, args: { profileId: string; bucket: string }) {
	await page.addInitScript(
		(seed) => {
			window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
			window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
			window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
			window.localStorage.setItem('prefix', JSON.stringify(''))
		},
		{ apiToken, profileId: args.profileId, bucket: args.bucket },
	)
}

async function listObjectKeys(request: APIRequestContext, profileId: string, bucket: string, prefix: string) {
	const res = await request.get(`/api/v1/buckets/${bucket}/objects?prefix=${encodeURIComponent(prefix)}`, {
		headers: apiHeaders(profileId),
	})
	if (!res.ok()) throw new Error(`list objects failed (${res.status()})`)
	const payload = (await res.json()) as { items?: Array<{ key: string }> }
	return payload.items?.map((item) => item.key) ?? []
}

test.describe('Live folder uploads', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('uploads a folder tree and preserves relative paths', async ({ page, request }) => {
		test.setTimeout(240_000)

		const runId = uniqueId()
		const profileName = `e2e-folder-${runId}`
		const bucketName = `e2e-folder-${runId}`
		let profileId: string | null = null

		try {
			const createProfile = await request.post('/api/v1/profiles', {
				headers: apiHeaders(),
				data: {
					provider: 's3_compatible',
					name: profileName,
					endpoint: s3Endpoint,
					region: s3Region,
					accessKeyId: s3AccessKey,
					secretAccessKey: s3SecretKey,
					forcePathStyle,
					tlsInsecureSkipVerify: tlsSkipVerify,
				},
			})
			expect(createProfile.status()).toBe(201)
			profileId = ((await createProfile.json()) as { id: string }).id

			const createBucket = await request.post('/api/v1/buckets', {
				headers: apiHeaders(profileId),
				data: { name: bucketName },
			})
			expect(createBucket.status()).toBe(201)

			await seedStorage(page, { profileId, bucket: bucketName })
			await page.goto('/uploads')

			const folderSwitch = page.getByRole('switch', { name: 'Folder mode' })
			if ((await folderSwitch.getAttribute('aria-checked')) !== 'true') {
				await folderSwitch.click()
			}

			await page.locator('input[type="file"]').first().setInputFiles(fixtureRoot)
			await page.getByRole('button', { name: /Queue upload/i }).click()

			const uploadRow = transferUploadRow(page, /Upload: 2 file\(s\)/)
			await expect(uploadRow).toBeVisible({ timeout: 30_000 })
			await expect(uploadRow.getByText('Done', { exact: true })).toBeVisible({ timeout: 180_000 })

			await expect.poll(() => listObjectKeys(request, profileId!, bucketName, 'dir-a/'), { timeout: 60_000 }).toContain('dir-a/alpha.txt')
			await expect.poll(() => listObjectKeys(request, profileId!, bucketName, 'dir-b/nested/'), { timeout: 60_000 }).toContain(
				'dir-b/nested/beta.txt',
			)
		} finally {
			if (profileId) {
				try {
					const keys = await listObjectKeys(request, profileId, bucketName, '')
					if (keys.length > 0) {
						await request.delete(`/api/v1/buckets/${bucketName}/objects`, {
							headers: apiHeaders(profileId),
							data: { keys },
						})
					}
				} catch {
					// best-effort cleanup
				}
				try {
					await request.delete(`/api/v1/buckets/${bucketName}`, { headers: apiHeaders(profileId) })
				} catch {
					// best-effort cleanup
				}
				try {
					await request.delete(`/api/v1/profiles/${profileId}`, { headers: apiHeaders() })
				} catch {
					// best-effort cleanup
				}
			}
		}
	})
})
