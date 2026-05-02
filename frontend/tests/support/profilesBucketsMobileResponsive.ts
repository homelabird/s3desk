import type { Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture, type ApiFixture } from './apiFixtures'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
}

type FixtureOptions = {
	profileProvider?: 'aws_s3' | 's3_compatible' | 'gcp_gcs' | 'azure_blob' | 'oci_object_storage'
	profiles?: Array<Record<string, unknown>>
	buckets?: Array<Record<string, unknown>>
	bucketPolicy?: Record<string, unknown> | null
	bucketGovernance?: Record<string, unknown> | null
	deleteBucketError?: {
		bucketName: string
		status?: number
		code: string
		message: string
	}
}

const defaultStorage: StorageSeed = {
	apiToken: 'profiles-buckets-mobile-token',
	profileId: 'profiles-buckets-mobile-profile',
	bucket: 'responsive-bucket',
}

const now = '2024-01-01T00:00:00Z'

export function buildAwsGovernanceFixture(bucketName: string) {
	return {
		provider: 'aws_s3',
		bucket: bucketName,
		capabilities: {
			bucket_public_access_block: { enabled: true },
			bucket_object_ownership: { enabled: true },
			bucket_versioning: { enabled: true },
			bucket_default_encryption: { enabled: true },
			bucket_lifecycle: { enabled: true },
		},
		publicExposure: {
			provider: 'aws_s3',
			bucket: bucketName,
			mode: 'private',
			blockPublicAccess: {
				blockPublicAcls: true,
				ignorePublicAcls: true,
				blockPublicPolicy: true,
				restrictPublicBuckets: true,
			},
		},
		access: {
			provider: 'aws_s3',
			bucket: bucketName,
			objectOwnership: {
				supported: true,
				mode: 'bucket_owner_enforced',
			},
		},
		versioning: {
			provider: 'aws_s3',
			bucket: bucketName,
			status: 'enabled',
		},
		encryption: {
			provider: 'aws_s3',
			bucket: bucketName,
			mode: 'sse_s3',
		},
		lifecycle: {
			provider: 'aws_s3',
			bucket: bucketName,
			rules: [],
		},
		advanced: {
			rawPolicySupported: true,
			rawPolicyEditable: true,
		},
	}
}

export function buildGcsGovernanceFixture(bucketName: string) {
	return {
		provider: 'gcp_gcs',
		bucket: bucketName,
		capabilities: {
			bucket_access_bindings: { enabled: true },
			bucket_access_public_toggle: { enabled: true },
			bucket_public_access_prevention: { enabled: true },
			bucket_uniform_access: { enabled: true },
			bucket_versioning: { enabled: true },
			bucket_retention: { enabled: true },
		},
		publicExposure: {
			provider: 'gcp_gcs',
			bucket: bucketName,
			mode: 'private',
			publicAccessPrevention: false,
		},
		access: {
			provider: 'gcp_gcs',
			bucket: bucketName,
			etag: 'etag-before',
			bindings: [
				{
					role: 'roles/storage.objectViewer',
					members: ['user:dev@example.com'],
				},
			],
		},
		protection: {
			provider: 'gcp_gcs',
			bucket: bucketName,
			uniformAccess: true,
			retention: { enabled: true, days: 30 },
		},
		versioning: {
			provider: 'gcp_gcs',
			bucket: bucketName,
			status: 'enabled',
		},
	}
}

export function buildGcsLockedRetentionGovernanceFixture(bucketName: string) {
	const governance = buildGcsGovernanceFixture(bucketName)
	return {
		...governance,
		protection: {
			...governance.protection,
			retention: {
				days: 30,
				enabled: true,
				locked: true,
				retainUntil: '2026-04-01T00:00:00Z',
			},
			warnings: ['Locked GCS retention policies are read-only from this controls surface.'],
		},
	}
}

export function buildAzureGovernanceFixture(bucketName: string) {
	return {
		provider: 'azure_blob',
		bucket: bucketName,
		capabilities: {
			bucket_access_public_toggle: { enabled: true },
			bucket_stored_access_policy: { enabled: true },
			bucket_versioning: { enabled: true },
			bucket_soft_delete: { enabled: true },
			bucket_immutability: { enabled: true },
		},
		publicExposure: {
			provider: 'azure_blob',
			bucket: bucketName,
			mode: 'private',
			visibility: 'private',
		},
		access: {
			provider: 'azure_blob',
			bucket: bucketName,
			storedAccessPolicies: [],
		},
		protection: {
			provider: 'azure_blob',
			bucket: bucketName,
			softDelete: { enabled: true, days: 7 },
			immutability: { enabled: false, editable: true },
		},
		versioning: {
			provider: 'azure_blob',
			bucket: bucketName,
			status: 'disabled',
		},
	}
}

