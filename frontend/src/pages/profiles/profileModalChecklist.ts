import type { ProfileFormValues } from './profileTypes'
import type { FieldErrors, ProfileModalViewState, SectionKey } from './profileModalValidation'

export type ProfileChecklistStatus = 'complete' | 'incomplete' | 'optional'

export type ProfileChecklistItem = {
	id: string
	title: string
	detail: string
	status: ProfileChecklistStatus
	section?: SectionKey
	fields: Array<keyof ProfileFormValues>
}

export type ProfileChecklistGroup = {
	id: string
	title: string
	items: ProfileChecklistItem[]
}

export type ProfileProviderChecklist = {
	providerLabel: string
	groups: ProfileChecklistGroup[]
}

type BuildProfileProviderChecklistArgs = {
	values: ProfileFormValues
	errors: FieldErrors
	editMode?: boolean
	viewState: ProfileModalViewState
}

function hasValue(value: unknown): boolean {
	return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
}

function hasAnyValue(values: unknown[]): boolean {
	return values.some(hasValue)
}

function hasFieldError(errors: FieldErrors, fields: Array<keyof ProfileFormValues>): boolean {
	return fields.some((field) => Boolean(errors[field]))
}

function requiredItem(args: {
	id: string
	title: string
	fields: Array<keyof ProfileFormValues>
	section?: SectionKey
	complete: boolean
	completeDetail: string
	incompleteDetail: string
	errors: FieldErrors
}): ProfileChecklistItem {
	const isComplete = args.complete && !hasFieldError(args.errors, args.fields)
	return {
		id: args.id,
		title: args.title,
		detail: isComplete ? args.completeDetail : args.incompleteDetail,
		status: isComplete ? 'complete' : 'incomplete',
		section: args.section,
		fields: args.fields,
	}
}

function optionalItem(args: {
	id: string
	title: string
	fields: Array<keyof ProfileFormValues>
	section?: SectionKey
	configured: boolean
	complete: boolean
	optionalDetail: string
	configuredDetail: string
	incompleteDetail?: string
	errors: FieldErrors
}): ProfileChecklistItem {
	const hasError = hasFieldError(args.errors, args.fields)
	const isIncomplete = args.configured && (!args.complete || hasError)
	return {
		id: args.id,
		title: args.title,
		detail: isIncomplete ? args.incompleteDetail ?? args.optionalDetail : args.configured ? args.configuredDetail : args.optionalDetail,
		status: isIncomplete ? 'incomplete' : args.configured ? 'complete' : 'optional',
		section: args.section,
		fields: args.fields,
	}
}

function buildS3Items(args: BuildProfileProviderChecklistArgs): ProfileChecklistGroup[] {
	const { editMode, errors, values, viewState } = args
	const basicFields: Array<keyof ProfileFormValues> = viewState.isAws
		? ['name', 'region']
		: ['name', 'endpoint', 'region']
	const credentialFields: Array<keyof ProfileFormValues> = ['accessKeyId', 'secretAccessKey']
	const credentialsComplete = editMode || (hasValue(values.accessKeyId) && hasValue(values.secretAccessKey))

	return [
		{
			id: 'required',
			title: 'Required for basic connectivity',
			items: [
				requiredItem({
					id: 's3-connection',
					title: viewState.isAws ? 'AWS region and profile name' : 'Endpoint, region, and profile name',
					fields: basicFields,
					section: 'basic',
					complete: basicFields.every((field) => hasValue(values[field])),
					completeDetail: viewState.isAws ? 'Region and name are ready.' : 'Endpoint URL, region, and name are ready.',
					incompleteDetail: viewState.isAws ? 'Add a profile name and AWS region.' : 'Add endpoint URL, region, and profile name.',
					errors,
				}),
				requiredItem({
					id: 's3-credentials',
					title: 'Access key and secret',
					fields: credentialFields,
					section: 'credentials',
					complete: credentialsComplete,
					completeDetail: editMode ? 'Saved credentials will be kept unless replaced.' : 'Access key and secret are present.',
					incompleteDetail: 'Add access key ID and secret.',
					errors,
				}),
			],
		},
		{
			id: 'management',
			title: 'Optional for management-plane features',
			items: [
				optionalItem({
					id: 's3-public-endpoint',
					title: 'Browser public endpoint',
					fields: ['publicEndpoint'],
					section: 'basic',
					configured: hasValue(values.publicEndpoint),
					complete: hasValue(values.publicEndpoint),
					optionalDetail: 'Only needed when browser uploads use a different hostname than the server.',
					configuredDetail: 'Browser endpoint override is configured.',
					incompleteDetail: 'Fix the public endpoint URL.',
					errors,
				}),
				optionalItem({
					id: 's3-compatibility',
					title: 'Compatibility toggles',
					fields: ['forcePathStyle', 'preserveLeadingSlash'],
					section: 'advanced',
					configured: values.forcePathStyle || values.preserveLeadingSlash,
					complete: true,
					optionalDetail: 'Use for MinIO, Ceph, strict key semantics, or custom S3 gateways.',
					configuredDetail: 'One or more compatibility toggles are enabled.',
					errors,
				}),
			],
		},
	]
}

