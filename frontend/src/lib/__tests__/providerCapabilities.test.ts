import { describe, expect, it } from 'vitest'

import { getProviderCapabilities, getProviderCapabilityReason, getUploadCapabilityDisabledReason } from '../providerCapabilities'

describe('getProviderCapabilities', () => {
	it('uses server-provided capability matrix when available', () => {
		const capability = getProviderCapabilities('s3_compatible', {
			s3_compatible: {
				bucketCrud: true,
				objectCrud: true,
				jobTransfer: true,
				bucketPolicy: false,
				gcsIamPolicy: false,
				azureContainerAccessPolicy: false,
				presignedUpload: false,
				presignedMultipartUpload: false,
				directUpload: true,
				reasons: {
					presignedUpload: 'Presigned upload is disabled for this provider.',
				},
			},
		})

		expect(capability.bucketPolicy).toBe(false)
		expect(capability.directUpload).toBe(true)
		expect(capability.reasons.presignedUpload).toBe('Presigned upload is disabled for this provider.')
	})

	it('falls back to local defaults when server capability is missing', () => {
		const capability = getProviderCapabilities('aws_s3')
		expect(capability.bucketPolicy).toBe(true)
		expect(capability.presignedUpload).toBe(true)
	})

	it('returns all-disabled capability for unknown provider', () => {
		const capability = getProviderCapabilities('unknown_provider' as never)
		expect(capability.bucketCrud).toBe(false)
		expect(capability.objectCrud).toBe(false)
		expect(capability.bucketPolicy).toBe(false)
		expect(capability.reasons.bucketCrud).toBeTruthy()
	})

	it('returns provider-specific reason for disabled capability', () => {
		const capability = getProviderCapabilities('gcp_gcs')
		expect(getProviderCapabilityReason(capability, 'bucketPolicy')).toContain('S3-compatible')
	})

	it('returns upload disabled reason based on first failing capability', () => {
		const capability = {
			...getProviderCapabilities('aws_s3'),
			objectCrud: false,
			reasons: { objectCrud: 'Object API is unavailable.' },
		}
		expect(getUploadCapabilityDisabledReason(capability)).toBe('Object API is unavailable.')
	})
})
