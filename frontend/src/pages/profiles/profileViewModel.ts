import type { Profile } from '../../api/types'
import type { ProfileFormValues } from './profileTypes'

export type ProfileConnectionViewModel = {
	primary: string
	secondary?: string
}

export type ProfileTableRowViewModel = {
	profile: Profile
	providerLabel: string
	connection: ProfileConnectionViewModel
	flags: string[]
	isActive: boolean
}

const PROFILE_PROVIDER_LABELS: Record<string, string> = {
	aws_s3: 'AWS S3',
	s3_compatible: 'S3 Compatible',
	oci_s3_compat: 'OCI S3 Compat',
	azure_blob: 'Azure Blob',
	gcp_gcs: 'GCP GCS',
	oci_object_storage: 'OCI Object Storage',
}

function toProfileConnectionViewModel(row: Profile): ProfileConnectionViewModel {
	const provider = row.provider
	if (provider === 'azure_blob') {
		const accountName = row.accountName || ''
		const endpoint = row.endpoint
		const useEmulator = !!row.useEmulator
		const parts: string[] = [useEmulator ? 'emulator' : 'storage account']
		if (endpoint) parts.push(endpoint)
		return { primary: accountName, secondary: parts.join(' · ') }
	}
	if (provider === 'gcp_gcs') {
		const projectId = row.projectId
		const clientEmail = row.clientEmail
		const endpoint = row.endpoint
		const primary = projectId || clientEmail || ''
		const secondary = endpoint || (projectId && clientEmail ? clientEmail : '') || undefined
		return { primary, secondary }
	}
	if (provider === 'oci_object_storage') {
		const namespace = row.namespace
		const compartment = row.compartment
		const region = row.region
		const endpoint = row.endpoint
		const top = namespace || endpoint || ''
		const bottomParts: string[] = []
		if (region) bottomParts.push(region)
		if (compartment) bottomParts.push(compartment)
		return { primary: top, secondary: bottomParts.join(' · ') || undefined }
	}
	const endpoint = 'endpoint' in row ? row.endpoint ?? '' : ''
	const region = 'region' in row ? row.region ?? '' : ''
	const endpointLabel = endpoint || (provider === 'aws_s3' ? 'AWS default endpoint' : '')
	return { primary: endpointLabel, secondary: region || undefined }
}

function toProfileFlags(row: Profile): string[] {
	const provider = row.provider
	const isS3 = provider === 'aws_s3' || provider === 's3_compatible' || provider === 'oci_s3_compat'
	const parts: string[] = []
	if (isS3 && 'forcePathStyle' in row) parts.push(row.forcePathStyle ? 'path-style' : 'virtual-host')
	parts.push(row.preserveLeadingSlash ? 'leading-slash' : 'trim-leading-slash')
	parts.push(row.tlsInsecureSkipVerify ? 'tls-skip' : 'tls-verify')
	return parts
}

export function buildProfilesTableRows(profiles: Profile[], activeProfileId: string | null): ProfileTableRowViewModel[] {
	return profiles.map((profile) => ({
		profile,
		providerLabel: profile.provider ? PROFILE_PROVIDER_LABELS[profile.provider] || profile.provider : 'unknown',
		connection: toProfileConnectionViewModel(profile),
		flags: toProfileFlags(profile),
		isActive: activeProfileId === profile.id,
	}))
}

export function toProfileEditInitialValues(editProfile: Profile | null): Partial<ProfileFormValues> | undefined {
	if (!editProfile) return undefined
	return {
		provider: editProfile.provider,
		name: editProfile.name,
		endpoint: 'endpoint' in editProfile ? editProfile.endpoint ?? '' : '',
		region: 'region' in editProfile ? editProfile.region ?? '' : '',
		forcePathStyle: 'forcePathStyle' in editProfile ? editProfile.forcePathStyle ?? false : false,
		preserveLeadingSlash: editProfile.preserveLeadingSlash,
		tlsInsecureSkipVerify: editProfile.tlsInsecureSkipVerify,
		azureAccountName: editProfile.provider === 'azure_blob' ? editProfile.accountName : '',
		azureAccountKey: '',
		azureEndpoint: editProfile.provider === 'azure_blob' ? editProfile.endpoint ?? '' : '',
		azureUseEmulator: editProfile.provider === 'azure_blob' ? !!editProfile.useEmulator : false,
		gcpAnonymous: editProfile.provider === 'gcp_gcs' ? !!editProfile.anonymous : false,
		gcpEndpoint: editProfile.provider === 'gcp_gcs' ? editProfile.endpoint ?? '' : '',
		gcpProjectNumber: editProfile.provider === 'gcp_gcs' ? editProfile.projectNumber ?? '' : '',
		gcpServiceAccountJson: '',
		ociNamespace: editProfile.provider === 'oci_object_storage' ? editProfile.namespace : '',
		ociCompartment: editProfile.provider === 'oci_object_storage' ? editProfile.compartment : '',
		ociEndpoint: editProfile.provider === 'oci_object_storage' ? editProfile.endpoint ?? '' : '',
		ociAuthProvider: editProfile.provider === 'oci_object_storage' ? editProfile.authProvider ?? '' : '',
		ociConfigFile: editProfile.provider === 'oci_object_storage' ? editProfile.configFile ?? '' : '',
		ociConfigProfile: editProfile.provider === 'oci_object_storage' ? editProfile.configProfile ?? '' : '',
	}
}

export function formatBps(bps: number): string {
	if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(1)} Gbps`
	if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
	if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`
	return `${bps} bps`
}