export function buildAzureImmutabilityWarningGovernanceFixture(bucketName: string) {
	const governance = buildAzureGovernanceFixture(bucketName)
	return {
		...governance,
		protection: {
			...governance.protection,
			immutability: {
				enabled: true,
				days: 30,
				editable: true,
				legalHold: true,
				mode: 'locked',
				until: '2026-04-01T00:00:00Z',
			},
		},
	}
}

export function buildOciGovernanceFixture(bucketName: string) {
	return {
		provider: 'oci_object_storage',
		bucket: bucketName,
		capabilities: {
			bucket_public_access: { enabled: true },
			bucket_versioning: { enabled: true },
			bucket_retention: { enabled: true },
			bucket_preauthenticated_requests: { enabled: true },
		},
		warnings: ['OCI tenancy policy was loaded with provider warnings.'],
		publicExposure: {
			provider: 'oci_object_storage',
			bucket: bucketName,
			visibility: 'object_read_without_list',
			warnings: ['Public object access is enabled for selected objects.'],
		},
		versioning: {
			provider: 'oci_object_storage',
			bucket: bucketName,
			status: 'disabled',
			warnings: ['Versioning is currently disabled for this bucket.'],
		},
		protection: {
			provider: 'oci_object_storage',
			bucket: bucketName,
			retention: {
				enabled: true,
				rules: [
					{
						id: 'rule-1',
						displayName: 'Locked archive rule',
						days: 90,
						locked: true,
						timeModified: now,
					},
				],
			},
			warnings: ['Locked retention rules can only be extended.'],
		},
		sharing: {
			provider: 'oci_object_storage',
			bucket: bucketName,
			preauthenticatedSupport: true,
			preauthenticatedRequests: [
				{
					id: 'par-1',
					name: 'Read demo',
					accessType: 'AnyObjectRead',
					bucketListingAction: 'Deny',
					objectName: '',
					timeCreated: now,
					timeExpires: '2026-04-10T00:00:00Z',
					accessUri: 'https://objectstorage.example/p/read-demo',
				},
			],
			warnings: ['Existing PAR links cannot be edited in place.'],
		},
	}
}

export async function seedProfilesBucketsMobileResponsiveStorage(page: Page, overrides: Partial<StorageSeed> = {}) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

export async function installProfilesBucketsMobileResponsiveFixtures(page: Page, options: FixtureOptions = {}) {
	const provider = options.profileProvider ?? 's3_compatible'
	const primaryBucket = String(options.buckets?.[0]?.name ?? defaultStorage.bucket)
	const profiles = options.profiles ?? [
		{
			id: defaultStorage.profileId,
			name: 'Responsive Profile',
			provider,
			endpoint: 'http://localhost:9000',
			region: 'us-east-1',
			forcePathStyle: true,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: true,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: 'profiles-buckets-mobile-secondary',
			name: 'Backup Profile',
			provider,
			endpoint: 'http://localhost:9001',
			region: 'us-east-1',
			forcePathStyle: true,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: true,
			createdAt: now,
			updatedAt: now,
		},
	]
	const buckets = options.buckets ?? [
		{ name: defaultStorage.bucket, createdAt: now },
		{ name: 'logs-bucket', createdAt: now },
	]

	const fixtures: ApiFixture[] = [
		jsonFixture(
			'GET',
			'/api/v1/meta',
			metaJson({
				dataDir: '/tmp',
				staticDir: '/tmp',
				capabilities: { profileTls: { enabled: false, reason: 'test' }, providers: {} },
				allowedLocalDirs: [],
				uploadSessionTTLSeconds: 86400,
				uploadDirectStream: false,
				transferEngine: {
					name: 'rclone',
					available: true,
					compatible: true,
					minVersion: 'v1.66.0',
					path: '/usr/local/bin/rclone',
					version: 'v1.66.0',
				},
			}),
		),
		jsonFixture('GET', '/api/v1/profiles', profiles),
		jsonFixture('GET', '/api/v1/buckets', buckets),
		jsonFixture('GET', '/api/v1/jobs', { items: [], nextCursor: null }),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	]

	fixtures.push(
		jsonFixture('GET', `/api/v1/buckets/${encodeURIComponent(primaryBucket)}/policy`, {
			bucket: primaryBucket,
			exists: !!options.bucketPolicy,
			policy: options.bucketPolicy ?? null,
		}),
	)

	if (options.bucketGovernance) {
		fixtures.push(
			jsonFixture('GET', `/api/v1/buckets/${encodeURIComponent(primaryBucket)}/governance`, options.bucketGovernance),
		)
	}

	if (options.deleteBucketError) {
		fixtures.push({
			method: 'DELETE',
			path: `/api/v1/buckets/${encodeURIComponent(options.deleteBucketError.bucketName)}`,
			handler: () => ({
				status: options.deleteBucketError?.status ?? 409,
				json: {
					error: {
						code: options.deleteBucketError.code,
						message: options.deleteBucketError.message,
					},
				},
			}),
		})
	}

	await installApiFixtures(page, fixtures)
}
