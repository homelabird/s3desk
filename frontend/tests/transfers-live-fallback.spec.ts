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

function endpointOrigin(endpoint: string): string | null {
	try {
		return new URL(endpoint).origin
	} catch {
		return null
	}
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
		window.localStorage.setItem('prefix', JSON.stringify(''))
		window.localStorage.setItem('objectsUIMode', JSON.stringify('simple'))
		window.localStorage.setItem('downloadLinkProxyEnabled', JSON.stringify(false))
	}, { apiToken, profileId: args.profileId, bucket: args.bucket })
}

async function uploadObject(request: APIRequestContext, profileId: string, bucket: string, key: string, body: string) {
	const profileHeaders = apiHeaders(profileId)

	const createUpload = await request.post('/api/v1/uploads', {
		headers: profileHeaders,
		data: { bucket },
	})
	if (createUpload.status() !== 201) {
		throw new Error(`failed to create upload (${createUpload.status()})`)
	}
	const upload = (await createUpload.json()) as { uploadId: string }

	const uploadFiles = await request.post(`/api/v1/uploads/${upload.uploadId}/files`, {
		headers: profileHeaders,
		multipart: {
			files: {
				name: key,
				mimeType: 'text/plain',
				buffer: Buffer.from(body),
			},
		},
	})
	if (!uploadFiles.ok()) {
		throw new Error(`upload files failed (${uploadFiles.status()})`)
	}

	const commitUpload = await request.post(`/api/v1/uploads/${upload.uploadId}/commit`, { headers: profileHeaders })
	if (commitUpload.status() !== 201) {
		throw new Error(`commit upload failed (${commitUpload.status()})`)
	}
	const commit = (await commitUpload.json()) as { jobId: string }
	await waitForJob(request, profileId, commit.jobId)
}

