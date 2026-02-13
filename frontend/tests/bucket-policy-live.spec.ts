import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test'

const isLive = process.env.E2E_LIVE === '1'

const apiToken = process.env.E2E_API_TOKEN ?? 'change-me'
const s3Endpoint = process.env.E2E_S3_ENDPOINT ?? 'http://minio:9000'
const s3Region = process.env.E2E_S3_REGION ?? 'us-east-1'
const s3AccessKey = process.env.E2E_S3_ACCESS_KEY ?? 'minioadmin'
const s3SecretKey = process.env.E2E_S3_SECRET_KEY ?? 'minioadmin'
const forcePathStyle = process.env.E2E_S3_FORCE_PATH_STYLE !== 'false'
const tlsSkipVerify = process.env.E2E_S3_TLS_SKIP_VERIFY !== 'false'
const gcsPolicyLive = process.env.E2E_GCS_POLICY_LIVE === '1'
const gcsBucket = process.env.E2E_GCS_BUCKET ?? ''
const gcsServiceAccountJSON = process.env.E2E_GCS_SERVICE_ACCOUNT_JSON ?? ''
const gcsEndpoint = process.env.E2E_GCS_ENDPOINT ?? ''
const gcsProjectNumber = process.env.E2E_GCS_PROJECT_NUMBER ?? ''
const gcsTLSInsecureSkipVerify = process.env.E2E_GCS_TLS_SKIP_VERIFY === '1'
const azurePolicyLive = process.env.E2E_AZURE_POLICY_LIVE === '1'
const azureContainer = process.env.E2E_AZURE_CONTAINER ?? ''
const azureAccountName = process.env.E2E_AZURE_ACCOUNT_NAME ?? ''
const azureAccountKey = process.env.E2E_AZURE_ACCOUNT_KEY ?? ''
const azureEndpoint = process.env.E2E_AZURE_ENDPOINT ?? ''
const azureUseEmulator = process.env.E2E_AZURE_USE_EMULATOR === '1'
const azureTLSInsecureSkipVerify = process.env.E2E_AZURE_TLS_SKIP_VERIFY === '1'
const policySummaryFile = process.env.E2E_POLICY_SUMMARY_FILE ?? 'test-results/policy-live-summary.ndjson'

type PolicyCallSummary = {
	phase: string
	method: 'GET' | 'PUT' | 'POST' | 'DELETE'
	path: string
	status: number
	ok: boolean
	errorCode?: string
	normalizedCode?: string
	exists?: boolean
	validationOk?: boolean
	errorsCount?: number
	warningsCount?: number
}

type PolicyTestSummary = {
	test: string
	provider: string
	status: string
	calls: PolicyCallSummary[]
	notes?: string[]
}

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

