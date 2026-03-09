import type { ProfileTLSStatus } from '../../api/types'
import type { ProfileFormValues, TLSCapability, TLSAction } from './profileTypes'

function validateOptionalHttpUrl(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	try {
		const parsed = new URL(value.trim())
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return Promise.reject(new Error('Endpoint URL must start with http:// or https://'))
		}
		return Promise.resolve()
	} catch {
		return Promise.reject(new Error('Enter a valid endpoint URL (including protocol)'))
	}
}

function validateRegionLike(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	return /^[a-z0-9-]+$/.test(value.trim())
		? Promise.resolve()
		: Promise.reject(new Error('Use lowercase letters, numbers, and hyphens only'))
}

function validateDigitsOnly(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	return /^\d+$/.test(value.trim()) ? Promise.resolve() : Promise.reject(new Error('Use digits only'))
}

function validateJsonDocument(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	try {
		JSON.parse(value)
		return Promise.resolve()
	} catch {
		return Promise.reject(new Error('Enter valid JSON'))
	}
}

function validateAzureAccountName(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	return /^[a-z0-9]{3,24}$/.test(value.trim())
		? Promise.resolve()
		: Promise.reject(new Error('Use 3-24 lowercase letters or numbers'))
}

function validateOciCompartment(value: string | undefined): Promise<void> {
	if (!value || !value.trim()) return Promise.resolve()
	return value.trim().startsWith('ocid1.compartment.')
		? Promise.resolve()
		: Promise.reject(new Error('Expected OCID that starts with ocid1.compartment.'))
}

function isBlank(value: unknown): boolean {
	return typeof value !== 'string' ? !value : !value.trim()
}

export type FieldErrors = Partial<Record<keyof ProfileFormValues, string>>
export type SectionKey = 'basic' | 'credentials' | 'advanced' | 'security'

export const DEFAULT_CREATE_SECTIONS: SectionKey[] = ['basic', 'credentials']
export const DEFAULT_EDIT_SECTIONS: SectionKey[] = ['basic']

export const FIELD_SECTION_MAP: Partial<Record<keyof ProfileFormValues, SectionKey>> = {
	provider: 'basic',
	name: 'basic',
	endpoint: 'basic',
	region: 'basic',
	azureAccountName: 'basic',
	azureEndpoint: 'basic',
	gcpEndpoint: 'basic',
	gcpProjectNumber: 'basic',
	ociNamespace: 'basic',
	ociCompartment: 'basic',
	ociEndpoint: 'basic',
	accessKeyId: 'credentials',
	secretAccessKey: 'credentials',
	sessionToken: 'credentials',
	clearSessionToken: 'credentials',
	azureAccountKey: 'credentials',
	gcpAnonymous: 'credentials',
	gcpServiceAccountJson: 'credentials',
	ociAuthProvider: 'credentials',
	ociConfigFile: 'credentials',
	ociConfigProfile: 'credentials',
	forcePathStyle: 'advanced',
	preserveLeadingSlash: 'advanced',
	tlsInsecureSkipVerify: 'advanced',
	azureUseEmulator: 'advanced',
	tlsEnabled: 'security',
	tlsAction: 'security',
	tlsClientCertPem: 'security',
	tlsClientKeyPem: 'security',
	tlsCaCertPem: 'security',
}

const PROVIDER_LABELS: Record<ProfileFormValues['provider'], string> = {
	s3_compatible: 'S3 Compatible',
	aws_s3: 'AWS S3',
	oci_s3_compat: 'OCI S3 Compat',
	oci_object_storage: 'OCI Object Storage',
	azure_blob: 'Azure Blob',
	gcp_gcs: 'Google Cloud Storage',
}

export type ProfileModalViewState = {
	providerLabel: string
	isS3Provider: boolean
	isOciObjectStorage: boolean
	isAws: boolean
	isAzure: boolean
	isGcp: boolean
	providerGuide: { hint: string; docsUrl: string } | null
	tlsUnavailable: boolean
	tlsDisabledReason: string
	tlsStatusLabel: string
	showTLSStatusError: string | null
	tlsAction: TLSAction
	showTLSFields: boolean
}

