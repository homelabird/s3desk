import { describe, expect, it } from 'vitest'

import type { Profile } from '../../api/types'
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

	it('prefers profile effective capabilities when present', () => {
		const capability = getProviderCapabilities(
			'gcp_gcs',
			{
				gcp_gcs: {
					bucketCrud: true,
					objectCrud: true,
					jobTransfer: true,
					bucketPolicy: false,
					gcsIamPolicy: true,
					azureContainerAccessPolicy: false,
					presignedUpload: false,
					presignedMultipartUpload: false,
					directUpload: false,
					reasons: {},
				},
			},
			{
				id: 'p1',
				name: 'Legacy GCS',
				provider: 'gcp_gcs',
				anonymous: false,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
				effectiveCapabilities: {
					bucketCrud: false,
					objectCrud: true,
					jobTransfer: true,
					bucketPolicy: false,
					gcsIamPolicy: true,
					azureContainerAccessPolicy: false,
					presignedUpload: false,
					presignedMultipartUpload: false,
					directUpload: false,
					reasons: {
						bucketCrud: 'server says project number is missing',
					},
				},
			},
		)

		expect(capability.bucketCrud).toBe(false)
		expect(capability.reasons.bucketCrud).toBe('server says project number is missing')
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

	it('disables gcs bucket CRUD when project number is missing on the selected profile', () => {
		const profile: Profile = {
			id: 'p1',
			name: 'GCS',
			provider: 'gcp_gcs',
			anonymous: false,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		}
		const capability = getProviderCapabilities('gcp_gcs', undefined, {
			...profile,
		})

		expect(capability.bucketCrud).toBe(false)
		expect(getProviderCapabilityReason(capability, 'bucketCrud')).toContain('Project Number')
	})

	it('disables gcs iam policy for anonymous default-endpoint profiles', () => {
		const profile: Profile = {
			id: 'p1',
			name: 'GCS',
			provider: 'gcp_gcs',
			anonymous: true,
			projectNumber: '123456789012',
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		}
		const capability = getProviderCapabilities('gcp_gcs', undefined, profile)

		expect(capability.gcsIamPolicy).toBe(false)
		expect(getProviderCapabilityReason(capability, 'gcsIamPolicy')).toContain('anonymous')
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
