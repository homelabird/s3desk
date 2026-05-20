import type { Profile, ProfileCreateRequest, ProfileTLSConfig, ProfileUpdateRequest } from '../../api/types'
import type { ProfileProvider } from './profileTypes'

type ProfileCreateRequestWithPublicEndpoint = ProfileCreateRequest & { publicEndpoint?: string }
type AwsS3CreateRequest = Extract<ProfileCreateRequest, { provider: 'aws_s3' }> & { publicEndpoint?: string }
type S3CompatibleCreateRequest = Extract<ProfileCreateRequest, { provider: 's3_compatible' }> & { publicEndpoint?: string }
type AzureCreateRequest = Extract<ProfileCreateRequest, { provider: 'azure_blob' }>
type GcpCreateRequest = Extract<ProfileCreateRequest, { provider: 'gcp_gcs' }>
type OciCreateRequest = Extract<ProfileCreateRequest, { provider: 'oci_object_storage' }>
type AwsS3UpdateRequest = Extract<ProfileUpdateRequest, { provider: 'aws_s3' }> & { publicEndpoint?: string }
type S3CompatibleUpdateRequest = Extract<ProfileUpdateRequest, { provider: 's3_compatible' }> & { publicEndpoint?: string }
type AzureUpdateRequest = Extract<ProfileUpdateRequest, { provider: 'azure_blob' }>
type GcpUpdateRequest = Extract<ProfileUpdateRequest, { provider: 'gcp_gcs' }>
type OciUpdateRequest = Extract<ProfileUpdateRequest, { provider: 'oci_object_storage' }>

type ProfileYamlProfile = {
	id?: string
	name?: string
	provider?: string
	endpoint?: string
	publicEndpoint?: string
	region?: string
	accessKeyId?: string
	secretAccessKey?: string
	sessionToken?: string | null
	forcePathStyle?: boolean
	accountName?: string
	accountKey?: string
	subscriptionId?: string
	resourceGroup?: string
	tenantId?: string
	clientId?: string
	clientSecret?: string
	useEmulator?: boolean
	serviceAccountJson?: string
	anonymous?: boolean
	projectNumber?: string
	namespace?: string
	compartment?: string
	authProvider?: string
	configFile?: string
	configProfile?: string
	preserveLeadingSlash?: boolean
	tlsInsecureSkipVerify?: boolean
}

type ProfileYamlTLS = {
	mode?: string
	clientCertPem?: string
	clientKeyPem?: string
	caCertPem?: string
}

type ParsedProfileYaml = {
	request: ProfileCreateRequest
	updateRequest: ProfileUpdateRequest
	tlsConfig?: ProfileTLSConfig
	hasTLSBlock: boolean
}

type ParsedProfileYamlUpdate = {
	updateRequest: ProfileUpdateRequest
	tlsConfig?: ProfileTLSConfig
	hasTLSBlock: boolean
}

const PROFILE_PROVIDERS: ProfileProvider[] = [
	'aws_s3',
	's3_compatible',
	'azure_blob',
	'gcp_gcs',
	'oci_object_storage',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isProfileProvider = (value: unknown): value is ProfileProvider =>
	typeof value === 'string' && PROFILE_PROVIDERS.includes(value as ProfileProvider)

const toOptionalString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined)

function extractProfileYaml(raw: unknown): { profile: ProfileYamlProfile; tls?: ProfileYamlTLS } {
	if (!isRecord(raw)) {
		throw new Error('YAML must be an object')
	}
	if ('profile' in raw) {
		const profile = raw.profile
		if (!isRecord(profile)) {
			throw new Error('profile must be an object')
		}
		const tls = 'tls' in raw && isRecord(raw.tls) ? (raw.tls as ProfileYamlTLS) : undefined
		return { profile: profile as ProfileYamlProfile, tls }
	}
	return { profile: raw as ProfileYamlProfile }
}

function inferProvider(profile: ProfileYamlProfile): ProfileProvider {
	if (profile.accountName || profile.accountKey || profile.useEmulator) return 'azure_blob'
	if (profile.serviceAccountJson || profile.anonymous !== undefined || profile.projectNumber) return 'gcp_gcs'
	if (profile.namespace || profile.compartment || profile.authProvider || profile.configFile || profile.configProfile) {
		return 'oci_object_storage'
	}
	if (profile.endpoint) return 's3_compatible'
	return 'aws_s3'
}

export async function parseProfileYaml(yamlText: string): Promise<ParsedProfileYaml> {
	const parsed = await parseProfileYamlInternal(yamlText, 'create')
	if (!parsed.request) {
		throw new Error('profile YAML is missing credentials required for import')
	}
	return {
		request: parsed.request,
		updateRequest: parsed.updateRequest,
		tlsConfig: parsed.tlsConfig,
		hasTLSBlock: parsed.hasTLSBlock,
	}
}

