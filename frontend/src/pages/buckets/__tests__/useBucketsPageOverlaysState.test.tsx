import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Profile } from '../../../api/types'
import type { ProviderCapabilityMatrix } from '../../../lib/providerCapabilities'
import { useBucketsPageOverlaysState } from '../useBucketsPageOverlaysState'

function buildCapabilities(overrides: Partial<ProviderCapabilityMatrix> = {}): ProviderCapabilityMatrix {
	return {
		bucketCrud: true,
		objectCrud: true,
		jobTransfer: true,
		bucketPolicy: false,
		gcsIamPolicy: false,
		azureContainerAccessPolicy: false,
		presignedUpload: false,
		presignedMultipartUpload: false,
		directUpload: false,
		reasons: {},
		...overrides,
	}
}

function buildS3CompatibleProfile(): Profile {
	return {
		id: 'profile-1',
		name: 'Primary Profile',
		provider: 's3_compatible',
		endpoint: 'http://127.0.0.1:9000',
		region: 'us-east-1',
		forcePathStyle: false,
		preserveLeadingSlash: false,
		tlsInsecureSkipVerify: false,
		createdAt: '2026-04-08T00:00:00Z',
		updatedAt: '2026-04-08T00:00:00Z',
	} as Profile
}

function buildGcsProfile(): Profile {
	return {
		id: 'profile-1',
		name: 'Primary Profile',
		provider: 'gcp_gcs',
		projectNumber: '123456789',
		endpoint: '',
		anonymous: false,
		preserveLeadingSlash: false,
		tlsInsecureSkipVerify: false,
		createdAt: '2026-04-08T00:00:00Z',
		updatedAt: '2026-04-08T00:00:00Z',
	} as Profile
}

function buildAwsProfile(): Profile {
	return {
		id: 'profile-1',
		name: 'Primary Profile',
		provider: 'aws_s3',
		region: 'us-east-1',
		preserveLeadingSlash: false,
		tlsInsecureSkipVerify: false,
		createdAt: '2026-04-08T00:00:00Z',
		updatedAt: '2026-04-08T00:00:00Z',
	} as Profile
}

describe('useBucketsPageOverlaysState', () => {
	it('derives provider-aware policy and controls support', () => {
		const { result, rerender } = renderHook(
			(props: { profile: Profile | null; capabilities: ProviderCapabilityMatrix | null }) =>
				useBucketsPageOverlaysState({
					currentScopeKey: 'token-a:profile-1',
					selectedProfile: props.profile,
					capabilities: props.capabilities,
				}),
			{
				initialProps: {
					profile: buildGcsProfile(),
					capabilities: buildCapabilities({
						bucketPolicy: false,
						gcsIamPolicy: true,
						reasons: { bucketPolicy: 'S3 only' },
					}),
				},
			},
		)

		expect(result.current.policySupported).toBe(true)
		expect(result.current.controlsSupported).toBe(true)

		rerender({
			profile: buildS3CompatibleProfile(),
			capabilities: buildCapabilities({
				bucketPolicy: false,
				gcsIamPolicy: false,
				azureContainerAccessPolicy: false,
				reasons: { bucketPolicy: 'Unsupported here' },
			}),
		})

		expect(result.current.policySupported).toBe(false)
		expect(result.current.policyUnsupportedReason).toBe('Unsupported here')
		expect(result.current.controlsSupported).toBe(false)
		expect(result.current.controlsUnsupportedReason).toBe(
			'Typed controls are available for AWS S3, GCS, Azure Blob, and OCI summary views.',
		)
	})

	it('keeps policy and controls overlays mutually exclusive', () => {
		const { result } = renderHook(() =>
				useBucketsPageOverlaysState({
					currentScopeKey: 'token-a:profile-1',
					selectedProfile: buildAwsProfile(),
					capabilities: buildCapabilities({ bucketPolicy: true }),
				}),
		)

		act(() => {
			result.current.openPolicyModal('primary-bucket')
		})

		expect(result.current.policyBucket).toBe('primary-bucket')
		expect(result.current.controlsBucket).toBe(null)

		act(() => {
			result.current.openControlsModal('primary-bucket')
		})

		expect(result.current.policyBucket).toBe(null)
		expect(result.current.controlsBucket).toBe('primary-bucket')
	})

	it('hides stale overlay state after the scope changes', () => {
		const { result, rerender } = renderHook(
			(props: { currentScopeKey: string }) =>
				useBucketsPageOverlaysState({
					currentScopeKey: props.currentScopeKey,
					selectedProfile: buildAwsProfile(),
					capabilities: buildCapabilities({ bucketPolicy: true }),
				}),
			{
				initialProps: { currentScopeKey: 'token-a:profile-1' },
			},
		)

		act(() => {
			result.current.openPolicyModal('primary-bucket')
		})

		expect(result.current.policyBucket).toBe('primary-bucket')

		rerender({ currentScopeKey: 'token-b:profile-1' })

		expect(result.current.policyBucket).toBe(null)
		expect(result.current.controlsBucket).toBe(null)
	})
})
