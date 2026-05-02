import { describe, expect, it } from 'vitest'

import type { MetaResponse, Profile } from '../../api/types'
import {
	buildProfileCapabilityContext,
	buildUploadCapabilityByProfileId,
	selectProfileById,
} from '../profileCapabilityContext'

type MetaOverrides = Omit<Partial<MetaResponse>, 'capabilities'> & {
	capabilities?: Partial<MetaResponse['capabilities']>
}

function buildMeta(overrides: MetaOverrides = {}): MetaResponse {
	const base: MetaResponse = {
		version: 'test',
		serverAddr: '127.0.0.1:8080',
		dataDir: '/data',
		dbBackend: 'sqlite',
		staticDir: '/app/ui',
		apiTokenEnabled: true,
		encryptionEnabled: false,
		capabilities: {
			profileTls: { enabled: false, reason: 'disabled' },
			serverBackup: {
				export: { enabled: true, reason: '' },
				restoreStaging: { enabled: true, reason: '' },
			},
			providers: {},
		},
		allowedLocalDirs: [],
		jobConcurrency: 1,
		uploadSessionTTLSeconds: 3600,
		uploadDirectStream: false,
		transferEngine: {
			name: 'rclone',
			available: true,
			compatible: true,
			minVersion: '1.52.0',
			path: '/usr/bin/rclone',
			version: 'v1.66.0',
		},
	}
	return {
		...base,
		...overrides,
		capabilities: {
			...base.capabilities,
			...overrides.capabilities,
		},
	}
}

function buildProfile(overrides: Partial<Profile> = {}): Profile {
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
		...overrides,
	} as Profile
}

describe('profileCapabilityContext', () => {
	it('selects a profile by id without deriving fallback policy in page hooks', () => {
		const primary = buildProfile({ id: 'profile-1', name: 'Primary' })
		const secondary = buildProfile({ id: 'profile-2', name: 'Secondary' })

		expect(selectProfileById([primary, secondary], 'profile-2')).toBe(secondary)
		expect(selectProfileById([primary], 'missing')).toBeNull()
		expect(selectProfileById([primary], null)).toBeNull()
	})

	it('derives shared upload and bucket capability state from server metadata', () => {
		const context = buildProfileCapabilityContext({
			profiles: [buildProfile({ id: 'profile-1' })],
			profileId: 'profile-1',
			meta: buildMeta({
				capabilities: {
					profileTls: { enabled: false, reason: 'disabled' },
					providers: {
						s3_compatible: {
							bucketCrud: false,
							objectCrud: true,
							jobTransfer: false,
							bucketPolicy: true,
							gcsIamPolicy: false,
							azureContainerAccessPolicy: false,
							presignedUpload: true,
							presignedMultipartUpload: true,
							directUpload: false,
							reasons: {
								bucketCrud: 'Bucket APIs are disabled.',
								jobTransfer: 'Transfer jobs are disabled.',
							},
						},
					},
				},
			}),
		})

		expect(context.selectedProfile?.id).toBe('profile-1')
		expect(context.bucketCrudSupported).toBe(false)
		expect(context.bucketCrudUnsupportedReason).toBe('Bucket APIs are disabled.')
		expect(context.objectCrudSupported).toBe(true)
		expect(context.uploadSupported).toBe(false)
		expect(context.uploadDisabledReason).toBe('Transfer jobs are disabled.')
	})

	it('keeps no-profile page defaults permissive until the profile gate resolves', () => {
		const context = buildProfileCapabilityContext({
			profiles: [buildProfile({ id: 'profile-1' })],
			profileId: null,
			meta: buildMeta(),
		})

		expect(context.selectedProfile).toBeNull()
		expect(context.capabilities).toBeNull()
		expect(context.bucketCrudSupported).toBe(true)
		expect(context.objectCrudSupported).toBe(true)
		expect(context.uploadSupported).toBe(true)
		expect(context.uploadDisabledReason).toBeNull()
	})

	it('builds the shell upload capability map with profile overrides', () => {
		const profiles = [
			buildProfile({ id: 'aws', provider: 'aws_s3' }),
			buildProfile({
				id: 'gcs',
				provider: 'gcp_gcs',
				effectiveCapabilities: {
					bucketCrud: true,
					objectCrud: true,
					jobTransfer: true,
					bucketPolicy: false,
					gcsIamPolicy: true,
					azureContainerAccessPolicy: false,
					presignedUpload: false,
					presignedMultipartUpload: false,
					directUpload: true,
					reasons: {},
				},
			}),
		]

		expect(buildUploadCapabilityByProfileId(profiles, buildMeta())).toEqual({
			aws: {
				presignedUpload: true,
				directUpload: false,
			},
			gcs: {
				presignedUpload: false,
				directUpload: true,
			},
		})
	})
})