export async function parseProfileYamlForUpdate(yamlText: string): Promise<ParsedProfileYamlUpdate> {
	const parsed = await parseProfileYamlInternal(yamlText, 'update')
	return {
		updateRequest: parsed.updateRequest,
		tlsConfig: parsed.tlsConfig,
		hasTLSBlock: parsed.hasTLSBlock,
	}
}

async function parseProfileYamlInternal(
	yamlText: string,
	mode: 'create' | 'update',
): Promise<{ request?: ProfileCreateRequest; updateRequest: ProfileUpdateRequest; tlsConfig?: ProfileTLSConfig; hasTLSBlock: boolean }> {
	// YAML parsing is an optional Profiles-only feature. Keep it out of the initial bundle.
	const { parse: parseYaml } = await import('yaml')
	const parsed = parseYaml(yamlText) as unknown
	const { profile, tls } = extractProfileYaml(parsed)
	const name = toOptionalString(profile.name)
	if (!name) {
		throw new Error('profile.name is required')
	}
	if (profile.provider === 'oci_s3_compat') {
		throw new Error('oci_s3_compat is no longer offered for new profiles. Use oci_object_storage instead.')
	}

	const provider = isProfileProvider(profile.provider) ? profile.provider : inferProvider(profile)
	const preserveLeadingSlash = profile.preserveLeadingSlash ?? false
	const tlsInsecureSkipVerify = profile.tlsInsecureSkipVerify ?? false

	let request: ProfileCreateRequestWithPublicEndpoint | undefined
	let updateRequest: ProfileUpdateRequest
	switch (provider) {
			case 'azure_blob': {
				const accountName = toOptionalString(profile.accountName)
				const accountKey = toOptionalString(profile.accountKey)
				if (mode === 'create' && (!accountName || !accountKey)) {
					throw new Error('azure_blob requires accountName and accountKey')
				}
				const endpoint = toOptionalString(profile.endpoint)
				const subscriptionId = toOptionalString(profile.subscriptionId)
				const resourceGroup = toOptionalString(profile.resourceGroup)
				const tenantId = toOptionalString(profile.tenantId)
				const clientId = toOptionalString(profile.clientId)
				const clientSecret = toOptionalString(profile.clientSecret)
				const azureUpdate: AzureUpdateRequest = {
					provider: 'azure_blob',
					name,
					endpoint,
					useEmulator: profile.useEmulator ?? false,
					preserveLeadingSlash,
					tlsInsecureSkipVerify,
					...(accountName ? { accountName } : {}),
					...(accountKey ? { accountKey } : {}),
					...(subscriptionId ? { subscriptionId } : {}),
					...(resourceGroup ? { resourceGroup } : {}),
					...(tenantId ? { tenantId } : {}),
					...(clientId ? { clientId } : {}),
					...(clientSecret ? { clientSecret } : {}),
				}
				if (mode === 'create') {
					const azureCreate: AzureCreateRequest = {
						provider: 'azure_blob',
						name,
						accountName: accountName as string,
						accountKey: accountKey as string,
						endpoint,
						useEmulator: profile.useEmulator ?? false,
						preserveLeadingSlash,
						tlsInsecureSkipVerify,
						...(subscriptionId ? { subscriptionId } : {}),
						...(resourceGroup ? { resourceGroup } : {}),
						...(tenantId ? { tenantId } : {}),
						...(clientId ? { clientId } : {}),
						...(clientSecret ? { clientSecret } : {}),
					}
					request = azureCreate
				}
				updateRequest = azureUpdate
				break
			}
			case 'gcp_gcs': {
			const anonymous = profile.anonymous ?? false
			const serviceAccountJson = toOptionalString(profile.serviceAccountJson)
			const projectNumber = toOptionalString(profile.projectNumber)
			if (!projectNumber) {
				throw new Error('gcp_gcs requires projectNumber')
			}
				if (mode === 'create' && !anonymous && !serviceAccountJson) {
					throw new Error('gcp_gcs requires serviceAccountJson unless anonymous=true')
				}
				const endpoint = toOptionalString(profile.endpoint)
				const gcpUpdate: GcpUpdateRequest = {
					provider: 'gcp_gcs',
					name,
					anonymous,
					endpoint,
					projectNumber,
					preserveLeadingSlash,
					tlsInsecureSkipVerify,
					...(serviceAccountJson ? { serviceAccountJson } : {}),
				}
				if (mode === 'create') {
					const gcpCreate: GcpCreateRequest = {
						provider: 'gcp_gcs',
						name,
						anonymous,
						endpoint,
						projectNumber,
						preserveLeadingSlash,
						tlsInsecureSkipVerify,
						serviceAccountJson: anonymous ? '' : serviceAccountJson,
					}
					request = gcpCreate
				}
				updateRequest = gcpUpdate
				break
			}
			case 'oci_object_storage': {
			const region = toOptionalString(profile.region)
			const namespace = toOptionalString(profile.namespace)
			const compartment = toOptionalString(profile.compartment)
				if (!region || !namespace || !compartment) {
					throw new Error('oci_object_storage requires region, namespace, and compartment')
				}
				const endpoint = toOptionalString(profile.endpoint)
				const authProvider = toOptionalString(profile.authProvider)
				const configFile = toOptionalString(profile.configFile)
				const configProfile = toOptionalString(profile.configProfile)
				const ociUpdate: OciUpdateRequest = {
					provider: 'oci_object_storage',
					name,
					region,
					namespace,
					compartment,
					endpoint,
					authProvider,
					configFile,
					configProfile,
					preserveLeadingSlash,
					tlsInsecureSkipVerify,
				}
				const ociCreate: OciCreateRequest = {
					provider: 'oci_object_storage',
					name,
					region,
					namespace,
					compartment,
					endpoint,
					authProvider,
					configFile,
					configProfile,
					preserveLeadingSlash,
					tlsInsecureSkipVerify,
				}
				request = ociCreate
				updateRequest = ociUpdate
				break
			}
			default: {
			const region = toOptionalString(profile.region)
			const accessKeyId = toOptionalString(profile.accessKeyId)
			const secretAccessKey = toOptionalString(profile.secretAccessKey)
			if (!region || !accessKeyId || (mode === 'create' && !secretAccessKey)) {
				throw new Error(`${provider} requires region, accessKeyId, and secretAccessKey`)
			}
			const endpoint = toOptionalString(profile.endpoint)
			const publicEndpoint = toOptionalString(profile.publicEndpoint)
			if (provider === 's3_compatible' && !endpoint) {
				throw new Error(`${provider} requires endpoint`)
			}
			const updateBase = {
				name,
				region,
				accessKeyId,
				forcePathStyle: profile.forcePathStyle ?? false,
				preserveLeadingSlash,
				tlsInsecureSkipVerify,
				...(secretAccessKey ? { secretAccessKey } : {}),
				...(profile.sessionToken !== undefined ? { sessionToken: profile.sessionToken } : {}),
			}
				if (provider === 'aws_s3') {
					const awsUpdate: AwsS3UpdateRequest = {
						provider: 'aws_s3',
						...updateBase,
						endpoint,
						...(publicEndpoint ? { publicEndpoint } : {}),
					}
					if (mode === 'create') {
						const awsCreate: AwsS3CreateRequest = {
							provider: 'aws_s3',
							name,
							endpoint,
							region,
							accessKeyId,
							secretAccessKey: secretAccessKey as string,
							sessionToken: profile.sessionToken ?? null,
							forcePathStyle: profile.forcePathStyle ?? false,
							preserveLeadingSlash,
							tlsInsecureSkipVerify,
							...(publicEndpoint ? { publicEndpoint } : {}),
						}
						request = awsCreate
					}
					updateRequest = awsUpdate
				} else {
					const s3Update: S3CompatibleUpdateRequest = {
						provider: 's3_compatible',
						...updateBase,
						endpoint: endpoint as string,
						...(publicEndpoint ? { publicEndpoint } : {}),
					}
					if (mode === 'create') {
						const s3Create: S3CompatibleCreateRequest = {
							provider: 's3_compatible',
							name,
							endpoint: endpoint as string,
							region,
							accessKeyId,
							secretAccessKey: secretAccessKey as string,
							sessionToken: profile.sessionToken ?? null,
							forcePathStyle: profile.forcePathStyle ?? false,
							preserveLeadingSlash,
							tlsInsecureSkipVerify,
							...(publicEndpoint ? { publicEndpoint } : {}),
						}
						request = s3Create
					}
					updateRequest = s3Update
				}
			}
		}

	const tlsMode = typeof tls?.mode === 'string' ? tls.mode : ''
	const tlsConfig =
		tlsMode === 'mtls'
			? {
					mode: 'mtls' as const,
					clientCertPem: toOptionalString(tls?.clientCertPem),
					clientKeyPem: toOptionalString(tls?.clientKeyPem),
					caCertPem: toOptionalString(tls?.caCertPem),
				}
			: undefined

	if (tlsConfig) {
		if (!tlsConfig.clientCertPem || !tlsConfig.clientKeyPem) {
			throw new Error('tls.mode=mtls requires clientCertPem and clientKeyPem')
		}
	}

	return {
		request,
		updateRequest,
		tlsConfig,
		hasTLSBlock: !!tls,
	}
}

export function buildProfileExportFilename(profile: Profile | null): string {
	const base = sanitizeExportFilename(profile?.name ?? profile?.id ?? '')
	return `${base || 'profile'}.yaml`
}

export function sanitizeExportFilename(value: string): string {
	const cleaned = value.trim()
	if (!cleaned) return ''
	return cleaned
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, '_')
		.replace(/-+/g, '-')
		.replace(/_+/g, '_')
		.replace(/[-_]+$/g, '')
		.replace(/^[-_]+/g, '')
}
