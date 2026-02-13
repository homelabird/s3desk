import { describe, expect, it } from 'vitest'

import { APIError } from '../../api/client'
import { formatError, formatErrorWithHint, getRecoveryHint } from '../errors'

describe('getRecoveryHint', () => {
	it('returns local allowlist guidance for local-path guard errors', () => {
		const err = new APIError({
			status: 400,
			code: 'invalid_request',
			message: 'payload.localPath "/tmp/foo" is not under an allowed local directory',
		})

		expect(getRecoveryHint(err)).toContain('ALLOWED_LOCAL_DIRS')
	})

	it('returns local-path not found guidance', () => {
		const err = new APIError({
			status: 400,
			code: 'invalid_request',
			message: 'payload.localPath not found',
		})

		expect(getRecoveryHint(err)).toContain('not found on the server filesystem')
	})

	it('keeps unrelated invalid_request errors unchanged', () => {
		const err = new APIError({
			status: 400,
			code: 'invalid_request',
			message: 'bucket is required',
		})

		expect(getRecoveryHint(err)).toBeUndefined()
	})

	it('includes normalized code and retry-after tags in API error title', () => {
		const err = new APIError({
			status: 429,
			code: 'upload_failed',
			message: 'provider returned too many requests',
			normalizedError: { code: 'rate_limited', retryable: true },
			retryAfterSeconds: 8,
		})

		expect(formatError(err)).toContain('normalized=rate_limited')
		expect(formatError(err)).toContain('retry-after=8s')
	})

	it('prefixes recovery hints with Recommended action in final string', () => {
		const err = new APIError({
			status: 403,
			code: 'forbidden',
			message: 'access denied by policy',
			normalizedError: { code: 'access_denied', retryable: false },
		})

		expect(formatErrorWithHint(err)).toContain('Recommended action:')
		expect(formatErrorWithHint(err)).toContain('Check IAM permissions')
	})

	it('returns remote-access guard guidance for non-access_denied 403 without mentioning ALLOWED_ORIGINS', () => {
		const err = new APIError({
			status: 403,
			code: 'forbidden',
			message: 'host must be localhost',
		})

		const hint = getRecoveryHint(err)
		expect(hint).toContain('ALLOW_REMOTE=true')
		expect(hint).toContain('API_TOKEN')
		expect(hint).not.toContain('ALLOWED_ORIGINS')
	})
})
