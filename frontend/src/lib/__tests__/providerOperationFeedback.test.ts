import { APIError } from '../../api/client'
import { describe, expect, it } from 'vitest'

import {
	formatProviderOperationFailureMessage,
	formatUnavailableOperationMessage,
	formatValidationOperationMessage,
} from '../providerOperationFeedback'

describe('providerOperationFeedback', () => {
	it('formats provider failure messages with normalized troubleshooting hints', () => {
		const result = formatProviderOperationFailureMessage({
			defaultMessage: 'Profile test failed',
			message: 'failed',
			errorDetail: 'AccessDenied',
			normalizedError: { code: 'access_denied', retryable: false },
			extraDetails: ['type: s3-compatible', 'buckets: 0'],
		})

		expect(result).toEqual({
			content:
				'failed (type: s3-compatible, buckets: 0, error: AccessDenied, code: access_denied) · The credentials are valid but lack permission. Check IAM policies or bucket permissions.',
			duration: 8,
		})
	})

	it('formats unavailable operation messages from API errors with recovery hints', () => {
		const result = formatUnavailableOperationMessage(
			'Benchmark unavailable',
			new APIError({
				status: 400,
				code: 'transfer_engine_missing',
				message: 'rclone is required to run benchmarks (install it or set RCLONE_PATH)',
			}),
		)

		expect(result).toEqual({
			content:
				'Benchmark unavailable: transfer_engine_missing: rclone is required to run benchmarks (install it or set RCLONE_PATH) · Recommended action: Transfer engine (rclone) not found. Install rclone or set RCLONE_PATH on the server.',
			duration: 8,
		})
	})

	it('formats validation warnings with counts and first issue', () => {
		const result = formatValidationOperationMessage({
			successMessage: 'Validation OK',
			failureMessage: 'Validation found issues',
			ok: false,
			errors: ['Missing Principal', 'Unknown action'],
			warnings: ['Statement will be ignored'],
		})

		expect(result).toEqual({
			content: 'Validation found issues (2 error(s) · 1 warning(s) · Missing Principal)',
			duration: 8,
		})
	})
})
