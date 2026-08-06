import type { MetaResponse, Profile } from '../api/types'
import {
	getProviderCapabilities,
	getProviderCapabilityReason,
	getUploadCapabilityDisabledReason,
	type ProviderCapabilityMatrix,
} from './providerCapabilities'

export type ProfileCapabilityContext = {
	selectedProfile: Profile | null
	capabilities: ProviderCapabilityMatrix | null
	bucketCrudSupported: boolean
	bucketCrudUnsupportedReason: string
	objectCrudSupported: boolean
	uploadSupported: boolean
	uploadDisabledReason: string | null
}

type BuildProfileCapabilityContextArgs = {
	profiles?: Profile[] | null
	profileId?: string | null
	meta?: MetaResponse | null
	bucketCrudFallbackReason?: string
}

export function selectProfileById(
	profiles: Profile[] | null | undefined,
	profileId: string | null | undefined,
): Profile | null {
	if (!profileId) return null
	return profiles?.find((profile) => profile.id === profileId) ?? null
}

export function buildProfileCapabilityContext({
	profiles,
	profileId,
	meta,
	bucketCrudFallbackReason = 'Bucket operations are not supported by this profile.',
}: BuildProfileCapabilityContextArgs): ProfileCapabilityContext {
	const selectedProfile = selectProfileById(profiles, profileId)
	const capabilities = selectedProfile
		? getProviderCapabilities(selectedProfile.provider, meta?.capabilities?.providers, selectedProfile)
		: null
	const bucketCrudSupported = capabilities?.bucketCrud ?? true
	const objectCrudSupported = capabilities?.objectCrud ?? true
	const uploadSupported = capabilities ? capabilities.objectCrud && capabilities.jobTransfer : true

	return {
		selectedProfile,
		capabilities,
		bucketCrudSupported,
		bucketCrudUnsupportedReason:
			getProviderCapabilityReason(capabilities, 'bucketCrud') ?? bucketCrudFallbackReason,
		objectCrudSupported,
		uploadSupported,
		uploadDisabledReason: getUploadCapabilityDisabledReason(capabilities),
	}
}

export function buildUploadCapabilityByProfileId(
	profiles: Profile[] | null | undefined,
	meta: MetaResponse | null | undefined,
): Record<string, { presignedUpload: boolean; directUpload: boolean; directMultipartUpload: boolean }> {
	const out: Record<string, { presignedUpload: boolean; directUpload: boolean; directMultipartUpload: boolean }> = {}
	const providerMatrix = meta?.capabilities?.providers
	for (const profile of profiles ?? []) {
		if (!profile.provider) continue
		const capability = getProviderCapabilities(profile.provider, providerMatrix, profile)
		out[profile.id] = {
			presignedUpload: capability.presignedUpload,
			directUpload: capability.directUpload,
			directMultipartUpload: capability.presignedMultipartUpload,
		}
	}
	return out
}
