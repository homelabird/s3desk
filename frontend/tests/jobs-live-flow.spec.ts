import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const isLive = process.env.E2E_LIVE === '1'

const apiToken = process.env.E2E_API_TOKEN ?? 'change-me'
const s3Endpoint = process.env.E2E_S3_ENDPOINT ?? 'http://minio:9000'
const s3Region = process.env.E2E_S3_REGION ?? 'us-east-1'
const s3AccessKey = process.env.E2E_S3_ACCESS_KEY ?? 'minioadmin'
const s3SecretKey = process.env.E2E_S3_SECRET_KEY ?? 'minioadmin'
const forcePathStyle = process.env.E2E_S3_FORCE_PATH_STYLE !== 'false'
const tlsSkipVerify = process.env.E2E_S3_TLS_SKIP_VERIFY !== 'false'

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

async function waitForJob(request: APIRequestContext, profileId: string, jobId: string) {
	const deadline = Date.now() + 120_000
	let lastStatus = 'unknown'

	while (Date.now() < deadline) {
		const res = await request.get(`/api/v1/jobs/${jobId}`, { headers: apiHeaders(profileId) })
		if (!res.ok()) {
			throw new Error(`job status request failed (${res.status()})`)
		}
		const job = (await res.json()) as { status?: string; error?: string | null }
		lastStatus = job.status ?? 'unknown'
		if (job.status === 'succeeded') return
		if (job.status === 'failed' || job.status === 'canceled') {
			const err = job.error ? `: ${job.error}` : ''
			throw new Error(`job ${jobId} ${job.status}${err}`)
		}
		await new Promise((resolve) => setTimeout(resolve, 2000))
	}

	throw new Error(`timed out waiting for job ${jobId} (last status: ${lastStatus})`)
}

async function seedStorage(page: Page, args: { profileId: string; bucket: string }) {
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
	}, { apiToken, profileId: args.profileId, bucket: args.bucket })
}

test.describe('Live Jobs flow', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('create delete job from UI and verify cleanup', async ({ page, request }) => {
		test.setTimeout(240_000)

		const runId = uniqueId()
		const profileName = `e2e-jobs-${runId}`
		const bucketName = `e2e-jobs-${runId}`
		const prefix = `jobs/${runId}/`
		const objectKey = `${prefix}delete-me.txt`
		let profileId: string | null = null

		try {
			const createProfile = await request.post('/api/v1/profiles', {
				headers: apiHeaders(),
				data: {
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
			const profile = (await createProfile.json()) as { id: string }
			profileId = profile.id

			const profileHeaders = apiHeaders(profileId)

			const createBucket = await request.post('/api/v1/buckets', {
				headers: profileHeaders,
				data: { name: bucketName },
			})
			expect(createBucket.status()).toBe(201)

			const createUpload = await request.post('/api/v1/uploads', {
				headers: profileHeaders,
				data: { bucket: bucketName },
			})
			expect(createUpload.status()).toBe(201)
			const upload = (await createUpload.json()) as { uploadId: string }

			const uploadFiles = await request.post(`/api/v1/uploads/${upload.uploadId}/files`, {
				headers: profileHeaders,
				multipart: {
					files: {
						name: objectKey,
						mimeType: 'text/plain',
						buffer: Buffer.from(`delete-${runId}`),
					},
				},
			})
			expect(uploadFiles.ok()).toBeTruthy()

			const commitUpload = await request.post(`/api/v1/uploads/${upload.uploadId}/commit`, { headers: profileHeaders })
			expect(commitUpload.status()).toBe(201)
			const commit = (await commitUpload.json()) as { jobId: string }
			await waitForJob(request, profileId, commit.jobId)

			await seedStorage(page, { profileId, bucket: bucketName })
			await page.goto('/jobs')
			await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()

			const createResponse = page.waitForResponse(
				(res) => res.url().includes('/api/v1/jobs') && res.request().method() === 'POST',
			)
			await page.getByRole('button', { name: 'New Delete Job' }).click()
			const deleteDrawer = page.getByRole('dialog', { name: 'Create delete job (S3)' })
			await expect(deleteDrawer).toBeVisible()
			const bucketSelect = deleteDrawer.getByRole('combobox', { name: 'Bucket' })
			await bucketSelect.fill(bucketName)
			await page.keyboard.press('Enter')
			await deleteDrawer.getByLabel('Prefix', { exact: true }).fill(prefix)
			await deleteDrawer.getByRole('button', { name: 'Create' }).click()

			const jobResponse = await createResponse
			expect(jobResponse.ok()).toBeTruthy()
			const job = (await jobResponse.json()) as { id: string }
			await expect(page.getByText(`rm s3://${bucketName}/${prefix}*`)).toBeVisible({ timeout: 30_000 })
			await waitForJob(request, profileId, job.id)

			const listObjects = await request.get(`/api/v1/buckets/${bucketName}/objects?prefix=${encodeURIComponent(prefix)}`, {
				headers: profileHeaders,
			})
			expect(listObjects.ok()).toBeTruthy()
			const payload = (await listObjects.json()) as { items?: { key: string }[] }
			expect(payload.items?.length ?? 0).toBe(0)
		} finally {
			if (profileId) {
				const profileHeaders = apiHeaders(profileId)
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
					await request.delete(`/api/v1/profiles/${profileId}`, { headers: apiHeaders() })
				} catch {
					// best-effort cleanup
				}
			}
		}
	})
})
