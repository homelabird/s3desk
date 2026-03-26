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
	flags: ProfileFlagViewModel[]
	isActive: boolean
	needsAttention: boolean
	attentionSummary?: string
}

export type ProfileFlagViewModel = {
	label: string
	tone?: 'default' | 'warning'
	title?: string
}

type ProfileWithPublicEndpoint = Profile & { publicEndpoint?: string }
type ProfileWithAzureArm = Profile & {
	subscriptionId?: string
	resourceGroup?: string
	tenantId?: string
	clientId?: string
}

function getPublicEndpoint(profile: Profile | null | undefined): string {
	return (profile as ProfileWithPublicEndpoint | null | undefined)?.publicEndpoint ?? ''
}

const PROFILE_PROVIDER_LABELS: Record<string, string> = {
	aws_s3: 'AWS S3',
	s3_compatible: 'S3 Compatible',
	azure_blob: 'Azure Blob',
	gcp_gcs: 'GCP GCS',
	oci_object_storage: 'OCI Object Storage',
}

function toProfileConnectionViewModel(row: Profile): ProfileConnectionViewModel {
	const provider = row.provider
	if (provider === 'azure_blob') {
		const accountName = row.accountName || ''
		const endpoint = row.endpoint
		const azureRow = row as ProfileWithAzureArm
		const useEmulator = !!row.useEmulator
		const parts: string[] = [useEmulator ? 'emulator' : 'storage account']
		if (endpoint) parts.push(endpoint)
		if (azureRow.resourceGroup) parts.push(`rg ${azureRow.resourceGroup}`)
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
	const publicEndpoint = getPublicEndpoint(row)
	const endpointLabel = endpoint || (provider === 'aws_s3' ? 'AWS default endpoint' : '')
	const secondaryParts = [region, publicEndpoint && publicEndpoint !== endpoint ? `public ${publicEndpoint}` : ''].filter(Boolean)
	return { primary: endpointLabel, secondary: secondaryParts.join(' · ') || undefined }
}

function toProfileAttention(row: Profile): { needsAttention: boolean; attentionSummary?: string } {
	const issues = row.validation?.issues ?? []
	if (row.validation?.valid === false && issues.length > 0) {
		return {
			needsAttention: true,
			attentionSummary: issues.map((issue) => issue.message).join(' '),
		}
	}
	return { needsAttention: false }
}

function toProfileFlags(row: Profile): ProfileFlagViewModel[] {
	const provider = row.provider
	const isS3 = provider === 'aws_s3' || provider === 's3_compatible'
	const parts: ProfileFlagViewModel[] = []
	const attention = toProfileAttention(row)
	if (attention.needsAttention) {
		parts.push({
			label: 'needs-update',
			tone: 'warning',
			title: attention.attentionSummary,
		})
	}
	if (isS3 && 'forcePathStyle' in row) parts.push({ label: row.forcePathStyle ? 'path-style' : 'virtual-host' })
	parts.push({ label: row.preserveLeadingSlash ? 'leading-slash' : 'trim-leading-slash' })
	parts.push(
		row.tlsInsecureSkipVerify
			? {
					label: 'tls-skip',
					tone: 'warning',
					title: 'Certificate verification is disabled for this profile.',
				}
			: { label: 'tls-verify' },
	)
	return parts
}

export function buildProfilesTableRows(profiles: Profile[], activeProfileId: string | null): ProfileTableRowViewModel[] {
	return profiles.map((profile) => ({
		...toProfileAttention(profile),
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
		publicEndpoint: getPublicEndpoint(editProfile),
		region: 'region' in editProfile ? editProfile.region ?? '' : '',
		forcePathStyle: 'forcePathStyle' in editProfile ? editProfile.forcePathStyle ?? false : false,
		preserveLeadingSlash: editProfile.preserveLeadingSlash,
		tlsInsecureSkipVerify: editProfile.tlsInsecureSkipVerify,
		azureAccountName: editProfile.provider === 'azure_blob' ? editProfile.accountName : '',
		azureAccountKey: '',
		azureEndpoint: editProfile.provider === 'azure_blob' ? editProfile.endpoint ?? '' : '',
		azureSubscriptionId: editProfile.provider === 'azure_blob' ? ((editProfile as ProfileWithAzureArm).subscriptionId ?? '') : '',
		azureResourceGroup: editProfile.provider === 'azure_blob' ? ((editProfile as ProfileWithAzureArm).resourceGroup ?? '') : '',
		azureTenantId: editProfile.provider === 'azure_blob' ? ((editProfile as ProfileWithAzureArm).tenantId ?? '') : '',
		azureClientId: editProfile.provider === 'azure_blob' ? ((editProfile as ProfileWithAzureArm).clientId ?? '') : '',
		azureClientSecret: '',
		azureUseEmulator: editProfile.provider === 'azure_blob' ? !!editProfile.useEmulator : false,
		gcpAnonymous: editProfile.provider === 'gcp_gcs' ? !!editProfile.anonymous : false,
		gcpEndpoint: editProfile.provider === 'gcp_gcs' ? editProfile.endpoint ?? '' : '',
		gcpProjectNumber: editProfile.provider === 'gcp_gcs' ? editProfile.projectNumber ?? '' : '',
		gcpServiceAccountJson: '',
		ociNamespace: editProfile.provider === 'oci_object_storage' ? editProfile.namespace : '',
		ociCompartment: editProfile.provider === 'oci_object_storage' ? editProfile.compartment : '',
		ociEndpoint: editProfile.provider === 'oci_object_storage' ? editProfile.endpoint ?? '' : '',
		ociAuthProvider: editProfile.provider === 'oci_object_storage' ? editProfile.authProvider?.trim() || 'user_principal_auth' : '',
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