test.describe('Live transfer fallback flows', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('non-S3 provider rejects presigned upload mode and allows staging mode', async ({ request }) => {
		const runId = uniqueId()
		const profileName = `e2e-fallback-azure-${runId}`
		const bucketName = `fallback-${runId}`
		let profileId: string | null = null
		let uploadId: string | null = null

		try {
			const createProfile = await request.post('/api/v1/profiles', {
				headers: apiHeaders(),
				data: {
					provider: 'azure_blob',
					name: profileName,
					accountName: `acct${runId.replace(/[^a-z0-9]/gi, '')}`.slice(0, 24),
					accountKey: `key-${runId}`,
				},
			})
			expect(createProfile.status()).toBe(201)
			const profile = (await createProfile.json()) as { id: string }
			profileId = profile.id

			const createPresignedUpload = await request.post('/api/v1/uploads', {
				headers: apiHeaders(profileId),
				data: { bucket: bucketName, mode: 'presigned' },
			})
			expect(createPresignedUpload.status()).toBe(400)
			const presignedErr = (await createPresignedUpload.json()) as { error?: { code?: string; message?: string } }
			expect(presignedErr.error?.code).toBe('not_supported')
			expect((presignedErr.error?.message ?? '').toLowerCase()).toContain('presigned')

			const createStagingUpload = await request.post('/api/v1/uploads', {
				headers: apiHeaders(profileId),
				data: { bucket: bucketName, mode: 'staging' },
			})
			expect(createStagingUpload.status()).toBe(201)
			const stagingUpload = (await createStagingUpload.json()) as { uploadId: string; mode: string }
			uploadId = stagingUpload.uploadId
			expect(stagingUpload.mode).toBe('staging')
		} finally {
			if (profileId && uploadId) {
				try {
					await request.delete(`/api/v1/uploads/${uploadId}`, { headers: apiHeaders(profileId) })
				} catch {
					// best-effort cleanup
				}
			}

			if (profileId) {
				try {
					await request.delete(`/api/v1/profiles/${profileId}`, { headers: apiHeaders() })
				} catch {
					// best-effort cleanup
				}
			}
		}
	})

	test('UI upload path skips presigned mode when capability matrix marks it unsupported', async ({ page, request }) => {
		test.setTimeout(240_000)

		const runId = uniqueId()
		const profileName = `e2e-fallback-ui-azure-${runId}`
		const bucketName = `fallback-ui-${runId}`
		let profileId: string | null = null
		const uploadModes: string[] = []

		try {
			const createProfile = await request.post('/api/v1/profiles', {
				headers: apiHeaders(),
				data: {
					provider: 'azure_blob',
					name: profileName,
					accountName: `acct${runId.replace(/[^a-z0-9]/gi, '')}`.slice(0, 24),
					accountKey: `key-${runId}`,
				},
			})
			expect(createProfile.status()).toBe(201)
			const profile = (await createProfile.json()) as { id: string }
			profileId = profile.id

			await seedStorage(page, { profileId, bucket: bucketName })
			page.on('request', (req) => {
				if (req.method() !== 'POST') return
				const url = new URL(req.url())
				if (url.pathname !== '/api/v1/uploads') return
				try {
					const body = req.postDataJSON() as { mode?: string }
					if (body?.mode) uploadModes.push(body.mode)
				} catch {
					// ignore parse failures
				}
			})

			await page.goto('/uploads')
			const fileInput = page.locator('input[type="file"]').first()
			await fileInput.setInputFiles({
				name: `capability-${runId}.txt`,
				mimeType: 'text/plain',
				buffer: Buffer.from(`capability-${runId}`),
			})
			await page.getByRole('button', { name: /Queue upload/i }).click()

			await expect.poll(() => uploadModes.length, { timeout: 30_000 }).toBeGreaterThan(0)
			expect(uploadModes[0]).toBe('staging')
			expect(uploadModes).not.toContain('presigned')
		} finally {
			if (profileId) {
				try {
					await request.delete(`/api/v1/profiles/${profileId}`, { headers: apiHeaders() })
				} catch {
					// best-effort cleanup
				}
			}
		}
	})

	test('CORS-like direct download failure falls back to proxy download URL', async ({ page, request }) => {
		test.setTimeout(240_000)

		const runId = uniqueId()
		const profileName = `e2e-fallback-s3-${runId}`
		const bucketName = `e2e-fallback-${runId}`
		const objectKey = `cors-fallback-${runId}.txt`
		const directOrigin = endpointOrigin(s3Endpoint)
		test.skip(!directOrigin, 'E2E_S3_ENDPOINT must be an absolute URL')

		let profileId: string | null = null
		let directDownloadURLCalls = 0
		let proxyDownloadURLCalls = 0
		let directObjectFetchAborted = false

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

			await uploadObject(request, profileId, bucketName, objectKey, `cors-fallback-${runId}`)

			await seedStorage(page, { profileId, bucket: bucketName })

			page.on('request', (req) => {
				if (req.method() !== 'GET') return
				const url = new URL(req.url())
				if (url.pathname !== `/api/v1/buckets/${bucketName}/objects/download-url`) return
				if (url.searchParams.get('key') !== objectKey) return
				if (url.searchParams.get('proxy') === 'true') {
					proxyDownloadURLCalls++
					return
				}
				directDownloadURLCalls++
			})

			await page.route(`${directOrigin}/**`, async (route) => {
				const req = route.request()
				if (req.method() !== 'GET') {
					await route.continue()
					return
				}
				const url = req.url()
				if (
					!directObjectFetchAborted &&
					(url.includes(objectKey) || url.includes(encodeURIComponent(objectKey)))
				) {
					directObjectFetchAborted = true
					await route.abort('failed')
					return
				}
				await route.continue()
			})

			await page.goto('/objects')
			const objectRow = page.locator('[data-objects-row="true"]', { hasText: objectKey }).first()
			await expect(objectRow).toBeVisible({ timeout: 60_000 })

			await objectRow.click()
			await expect(page.getByText('1 selected')).toBeVisible({ timeout: 10_000 })
			await page.getByRole('button', { name: 'Download (client)' }).first().click()

			const drawerMask = page.locator('.ant-drawer-mask').first()
			const drawerOpen = await drawerMask.isVisible().catch(() => false)
			if (!drawerOpen) {
				await page.getByRole('button', { name: /Transfers/i }).first().click()
			}
			const transfersDialog = page.getByRole('dialog', { name: /Transfers/i })
			await expect(transfersDialog).toBeVisible({ timeout: 30_000 })
			await transfersDialog.getByRole('tab', { name: /Downloads/i }).click()
			const downloadRow = transfersDialog
				.getByText(objectKey, { exact: true })
				.locator('xpath=ancestor::div[contains(@style, "border: 1px solid")]')
			await expect(downloadRow).toBeVisible({ timeout: 30_000 })
			await expect(downloadRow.getByText('Done', { exact: true })).toBeVisible({ timeout: 120_000 })

			await expect.poll(() => directDownloadURLCalls, { timeout: 10_000 }).toBeGreaterThan(0)
			await expect.poll(() => proxyDownloadURLCalls, { timeout: 10_000 }).toBeGreaterThan(0)
			expect(directObjectFetchAborted).toBe(true)
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
