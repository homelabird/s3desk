import type {
	BucketAccessBinding,
	BucketStoredAccessPolicy,
	BucketPublicExposureMode,
} from '../../../api/types'

export const awsBlockPublicAccess = {
	blockPublicAcls: true,
	ignorePublicAcls: true,
	blockPublicPolicy: true,
	restrictPublicBuckets: true,
} as const

export type AwsObjectOwnershipMode =
	| 'bucket_owner_enforced'
	| 'bucket_owner_preferred'
	| 'object_writer'
export type AwsEncryptionMode = 'sse_s3' | 'sse_kms'
export type GCSPublicMode = Extract<BucketPublicExposureMode, 'private' | 'public'>
export type AzureVisibilityMode = Extract<BucketPublicExposureMode, 'private' | 'blob' | 'container'>

export type GCSBindingRow = {
	key: string
	role: string
	membersText: string
}

export type AzureStoredPolicyRow = {
	key: string
	id: string
	start: string
	expiry: string
	permission: string
}

export type AwsDefaultsState = {
	enabled: boolean
	blockPublicAccess: boolean
	objectOwnershipEnabled: boolean
	objectOwnership: AwsObjectOwnershipMode
	versioningEnabled: boolean
	encryptionEnabled: boolean
	encryptionMode: AwsEncryptionMode
	kmsKeyId: string
}

export type GcsDefaultsState = {
	enabled: boolean
	publicMode: GCSPublicMode
	bindingsEnabled: boolean
	bindings: GCSBindingRow[]
}

export type AzureDefaultsState = {
	enabled: boolean
	visibility: AzureVisibilityMode
	storedPoliciesEnabled: boolean
	storedPolicies: AzureStoredPolicyRow[]
}

export function createInitialAWSDefaults(): AwsDefaultsState {
	return {
		enabled: false,
		blockPublicAccess: true,
		objectOwnershipEnabled: true,
		objectOwnership: 'bucket_owner_enforced',
		versioningEnabled: true,
		encryptionEnabled: true,
		encryptionMode: 'sse_s3',
		kmsKeyId: '',
	}
}

export function createInitialGCSDefaults(): GcsDefaultsState {
	return {
		enabled: false,
		publicMode: 'private',
		bindingsEnabled: false,
		bindings: [],
	}
}

export function createInitialAzureDefaults(): AzureDefaultsState {
	return {
		enabled: false,
		visibility: 'private',
		storedPoliciesEnabled: false,
		storedPolicies: [],
	}
}

export function parseMembersInput(value: string): string[] {
	return Array.from(
		new Set(
			value
				.split(/[\n,]+/)
				.map((item) => item.trim())
				.filter(Boolean),
		),
	)
}

export function isAzurePolicyTime(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(value)) return false
	const date = value.slice(0, 10)
	const midnight = Date.parse(`${date}T00:00:00Z`)
	return Number.isFinite(midnight) && new Date(midnight).toISOString().slice(0, 10) === date && Number.isFinite(Date.parse(value))
}

export function normalizeGCSBindings(rows: GCSBindingRow[]): BucketAccessBinding[] {
	type BindingCandidate = BucketAccessBinding | null
	return rows
		.map<BindingCandidate>((row, index) => {
			const role = row.role.trim()
			const members = parseMembersInput(row.membersText)
			if (!role && members.length === 0) return null
			if (!role) throw new Error(`GCS binding #${index + 1}: role is required.`)
			if (members.length === 0) throw new Error(`GCS binding #${index + 1}: at least one member is required.`)
			return { role, members }
		})
		.filter((row): row is BucketAccessBinding => row !== null)
}

export function normalizeAzureStoredPolicies(rows: AzureStoredPolicyRow[]): BucketStoredAccessPolicy[] {
	const seen = new Set<string>()
	const out: BucketStoredAccessPolicy[] = []
	rows.forEach((row, index) => {
		const id = row.id.trim()
		const start = row.start.trim()
		const expiry = row.expiry.trim()
		const permission = row.permission.trim()
		if (!id && !start && !expiry && !permission) return
		if (!id) throw new Error(`Azure stored access policy #${index + 1}: id is required.`)
		if ([...id].length > 64) throw new Error(`Azure stored access policy ${id}: id must not exceed 64 characters.`)
		const key = id
		if (seen.has(key)) throw new Error(`Azure stored access policy id "${id}" is duplicated.`)
		seen.add(key)
		if (start && !isAzurePolicyTime(start)) {
			throw new Error(`Azure stored access policy ${id}: start must be an ISO 8601 date or timestamp with timezone.`)
		}
		if (expiry && !isAzurePolicyTime(expiry)) {
			throw new Error(`Azure stored access policy ${id}: expiry must be an ISO 8601 date or timestamp with timezone.`)
		}
		if (permission && (!/^[racwdxyltfmeopi]+$/.test(permission) || new Set(permission).size !== permission.length)) {
			throw new Error(`Azure stored access policy ${id}: permission must use distinct lowercase Blob permission letters: r/a/c/w/d/x/y/l/t/f/m/e/o/p/i.`)
		}
		out.push({
			id,
			start: start || undefined,
			expiry: expiry || undefined,
			permission: permission || undefined,
		})
	})
	if (out.length > 5) {
		throw new Error('Azure allows a maximum of 5 stored access policies.')
	}
	return out
}
