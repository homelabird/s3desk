import { expect, test, type APIRequestContext } from '@playwright/test'

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

test.describe('Live API CRUD', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('profiles, buckets, objects', async ({ request }) => {
		test.setTimeout(180_000)

		const runId = uniqueId()
		const profileName = `e2e-${runId}`
		const updatedProfileName = `e2e-${runId}-updated`
		const bucketName = `e2e-${runId}`
		const objectKey = `hello-${runId}.txt`
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
			const profile = (await createProfile.json()) as { id: string; name: string }
			profileId = profile.id
			expect(profile.name).toBe(profileName)

			const updateProfile = await request.patch(`/api/v1/profiles/${profileId}`, {
				headers: apiHeaders(),
				data: { name: updatedProfileName },
			})
			expect(updateProfile.status()).toBe(200)
			const updated = (await updateProfile.json()) as { name: string }
			expect(updated.name).toBe(updatedProfileName)

			const listProfiles = await request.get('/api/v1/profiles', { headers: apiHeaders() })
			expect(listProfiles.ok()).toBeTruthy()
			const profiles = (await listProfiles.json()) as { id: string }[]
			expect(profiles.some((p) => p.id === profileId)).toBeTruthy()

			const profileHeaders = apiHeaders(profileId)

			const createBucket = await request.post('/api/v1/buckets', {
				headers: profileHeaders,
				data: { name: bucketName },
			})
			expect(createBucket.status()).toBe(201)

			const listBuckets = await request.get('/api/v1/buckets', { headers: profileHeaders })
			expect(listBuckets.ok()).toBeTruthy()
			const buckets = (await listBuckets.json()) as { name: string }[]
			expect(buckets.some((b) => b.name === bucketName)).toBeTruthy()

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
						buffer: Buffer.from(`hello-${runId}`),
					},
				},
			})
			expect(uploadFiles.status()).toBe(204)

			const commitUpload = await request.post(`/api/v1/uploads/${upload.uploadId}/commit`, { headers: profileHeaders })
			expect(commitUpload.status()).toBe(201)
			const commit = (await commitUpload.json()) as { jobId: string }
			await waitForJob(request, profileId, commit.jobId)

			const listObjects = await request.get(`/api/v1/buckets/${bucketName}/objects`, { headers: profileHeaders })
			expect(listObjects.ok()).toBeTruthy()
			const objects = (await listObjects.json()) as { items: { key: string }[] }
			expect(objects.items.some((item) => item.key === objectKey)).toBeTruthy()

			const deleteObjects = await request.delete(`/api/v1/buckets/${bucketName}/objects`, {
				headers: profileHeaders,
				data: { keys: [objectKey] },
			})
			expect(deleteObjects.ok()).toBeTruthy()

			const deleteBucket = await request.delete(`/api/v1/buckets/${bucketName}`, { headers: profileHeaders })
			expect(deleteBucket.status()).toBe(204)
		} finally {
			if (!profileId) return
			const profileHeaders = apiHeaders(profileId)

			try {
				const listObjects = await request.get(`/api/v1/buckets/${bucketName}/objects`, { headers: profileHeaders })
				if (listObjects.ok()) {
					const payload = (await listObjects.json()) as { items: { key: string }[] }
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
	})
})