function hasMessage(messages: string[] | undefined, fragment: string): boolean {
	if (!Array.isArray(messages)) return false
	const token = fragment.toLowerCase()
	return messages.some((msg) => msg.toLowerCase().includes(token))
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function summarizePolicyCall(args: {
	phase: string
	method: 'GET' | 'PUT' | 'POST' | 'DELETE'
	path: string
	status: number
	body?: unknown
}): PolicyCallSummary {
	const out: PolicyCallSummary = {
		phase: args.phase,
		method: args.method,
		path: args.path,
		status: args.status,
		ok: args.status >= 200 && args.status < 300,
	}
	if (!isRecord(args.body)) return out

	if (typeof args.body.exists === 'boolean') out.exists = args.body.exists
	if (typeof args.body.ok === 'boolean') out.validationOk = args.body.ok
	if (Array.isArray(args.body.errors)) out.errorsCount = args.body.errors.length
	if (Array.isArray(args.body.warnings)) out.warningsCount = args.body.warnings.length

	const err = isRecord(args.body.error) ? args.body.error : null
	if (err && typeof err.code === 'string') out.errorCode = err.code
	const norm = err && isRecord(err.normalizedError) ? err.normalizedError : null
	if (norm && typeof norm.code === 'string') out.normalizedCode = norm.code
	return out
}

function recordPolicyCall(
	list: PolicyCallSummary[],
	args: {
		phase: string
		method: 'GET' | 'PUT' | 'POST' | 'DELETE'
		path: string
		status: number
		body?: unknown
	},
) {
	list.push(summarizePolicyCall(args))
}

async function writePolicySummary(testInfo: TestInfo, payload: PolicyTestSummary): Promise<void> {
	const body = JSON.stringify(payload, null, 2)
	await testInfo.attach('policy-api-summary', {
		body: Buffer.from(body, 'utf8'),
		contentType: 'application/json',
	})

	const summaryPath = path.isAbsolute(policySummaryFile)
		? policySummaryFile
		: path.join(process.cwd(), policySummaryFile)
	await mkdir(path.dirname(summaryPath), { recursive: true })
	await appendFile(summaryPath, `${JSON.stringify(payload)}\n`, 'utf8')
}

async function createProfile(request: APIRequestContext, payload: Record<string, unknown>): Promise<string> {
	const createProfileRes = await request.post('/api/v1/profiles', {
		headers: apiHeaders(),
		data: payload,
	})
	expect(createProfileRes.status()).toBe(201)
	const profile = (await createProfileRes.json()) as { id: string }
	return profile.id
}

async function deleteProfile(request: APIRequestContext, profileId: string): Promise<void> {
	try {
		await request.delete(`/api/v1/profiles/${profileId}`, { headers: apiHeaders() })
	} catch {
		// best-effort cleanup
	}
}

test.describe('Live bucket policy flows', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('get -> put -> get -> delete -> get', async ({ request }, testInfo) => {
		test.setTimeout(180_000)

		const runId = uniqueId()
		const profileName = `e2e-policy-${runId}`
		const bucketName = `e2e-policy-${runId}`
		let profileId: string | null = null
		const calls: PolicyCallSummary[] = []

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
			const profile = (await createProfile.json()) as { id: string }
			profileId = profile.id

			const profileHeaders = apiHeaders(profileId)
			const createBucket = await request.post('/api/v1/buckets', {
				headers: profileHeaders,
				data: { name: bucketName },
			})
			expect(createBucket.status()).toBe(201)

			const getPath = `/api/v1/buckets/${bucketName}/policy`
			const validatePath = `/api/v1/buckets/${bucketName}/policy/validate`

			const getBefore = await request.get(getPath, { headers: profileHeaders })
			expect(getBefore.status()).toBe(200)
			const beforeBody = (await getBefore.json()) as { exists?: boolean }
			expect(beforeBody.exists).toBe(false)
			recordPolicyCall(calls, { phase: 'before_get', method: 'GET', path: getPath, status: getBefore.status(), body: beforeBody })

			const policyDoc = {
				Version: '2012-10-17',
				Statement: [
					{
						Sid: 'PublicReadObjects',
						Effect: 'Allow',
						Principal: { AWS: ['*'] },
						Action: ['s3:GetObject'],
						Resource: [`arn:aws:s3:::${bucketName}/*`],
					},
				],
			}

			const validateRes = await request.post(validatePath, {
				headers: profileHeaders,
				data: { policy: policyDoc },
			})
			expect(validateRes.status()).toBe(200)
			const validateBody = (await validateRes.json()) as { ok?: boolean; errors?: string[] }
			expect(validateBody.ok).toBe(true)
			expect(Array.isArray(validateBody.errors) ? validateBody.errors.length : 0).toBe(0)
			recordPolicyCall(calls, {
				phase: 'validate',
				method: 'POST',
				path: validatePath,
				status: validateRes.status(),
				body: validateBody,
			})

			const putRes = await request.put(getPath, {
				headers: profileHeaders,
				data: { policy: policyDoc },
			})
			expect(putRes.status()).toBe(204)
			recordPolicyCall(calls, { phase: 'put', method: 'PUT', path: getPath, status: putRes.status() })

			const getAfterPut = await request.get(getPath, { headers: profileHeaders })
			expect(getAfterPut.status()).toBe(200)
			const afterPutBody = (await getAfterPut.json()) as {
				exists?: boolean
				policy?: { Statement?: Array<{ Action?: string[]; Resource?: string[] }> }
			}
			expect(afterPutBody.exists).toBe(true)
			expect(afterPutBody.policy?.Statement?.length).toBeGreaterThan(0)
			recordPolicyCall(calls, { phase: 'after_put_get', method: 'GET', path: getPath, status: getAfterPut.status(), body: afterPutBody })

			const delRes = await request.delete(getPath, { headers: profileHeaders })
			expect(delRes.status()).toBe(204)
			recordPolicyCall(calls, { phase: 'delete', method: 'DELETE', path: getPath, status: delRes.status() })

			const getAfterDelete = await request.get(getPath, { headers: profileHeaders })
			expect(getAfterDelete.status()).toBe(200)
			const afterDeleteBody = (await getAfterDelete.json()) as { exists?: boolean }
			expect(afterDeleteBody.exists).toBe(false)
			recordPolicyCall(calls, {
				phase: 'after_delete_get',
				method: 'GET',
				path: getPath,
				status: getAfterDelete.status(),
				body: afterDeleteBody,
			})
		} finally {
			if (profileId) {
				const profileHeaders = apiHeaders(profileId)
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
			await writePolicySummary(testInfo, {
				test: testInfo.titlePath.join(' > '),
				provider: 's3_compatible',
				status: testInfo.status,
				calls,
			})
		}
	})

	test('gcs validate returns provider-specific errors and warnings', async ({ request }, testInfo) => {
		const runId = uniqueId()
		const profileName = `e2e-policy-gcs-${runId}`
		const bucketName = `e2e-policy-gcs-${runId}`
		let profileId: string | null = null
		const calls: PolicyCallSummary[] = []

		try {
			profileId = await createProfile(request, {
				provider: 'gcp_gcs',
				name: profileName,
				anonymous: true,
				endpoint: 'http://127.0.0.1:4443',
			})
			const profileHeaders = apiHeaders(profileId)

			const missingBindingsRes = await request.post(`/api/v1/buckets/${bucketName}/policy/validate`, {
				headers: profileHeaders,
				data: {
					policy: {
						version: 1,
					},
				},
			})
			expect(missingBindingsRes.status()).toBe(200)
			const missingBindingsBody = (await missingBindingsRes.json()) as {
				ok?: boolean
				provider?: string
				errors?: string[]
			}
			expect(missingBindingsBody.provider).toBe('gcp_gcs')
			expect(missingBindingsBody.ok).toBe(false)
			expect(hasMessage(missingBindingsBody.errors, 'bindings')).toBe(true)
			recordPolicyCall(calls, {
				phase: 'validate_missing_bindings',
				method: 'POST',
				path: `/api/v1/buckets/${bucketName}/policy/validate`,
				status: missingBindingsRes.status(),
				body: missingBindingsBody,
			})

			const publicGrantRes = await request.post(`/api/v1/buckets/${bucketName}/policy/validate`, {
				headers: profileHeaders,
				data: {
					policy: {
						version: 1,
						bindings: [
							{
								role: 'roles/storage.objectViewer',
								members: ['allUsers'],
							},
						],
					},
				},
			})
			expect(publicGrantRes.status()).toBe(200)
			const publicGrantBody = (await publicGrantRes.json()) as {
				ok?: boolean
				errors?: string[]
				warnings?: string[]
			}
			expect(publicGrantBody.ok).toBe(true)
			expect(Array.isArray(publicGrantBody.errors) ? publicGrantBody.errors.length : 0).toBe(0)
			expect(hasMessage(publicGrantBody.warnings, 'allUsers')).toBe(true)
			recordPolicyCall(calls, {
				phase: 'validate_public_grant',
				method: 'POST',
				path: `/api/v1/buckets/${bucketName}/policy/validate`,
				status: publicGrantRes.status(),
				body: publicGrantBody,
			})
		} finally {
			if (profileId) await deleteProfile(request, profileId)
			await writePolicySummary(testInfo, {
				test: testInfo.titlePath.join(' > '),
				provider: 'gcp_gcs',
				status: testInfo.status,
				calls,
			})
		}
	})

	test('azure validate enforces policy constraints', async ({ request }, testInfo) => {
		const runId = uniqueId()
		const profileName = `e2e-policy-azure-${runId}`
		const bucketName = `e2e-policy-azure-${runId}`
		let profileId: string | null = null
		const calls: PolicyCallSummary[] = []

		try {
			profileId = await createProfile(request, {
				provider: 'azure_blob',
				name: profileName,
				accountName: `acct${runId.replace(/[^a-z0-9]/gi, '')}`.slice(0, 24),
				accountKey: `key-${runId}`,
			})
			const profileHeaders = apiHeaders(profileId)

			const invalidRes = await request.post(`/api/v1/buckets/${bucketName}/policy/validate`, {
				headers: profileHeaders,
				data: {
					policy: {
						publicAccess: 'invalid',
						storedAccessPolicies: [
							{ id: 'p1' },
							{ id: 'p2' },
							{ id: 'p3' },
							{ id: 'p4' },
							{ id: 'p5' },
							{ id: 'p6' },
						],
					},
				},
			})
			expect(invalidRes.status()).toBe(200)
			const invalidBody = (await invalidRes.json()) as { ok?: boolean; errors?: string[] }
			expect(invalidBody.ok).toBe(false)
			expect(hasMessage(invalidBody.errors, 'publicAccess')).toBe(true)
			expect(hasMessage(invalidBody.errors, 'maximum of 5')).toBe(true)
			recordPolicyCall(calls, {
				phase: 'validate_invalid',
				method: 'POST',
				path: `/api/v1/buckets/${bucketName}/policy/validate`,
				status: invalidRes.status(),
				body: invalidBody,
			})

			const validRes = await request.post(`/api/v1/buckets/${bucketName}/policy/validate`, {
				headers: profileHeaders,
				data: {
					policy: {
						publicAccess: 'private',
						storedAccessPolicies: [{ id: 'readonly', permission: 'r' }],
					},
				},
			})
			expect(validRes.status()).toBe(200)
			const validBody = (await validRes.json()) as { ok?: boolean; errors?: string[] }
			expect(validBody.ok).toBe(true)
			expect(Array.isArray(validBody.errors) ? validBody.errors.length : 0).toBe(0)
			recordPolicyCall(calls, {
				phase: 'validate_valid',
				method: 'POST',
				path: `/api/v1/buckets/${bucketName}/policy/validate`,
				status: validRes.status(),
				body: validBody,
			})
		} finally {
			if (profileId) await deleteProfile(request, profileId)
			await writePolicySummary(testInfo, {
				test: testInfo.titlePath.join(' > '),
				provider: 'azure_blob',
				status: testInfo.status,
				calls,
			})
		}
	})

	test('gcs policy get/put/get smoke with existing bucket policy', async ({ request }, testInfo) => {
		test.skip(!gcsPolicyLive, 'E2E_GCS_POLICY_LIVE=1 required')
		test.skip(gcsBucket.trim() === '', 'E2E_GCS_BUCKET is required')
		test.skip(gcsServiceAccountJSON.trim() === '', 'E2E_GCS_SERVICE_ACCOUNT_JSON is required')

		const runId = uniqueId()
		const profileName = `e2e-policy-gcs-live-${runId}`
		let profileId: string | null = null
		const calls: PolicyCallSummary[] = []

		try {
			profileId = await createProfile(request, {
				provider: 'gcp_gcs',
				name: profileName,
				serviceAccountJson: gcsServiceAccountJSON,
				...(gcsEndpoint.trim() !== '' ? { endpoint: gcsEndpoint } : {}),
				...(gcsProjectNumber.trim() !== '' ? { projectNumber: gcsProjectNumber } : {}),
				tlsInsecureSkipVerify: gcsTLSInsecureSkipVerify,
			})
			const headers = apiHeaders(profileId)

			const getBefore = await request.get(`/api/v1/buckets/${encodeURIComponent(gcsBucket)}/policy`, { headers })
			expect(getBefore.status()).toBe(200)
			const beforeBody = (await getBefore.json()) as { exists?: boolean; policy?: Record<string, unknown> }
			recordPolicyCall(calls, {
				phase: 'before_get',
				method: 'GET',
				path: `/api/v1/buckets/${encodeURIComponent(gcsBucket)}/policy`,
				status: getBefore.status(),
				body: beforeBody,
			})
			test.skip(!beforeBody.exists || !beforeBody.policy, 'bucket must already have IAM policy to preserve/reapply state safely')

			const putSame = await request.put(`/api/v1/buckets/${encodeURIComponent(gcsBucket)}/policy`, {
				headers,
				data: { policy: beforeBody.policy },
			})
			expect(putSame.status()).toBe(204)
			recordPolicyCall(calls, {
				phase: 'put_same',
				method: 'PUT',
				path: `/api/v1/buckets/${encodeURIComponent(gcsBucket)}/policy`,
				status: putSame.status(),
			})

			const getAfter = await request.get(`/api/v1/buckets/${encodeURIComponent(gcsBucket)}/policy`, { headers })
			expect(getAfter.status()).toBe(200)
			const afterBody = (await getAfter.json()) as { exists?: boolean; policy?: Record<string, unknown> }
			expect(afterBody.exists).toBe(true)
			recordPolicyCall(calls, {
				phase: 'after_put_get',
				method: 'GET',
				path: `/api/v1/buckets/${encodeURIComponent(gcsBucket)}/policy`,
				status: getAfter.status(),
				body: afterBody,
			})
		} finally {
			if (profileId) await deleteProfile(request, profileId)
			await writePolicySummary(testInfo, {
				test: testInfo.titlePath.join(' > '),
				provider: 'gcp_gcs',
				status: testInfo.status,
				calls,
			})
		}
	})

	test('azure policy get/put/get smoke with restore', async ({ request }, testInfo) => {
		test.skip(!azurePolicyLive, 'E2E_AZURE_POLICY_LIVE=1 required')
		test.skip(azureContainer.trim() === '', 'E2E_AZURE_CONTAINER is required')
		test.skip(azureAccountName.trim() === '' || azureAccountKey.trim() === '', 'E2E_AZURE_ACCOUNT_NAME/E2E_AZURE_ACCOUNT_KEY are required')

		const runId = uniqueId()
		const profileName = `e2e-policy-azure-live-${runId}`
		let profileId: string | null = null
		let restorePolicy: Record<string, unknown> | null = null
		let changed = false
		const calls: PolicyCallSummary[] = []

		try {
			profileId = await createProfile(request, {
				provider: 'azure_blob',
				name: profileName,
				accountName: azureAccountName,
				accountKey: azureAccountKey,
				...(azureEndpoint.trim() !== '' ? { endpoint: azureEndpoint } : {}),
				...(azureUseEmulator ? { useEmulator: true } : {}),
				tlsInsecureSkipVerify: azureTLSInsecureSkipVerify,
			})
			const headers = apiHeaders(profileId)
			const container = encodeURIComponent(azureContainer)

			const getBefore = await request.get(`/api/v1/buckets/${container}/policy`, { headers })
			expect(getBefore.status()).toBe(200)
			const beforeBody = (await getBefore.json()) as { policy?: Record<string, unknown> }
			recordPolicyCall(calls, {
				phase: 'before_get',
				method: 'GET',
				path: `/api/v1/buckets/${container}/policy`,
				status: getBefore.status(),
				body: beforeBody,
			})
			test.skip(!beforeBody.policy, 'container policy must be readable to restore state safely')
			restorePolicy = beforeBody.policy

			const markerID = `e2e-${runId}`.slice(0, 32)
			const putTestPolicy = await request.put(`/api/v1/buckets/${container}/policy`, {
				headers,
				data: {
					policy: {
						publicAccess: 'private',
						storedAccessPolicies: [{ id: markerID, permission: 'r' }],
					},
				},
			})
			expect(putTestPolicy.status()).toBe(204)
			changed = true
			recordPolicyCall(calls, {
				phase: 'put_marker_policy',
				method: 'PUT',
				path: `/api/v1/buckets/${container}/policy`,
				status: putTestPolicy.status(),
			})

			const getAfter = await request.get(`/api/v1/buckets/${container}/policy`, { headers })
			expect(getAfter.status()).toBe(200)
			const afterBody = (await getAfter.json()) as {
				exists?: boolean
				policy?: { storedAccessPolicies?: Array<{ id?: string }> }
			}
			expect(afterBody.exists).toBe(true)
			const ids = Array.isArray(afterBody.policy?.storedAccessPolicies) ? afterBody.policy.storedAccessPolicies.map((v) => v.id ?? '') : []
			expect(ids).toContain(markerID)
			recordPolicyCall(calls, {
				phase: 'after_put_get',
				method: 'GET',
				path: `/api/v1/buckets/${container}/policy`,
				status: getAfter.status(),
				body: afterBody,
			})
		} finally {
			if (profileId && restorePolicy && changed) {
				try {
					const restorePath = `/api/v1/buckets/${encodeURIComponent(azureContainer)}/policy`
					const restoreRes = await request.put(restorePath, {
						headers: apiHeaders(profileId),
						data: { policy: restorePolicy },
					})
					recordPolicyCall(calls, {
						phase: 'restore_put',
						method: 'PUT',
						path: restorePath,
						status: restoreRes.status(),
					})
				} catch {
					// best-effort restore
				}
			}
			if (profileId) await deleteProfile(request, profileId)
			await writePolicySummary(testInfo, {
				test: testInfo.titlePath.join(' > '),
				provider: 'azure_blob',
				status: testInfo.status,
				calls,
			})
		}
	})
})