function buildAzureItems(args: BuildProfileProviderChecklistArgs): ProfileChecklistGroup[] {
	const { editMode, errors, values } = args
	const basicFields: Array<keyof ProfileFormValues> = ['name', 'azureAccountName', 'azureAccountKey']
	const armFields: Array<keyof ProfileFormValues> = [
		'azureSubscriptionId',
		'azureResourceGroup',
		'azureTenantId',
		'azureClientId',
		'azureClientSecret',
	]
	const armConfigured = hasAnyValue(armFields.map((field) => values[field]))
	const armComplete =
		hasValue(values.azureSubscriptionId) &&
		hasValue(values.azureResourceGroup) &&
		hasValue(values.azureTenantId) &&
		hasValue(values.azureClientId) &&
		(editMode || hasValue(values.azureClientSecret))

	return [
		{
			id: 'required',
			title: 'Required for basic connectivity',
			items: [
				requiredItem({
					id: 'azure-blob',
					title: 'Blob account access',
					fields: basicFields,
					section: 'basic',
					complete: hasValue(values.name) && hasValue(values.azureAccountName) && (editMode || hasValue(values.azureAccountKey)),
					completeDetail: editMode ? 'Storage account is ready; saved account key will be kept unless replaced.' : 'Storage account and account key are ready.',
					incompleteDetail: 'Add profile name, storage account name, and account key.',
					errors,
				}),
			],
		},
		{
			id: 'management',
			title: 'Optional for management-plane features',
			items: [
				optionalItem({
					id: 'azure-arm',
					title: 'Azure ARM app credentials',
					fields: armFields,
					section: 'basic',
					configured: armConfigured,
					complete: armComplete,
					optionalDetail: 'Only needed for management-plane features such as immutability editing.',
					configuredDetail: editMode ? 'ARM fields are configured; saved client secret can be retained.' : 'ARM fields and client secret are configured.',
					incompleteDetail: 'Fill Subscription ID, Resource Group, Tenant ID, Client ID, and Client Secret together.',
					errors,
				}),
				optionalItem({
					id: 'azure-endpoint',
					title: 'Azurite or custom endpoint',
					fields: ['azureEndpoint', 'azureUseEmulator'],
					section: 'basic',
					configured: hasValue(values.azureEndpoint) || values.azureUseEmulator,
					complete: true,
					optionalDetail: 'Leave empty for normal Azure Blob endpoints.',
					configuredDetail: 'Custom endpoint or emulator mode is configured.',
					incompleteDetail: 'Fix the Azure endpoint URL.',
					errors,
				}),
			],
		},
	]
}

function buildGcpItems(args: BuildProfileProviderChecklistArgs): ProfileChecklistGroup[] {
	const { editMode, errors, values } = args
	const authComplete = values.gcpAnonymous || editMode || hasValue(values.gcpServiceAccountJson)

	return [
		{
			id: 'required',
			title: 'Required for basic connectivity',
			items: [
				requiredItem({
					id: 'gcp-project',
					title: 'Project number',
					fields: ['name', 'gcpProjectNumber'],
					section: 'basic',
					complete: hasValue(values.name) && hasValue(values.gcpProjectNumber),
					completeDetail: 'Profile name and project number are ready.',
					incompleteDetail: 'Add profile name and numeric project number.',
					errors,
				}),
				requiredItem({
					id: 'gcp-auth',
					title: 'Authentication path',
					fields: ['gcpAnonymous', 'gcpServiceAccountJson'],
					section: 'credentials',
					complete: authComplete,
					completeDetail: values.gcpAnonymous
						? 'Anonymous access selected; use only for public buckets/endpoints.'
						: editMode
							? 'Saved service account JSON will be kept unless replaced.'
							: 'Service account JSON is present.',
					incompleteDetail: 'Add service account JSON or choose Anonymous for public access.',
					errors,
				}),
			],
		},
		{
			id: 'management',
			title: 'Optional for management-plane features',
			items: [
				optionalItem({
					id: 'gcp-iam',
					title: 'IAM and policy operations',
					fields: ['gcpServiceAccountJson', 'gcpAnonymous'],
					section: 'credentials',
					configured: !values.gcpAnonymous && (editMode || hasValue(values.gcpServiceAccountJson)),
					complete: !values.gcpAnonymous && (editMode || hasValue(values.gcpServiceAccountJson)),
					optionalDetail: 'Service-account permissions are needed for IAM/policy operations; anonymous mode is data-only.',
					configuredDetail: 'Authenticated service account path is selected.',
					errors,
				}),
				optionalItem({
					id: 'gcp-endpoint',
					title: 'Custom GCS endpoint',
					fields: ['gcpEndpoint'],
					section: 'basic',
					configured: hasValue(values.gcpEndpoint),
					complete: hasValue(values.gcpEndpoint),
					optionalDetail: 'Only needed for non-default GCS-compatible endpoints.',
					configuredDetail: 'Custom endpoint is configured.',
					incompleteDetail: 'Fix the GCS endpoint URL.',
					errors,
				}),
			],
		},
	]
}

