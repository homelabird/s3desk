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
		if (!res.ok()) throw new Error(`job status request failed (${res.status()})`)
		const job = (await res.json()) as { status?: string; error?: string | null }
		lastStatus = job.status ?? 'unknown'
		if (job.status === 'succeeded') return
		if (job.status === 'failed' || job.status === 'canceled') {
			throw new Error(`job ${jobId} ${job.status}${job.error ? `: ${job.error}` : ''}`)
		}
		await new Promise((resolve) => setTimeout(resolve, 2000))
	}
	throw new Error(`timed out waiting for job ${jobId} (last status: ${lastStatus})`)
}

async function uploadObject(request: APIRequestContext, profileId: string, bucket: string, key: string, body: string, mimeType: string) {
	const createUpload = await request.post('/api/v1/uploads', {
		headers: apiHeaders(profileId),
		data: { bucket },
	})
	expect(createUpload.status()).toBe(201)
	const upload = (await createUpload.json()) as { uploadId: string }

	const uploadFiles = await request.post(`/api/v1/uploads/${upload.uploadId}/files`, {
		headers: apiHeaders(profileId),
		multipart: {
			files: {
				name: key,
				mimeType,
				buffer: Buffer.from(body),
			},
		},
	})
	expect(uploadFiles.status()).toBe(204)

	const commitUpload = await request.post(`/api/v1/uploads/${upload.uploadId}/commit`, { headers: apiHeaders(profileId) })
	expect(commitUpload.status()).toBe(201)
	const commit = (await commitUpload.json()) as { jobId: string }
	await waitForJob(request, profileId, commit.jobId)
}

async function seedStorage(page: Page, args: { profileId: string; bucket: string }) {
	await page.addInitScript(
		(seed) => {
			window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
			window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
			window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
			window.localStorage.setItem('prefix', JSON.stringify(''))
			window.localStorage.setItem('objectsUIMode', JSON.stringify('advanced'))
			window.localStorage.setItem('objectsShowThumbnails', JSON.stringify(true))
			window.localStorage.setItem('objectsDetailsOpen', JSON.stringify(true))
		},
		{ apiToken, profileId: args.profileId, bucket: args.bucket },
	)
}

test.describe('Live objects image preview', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('opens the large preview viewer for an uploaded image', async ({ page, request }) => {
		test.setTimeout(240_000)

		const runId = uniqueId()
		const profileName = `e2e-preview-${runId}`
		const bucketName = `e2e-preview-${runId}`
		const objectKey = `preview-${runId}.svg`
		const svgBody = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#0f766e"/><text x="48" y="120" fill="#ffffff" font-size="64">S3Desk</text></svg>`
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

			await uploadObject(request, profileId, bucketName, objectKey, svgBody, 'image/svg+xml')
			await seedStorage(page, { profileId, bucket: bucketName })
			await page.goto('/objects')

			const objectRow = page.locator('[data-objects-row="true"]').filter({ hasText: objectKey }).first()
			await expect(objectRow).toBeVisible({ timeout: 60_000 })
			await objectRow.getByRole('button', { name: 'Object actions' }).click()
			await page.getByRole('menuitem', { name: /Open large preview/i }).click()

			await expect(page.getByTestId('objects-image-viewer-modal')).toBeVisible({ timeout: 30_000 })
			await expect(page.getByTestId('objects-image-viewer-image')).toBeVisible({ timeout: 30_000 })
		} finally {
			if (profileId) {
				try {
					await request.delete(`/api/v1/buckets/${bucketName}/objects`, {
						headers: apiHeaders(profileId),
						data: { keys: [objectKey] },
					})
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
