import type { Profile, ProfileCreateRequest, ProfileTLSConfig, ProfileUpdateRequest } from '../../api/types'
import type { ProfileProvider } from './profileTypes'

type ProfileYamlProfile = {
	id?: string
	name?: string
	provider?: string
	endpoint?: string
	region?: string
	accessKeyId?: string
	secretAccessKey?: string
	sessionToken?: string | null
	forcePathStyle?: boolean
	accountName?: string
	accountKey?: string
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

export async function parseProfileYaml(
	yamlText: string,
): Promise<{ request: ProfileCreateRequest; updateRequest: ProfileUpdateRequest; tlsConfig?: ProfileTLSConfig; hasTLSBlock: boolean }> {
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

	let request: ProfileCreateRequest
	switch (provider) {
		case 'azure_blob': {
			const accountName = toOptionalString(profile.accountName)
			const accountKey = toOptionalString(profile.accountKey)
			if (!accountName || !accountKey) {
				throw new Error('azure_blob requires accountName and accountKey')
			}
			request = {
				provider,
				name,
				accountName,
				accountKey,
				endpoint: toOptionalString(profile.endpoint),
				useEmulator: profile.useEmulator ?? false,
				preserveLeadingSlash,
				tlsInsecureSkipVerify,
			}
			break
		}
		case 'gcp_gcs': {
			const anonymous = profile.anonymous ?? false
			const serviceAccountJson = toOptionalString(profile.serviceAccountJson)
			const projectNumber = toOptionalString(profile.projectNumber)
			if (!projectNumber) {
				throw new Error('gcp_gcs requires projectNumber')
			}
			if (!anonymous && !serviceAccountJson) {
				throw new Error('gcp_gcs requires serviceAccountJson unless anonymous=true')
			}
			request = {
				provider,
				name,
				anonymous,
				serviceAccountJson: anonymous ? '' : serviceAccountJson,
				endpoint: toOptionalString(profile.endpoint),
				projectNumber,
				preserveLeadingSlash,
				tlsInsecureSkipVerify,
			}
			break
		}
		case 'oci_object_storage': {
			const region = toOptionalString(profile.region)
			const namespace = toOptionalString(profile.namespace)
			const compartment = toOptionalString(profile.compartment)
			if (!region || !namespace || !compartment) {
				throw new Error('oci_object_storage requires region, namespace, and compartment')
			}
			request = {
				provider,
				name,
				region,
				namespace,
				compartment,
				endpoint: toOptionalString(profile.endpoint),
				authProvider: toOptionalString(profile.authProvider),
				configFile: toOptionalString(profile.configFile),
				configProfile: toOptionalString(profile.configProfile),
				preserveLeadingSlash,
				tlsInsecureSkipVerify,
			}
			break
		}
		default: {
			const region = toOptionalString(profile.region)
			const accessKeyId = toOptionalString(profile.accessKeyId)
			const secretAccessKey = toOptionalString(profile.secretAccessKey)
			if (!region || !accessKeyId || !secretAccessKey) {
				throw new Error(`${provider} requires region, accessKeyId, and secretAccessKey`)
			}
			const endpoint = toOptionalString(profile.endpoint)
			if (provider === 's3_compatible' && !endpoint) {
				throw new Error(`${provider} requires endpoint`)
			}
			const base = {
				name,
				region,
				accessKeyId,
				secretAccessKey,
				sessionToken: profile.sessionToken ?? null,
				forcePathStyle: profile.forcePathStyle ?? false,
				preserveLeadingSlash,
				tlsInsecureSkipVerify,
			}
			if (provider === 'aws_s3') {
				request = {
					provider: 'aws_s3',
					...base,
					endpoint,
				}
			} else if (provider === 's3_compatible') {
				request = {
					provider: 's3_compatible',
					...base,
					endpoint: endpoint as string,
				}
			} else {
				request = {
					provider: 's3_compatible',
					...base,
					endpoint: endpoint as string,
				}
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
		updateRequest: request as ProfileUpdateRequest,
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