function buildOciItems(args: BuildProfileProviderChecklistArgs): ProfileChecklistGroup[] {
	const { errors, values } = args
	const requiredFields: Array<keyof ProfileFormValues> = ['name', 'region', 'ociNamespace', 'ociCompartment']
	const authFields: Array<keyof ProfileFormValues> = ['ociAuthProvider', 'ociConfigFile', 'ociConfigProfile']
	const authConfigured = hasAnyValue(authFields.map((field) => values[field]))

	return [
		{
			id: 'required',
			title: 'Required for basic connectivity',
			items: [
				requiredItem({
					id: 'oci-scope',
					title: 'Region, namespace, and compartment',
					fields: requiredFields,
					section: 'basic',
					complete: requiredFields.every((field) => hasValue(values[field])),
					completeDetail: 'OCI region, namespace, compartment, and profile name are ready.',
					incompleteDetail: 'Add profile name, region, namespace, and compartment OCID.',
					errors,
				}),
			],
		},
		{
			id: 'management',
			title: 'Optional for management-plane features',
			items: [
				optionalItem({
					id: 'oci-auth-overrides',
					title: 'Auth provider and config overrides',
					fields: authFields,
					section: 'credentials',
					configured: authConfigured,
					complete: true,
					optionalDetail: 'Default OCI auth is used unless you specify a provider or config path.',
					configuredDetail: 'OCI auth override values are configured.',
					errors,
				}),
				optionalItem({
					id: 'oci-endpoint',
					title: 'OCI endpoint override',
					fields: ['ociEndpoint'],
					section: 'basic',
					configured: hasValue(values.ociEndpoint),
					complete: hasValue(values.ociEndpoint),
					optionalDetail: 'Leave empty for the default regional Object Storage endpoint.',
					configuredDetail: 'Custom OCI endpoint is configured.',
					incompleteDetail: 'Fix the OCI endpoint URL.',
					errors,
				}),
			],
		},
	]
}

function buildPrivateEndpointGroup(args: BuildProfileProviderChecklistArgs): ProfileChecklistGroup {
	const { errors, values, viewState } = args
	const endpointField: keyof ProfileFormValues = viewState.isAzure
		? 'azureEndpoint'
		: viewState.isGcp
			? 'gcpEndpoint'
			: viewState.isOciObjectStorage
				? 'ociEndpoint'
				: 'endpoint'
	const tlsFields: Array<keyof ProfileFormValues> = [
		endpointField,
		'tlsInsecureSkipVerify',
		'tlsClientCertPem',
		'tlsClientKeyPem',
		'tlsCaCertPem',
	]
	const mtlsConfigured = values.tlsEnabled || values.tlsAction === 'enable'

	return {
		id: 'private-endpoints',
		title: 'Optional for private/self-signed endpoints',
		items: [
				optionalItem({
					id: 'tls-trust',
					title: 'Custom TLS trust settings',
					fields: tlsFields,
					section: 'security',
					configured: values.tlsInsecureSkipVerify || mtlsConfigured || hasValue(values.tlsCaCertPem),
					complete: !hasFieldError(errors, tlsFields),
					optionalDetail: 'Only needed for private HTTPS endpoints, self-signed certificates, or mTLS.',
				configuredDetail: 'TLS trust or mTLS settings are configured.',
				incompleteDetail: 'Fix the highlighted TLS or custom endpoint fields.',
				errors,
			}),
		],
	}
}

export function buildProfileProviderChecklist(args: BuildProfileProviderChecklistArgs): ProfileProviderChecklist {
	const providerGroups = args.viewState.isAzure
		? buildAzureItems(args)
		: args.viewState.isGcp
			? buildGcpItems(args)
			: args.viewState.isOciObjectStorage
				? buildOciItems(args)
				: buildS3Items(args)
	const groups = [...providerGroups, buildPrivateEndpointGroup(args)]
	return {
		providerLabel: args.viewState.providerLabel,
		groups,
	}
}