export function buildProfileModalViewState(args: {
	values: ProfileFormValues
	editMode?: boolean
	tlsCapability?: TLSCapability | null
	tlsStatus?: ProfileTLSStatus | null
	tlsStatusLoading?: boolean
	tlsStatusError?: string | null
}): ProfileModalViewState {
	const provider = args.values.provider
	const isS3Provider = provider === 'aws_s3' || provider === 's3_compatible' || provider === 'oci_s3_compat'
	const isOciObjectStorage = provider === 'oci_object_storage'
	const isAws = provider === 'aws_s3'
	const isAzure = provider === 'azure_blob'
	const isGcp = provider === 'gcp_gcs'
	const providerLabel = PROVIDER_LABELS[provider]

	const tlsUnavailable = args.tlsCapability?.enabled === false
	const tlsDisabledReason = args.tlsCapability?.reason ?? 'mTLS is disabled on the server.'
	const tlsStatusLabel = tlsUnavailable
		? 'Unavailable'
		: args.tlsStatusLoading
			? 'Checking…'
			: args.tlsStatus?.mode === 'mtls'
				? 'mTLS enabled'
				: 'mTLS disabled'
	const showTLSStatusError = !tlsUnavailable && args.tlsStatusError ? args.tlsStatusError : null
	const tlsAction = (args.values.tlsAction ?? 'keep') as TLSAction
	const showTLSFields = !tlsUnavailable && (args.editMode ? tlsAction === 'enable' : !!args.values.tlsEnabled)

	const providerGuide = (() => {
		switch (provider) {
			case 'aws_s3':
				return {
					hint: 'Use your AWS region. Leave endpoint blank unless you need a custom gateway.',
					docsUrl: 'https://rclone.org/s3/#amazon-s3',
				}
			case 's3_compatible':
				return {
					hint: 'Use the full endpoint URL. MinIO and Ceph usually also need Force Path Style in Advanced options.',
					docsUrl: 'https://rclone.org/s3/',
				}
			case 'oci_s3_compat':
				return {
					hint: 'Use the OCI S3-compatible endpoint, region, and S3-style keys.',
					docsUrl: 'https://rclone.org/s3/#oracle-oci-object-storage',
				}
			case 'oci_object_storage':
				return {
					hint: 'Use the native OCI backend when you want namespace and compartment-aware access.',
					docsUrl: 'https://rclone.org/oracleobjectstorage/',
				}
			case 'azure_blob':
				return {
					hint: 'Storage account name is required. Emulator mode is only for local Azurite-style setups.',
					docsUrl: 'https://rclone.org/azureblob/',
				}
			case 'gcp_gcs':
				return {
					hint: 'Service Account JSON is the standard path unless you intentionally need anonymous access. Project Number is still required for bucket operations.',
					docsUrl: 'https://rclone.org/googlecloudstorage/',
				}
			default:
				return null
		}
	})()

	return {
		providerLabel,
		isS3Provider,
		isOciObjectStorage,
		isAws,
		isAzure,
		isGcp,
		providerGuide,
		tlsUnavailable,
		tlsDisabledReason,
		tlsStatusLabel,
		showTLSStatusError,
		tlsAction,
		showTLSFields,
	}
}

export async function validateProfileFormValues(args: {
	values: ProfileFormValues
	editMode?: boolean
	viewState: Pick<ProfileModalViewState, 'isS3Provider' | 'isOciObjectStorage' | 'isAws' | 'isAzure' | 'isGcp' | 'showTLSFields'>
}): Promise<FieldErrors> {
	const { values, editMode, viewState } = args
	const next: FieldErrors = {}

	const addError = (key: keyof ProfileFormValues, msg: string) => {
		if (!next[key]) next[key] = msg
	}

	if (isBlank(values.provider)) addError('provider', 'Provider is required')
	if (isBlank(values.name)) addError('name', 'Name is required')

	if (viewState.isS3Provider) {
		if (!viewState.isAws && isBlank(values.endpoint)) addError('endpoint', 'Endpoint URL is required')
		try {
			await validateOptionalHttpUrl(values.endpoint)
		} catch (err) {
			addError('endpoint', (err as Error).message)
		}

		if (isBlank(values.region)) addError('region', 'Region is required')
		try {
			await validateRegionLike(values.region)
		} catch (err) {
			addError('region', (err as Error).message)
		}

		if (!editMode) {
			if (isBlank(values.accessKeyId)) addError('accessKeyId', 'Access Key ID is required')
			if (isBlank(values.secretAccessKey)) addError('secretAccessKey', 'Secret is required')
		}
	}

	if (viewState.isOciObjectStorage) {
		if (isBlank(values.region)) addError('region', 'Region is required')
		try {
			await validateRegionLike(values.region)
		} catch (err) {
			addError('region', (err as Error).message)
		}

		if (isBlank(values.ociNamespace)) addError('ociNamespace', 'Namespace is required')
		if (isBlank(values.ociCompartment)) addError('ociCompartment', 'Compartment OCID is required')
		try {
			await validateOciCompartment(values.ociCompartment)
		} catch (err) {
			addError('ociCompartment', (err as Error).message)
		}

		try {
			await validateOptionalHttpUrl(values.ociEndpoint)
		} catch (err) {
			addError('ociEndpoint', (err as Error).message)
		}
	}

	if (viewState.isAzure) {
		if (isBlank(values.azureAccountName)) addError('azureAccountName', 'Storage Account Name is required')
		try {
			await validateAzureAccountName(values.azureAccountName)
		} catch (err) {
			addError('azureAccountName', (err as Error).message)
		}

		if (!editMode && isBlank(values.azureAccountKey)) addError('azureAccountKey', 'Account Key is required')
		try {
			await validateOptionalHttpUrl(values.azureEndpoint)
		} catch (err) {
			addError('azureEndpoint', (err as Error).message)
		}
	}

	if (viewState.isGcp) {
		if (isBlank(values.gcpProjectNumber)) addError('gcpProjectNumber', 'Project Number is required')
		try {
			await validateOptionalHttpUrl(values.gcpEndpoint)
		} catch (err) {
			addError('gcpEndpoint', (err as Error).message)
		}

		try {
			await validateDigitsOnly(values.gcpProjectNumber)
		} catch (err) {
			addError('gcpProjectNumber', (err as Error).message)
		}

		if (!values.gcpAnonymous) {
			if (!editMode && isBlank(values.gcpServiceAccountJson)) {
				addError('gcpServiceAccountJson', 'Service Account JSON is required')
			}
			try {
				await validateJsonDocument(values.gcpServiceAccountJson)
			} catch (err) {
				addError('gcpServiceAccountJson', (err as Error).message)
			}
		}
	}

	if (viewState.showTLSFields) {
		if (isBlank(values.tlsClientCertPem)) addError('tlsClientCertPem', 'Client certificate is required')
		if (isBlank(values.tlsClientKeyPem)) addError('tlsClientKeyPem', 'Client key is required')
	}

	return next
}
