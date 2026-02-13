export type PolicyKind = 's3' | 'gcs' | 'azure'

export type PolicyPreset = {
	key: string
	label: string
	description: string
	value: Record<string, unknown>
}

const DEFAULT_BUCKET_NAME = 'example-bucket'

function normalizeBucketName(bucket: string): string {
	const b = bucket.trim()
	return b === '' ? DEFAULT_BUCKET_NAME : b
}

function s3ArnForObjects(bucket: string): string {
	return `arn:aws:s3:::${normalizeBucketName(bucket)}/*`
}

const DEFAULT_POLICY_BY_KIND: Record<PolicyKind, Record<string, unknown>> = {
	s3: {
		Version: '2012-10-17',
		Statement: [],
	},
	gcs: {
		version: 1,
		bindings: [],
	},
	azure: {
		publicAccess: 'private',
		storedAccessPolicies: [],
	},
}

export function getPolicyTemplate(kind: PolicyKind): string {
	return JSON.stringify(DEFAULT_POLICY_BY_KIND[kind], null, 2)
}

export function getPolicyPresets(kind: PolicyKind, bucket: string): PolicyPreset[] {
	switch (kind) {
		case 's3': {
			return [
				{
					key: 's3-private-default',
					label: 'Private default',
					description: 'No additional grants. Start from least privilege.',
					value: {
						Version: '2012-10-17',
						Statement: [],
					},
				},
				{
					key: 's3-app-rw-prefix',
					label: 'App read/write prefix',
					description: 'Template for an app role with object read/write/delete access.',
					value: {
						Version: '2012-10-17',
						Statement: [
							{
								Sid: 'AppReadWritePrefix',
								Effect: 'Allow',
								Principal: {
									AWS: ['arn:aws:iam::123456789012:role/app-role'],
								},
								Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
								Resource: [s3ArnForObjects(bucket)],
							},
						],
					},
				},
				{
					key: 's3-public-read',
					label: 'Public read objects',
					description: 'Grants anonymous read on all objects. Use only for public content.',
					value: {
						Version: '2012-10-17',
						Statement: [
							{
								Sid: 'PublicReadObjects',
								Effect: 'Allow',
								Principal: '*',
								Action: ['s3:GetObject'],
								Resource: [s3ArnForObjects(bucket)],
							},
						],
					},
				},
			]
		}
		case 'gcs': {
			return [
				{
					key: 'gcs-private-default',
					label: 'Private default',
					description: 'No IAM bindings beyond inherited permissions.',
					value: {
						version: 1,
						bindings: [],
					},
				},
				{
					key: 'gcs-public-read',
					label: 'Public read objects',
					description: 'Adds allUsers as object viewers.',
					value: {
						version: 1,
						bindings: [
							{
								role: 'roles/storage.objectViewer',
								members: ['allUsers'],
							},
						],
					},
				},
				{
					key: 'gcs-authenticated-read',
					label: 'Authenticated read',
					description: 'Allows all authenticated Google users to read objects.',
					value: {
						version: 1,
						bindings: [
							{
								role: 'roles/storage.objectViewer',
								members: ['allAuthenticatedUsers'],
							},
						],
					},
				},
			]
		}
		case 'azure':
		default: {
			return [
				{
					key: 'azure-private-default',
					label: 'Private default',
					description: 'Private container access with no stored access policies.',
					value: {
						publicAccess: 'private',
						storedAccessPolicies: [],
					},
				},
				{
					key: 'azure-blob-public',
					label: 'Blob public read',
					description: 'Public read for blobs only (container metadata remains private).',
					value: {
						publicAccess: 'blob',
						storedAccessPolicies: [],
					},
				},
				{
					key: 'azure-container-public',
					label: 'Container public read',
					description: 'Public read for container and blobs.',
					value: {
						publicAccess: 'container',
						storedAccessPolicies: [],
					},
				},
				{
					key: 'azure-readonly-policy',
					label: 'Stored policy: read',
					description: 'Creates a stored access policy named readonly with permission r.',
					value: {
						publicAccess: 'private',
						storedAccessPolicies: [{ id: 'readonly', permission: 'r' }],
					},
				},
			]
		}
	}
}
