export type JobTypeInfo = {
	type: string
	label: string
	description: string
	category: 'transfer' | 's3'
}

const JOB_TYPES: JobTypeInfo[] = [
	{
		type: 'transfer_sync_local_to_s3',
		category: 'transfer',
		label: 'Upload folder (device → S3)',
		description: 'Syncs a local folder from your device to the selected S3 bucket/prefix.',
	},
	{
		type: 'transfer_sync_staging_to_s3',
		category: 'transfer',
		label: 'Finalize upload (staging → S3)',
		description: 'Internal stage used by the upload pipeline (staging → S3).',
	},
	{
		type: 'transfer_direct_upload',
		category: 'transfer',
		label: 'Upload (direct stream → S3)',
		description: 'Streams uploads directly from the client to S3 without staging.',
	},
	{
		type: 'transfer_sync_s3_to_local',
		category: 'transfer',
		label: 'Download folder (S3 → device)',
		description: 'Syncs a folder/prefix from S3 down to your device.',
	},
	{
		type: 'transfer_delete_prefix',
		category: 'transfer',
		label: 'Delete folder/prefix',
		description: 'Deletes everything under a prefix (recursive).',
	},
	{
		type: 'transfer_copy_object',
		category: 'transfer',
		label: 'Copy object',
		description: 'Copies a single object to another key or bucket.',
	},
	{
		type: 'transfer_move_object',
		category: 'transfer',
		label: 'Move object',
		description: 'Moves a single object (copy then delete source).',
	},
	{
		type: 'transfer_copy_batch',
		category: 'transfer',
		label: 'Copy multiple objects',
		description: 'Copies a batch of objects to new destinations.',
	},
	{
		type: 'transfer_move_batch',
		category: 'transfer',
		label: 'Move multiple objects',
		description: 'Moves a batch of objects (copy then delete sources).',
	},
	{
		type: 'transfer_copy_prefix',
		category: 'transfer',
		label: 'Copy folder/prefix',
		description: 'Copies all objects under a prefix to another prefix.',
	},
	{
		type: 'transfer_move_prefix',
		category: 'transfer',
		label: 'Move folder/prefix',
		description: 'Moves all objects under a prefix (copy then delete source).',
	},
	{
		type: 's3_zip_prefix',
		category: 's3',
		label: 'Zip folder/prefix',
		description: 'Creates a .zip archive from all objects under a prefix.',
	},
	{
		type: 's3_zip_objects',
		category: 's3',
		label: 'Zip selected objects',
		description: 'Creates a .zip archive from selected objects.',
	},
	{
		type: 's3_delete_objects',
		category: 's3',
		label: 'Delete selected objects',
		description: 'Deletes selected objects.',
	},
	{
		type: 's3_index_objects',
		category: 's3',
		label: 'Build object index',
		description: 'Builds or refreshes the object index used by Global Search (Indexed).',
	},
]

const JOB_TYPE_MAP = new Map<string, JobTypeInfo>(JOB_TYPES.map((t) => [t.type, t]))

export function getJobTypeInfo(type: string | null | undefined): JobTypeInfo | undefined {
	if (!type) return undefined
	return JOB_TYPE_MAP.get(type)
}

export function jobTypeLabel(type: string | null | undefined): string {
	return getJobTypeInfo(type)?.label ?? (type ?? '')
}

export function jobTypeDescription(type: string | null | undefined): string | undefined {
	return getJobTypeInfo(type)?.description
}

export const jobTypeSelectOptions = [
	{
		label: 'Transfers',
		options: JOB_TYPES.filter((t) => t.category === 'transfer').map((t) => ({
			label: t.label,
			value: t.type,
		})),
	},
	{
		label: 'S3 / Index',
		options: JOB_TYPES.filter((t) => t.category === 's3').map((t) => ({
			label: t.label,
			value: t.type,
		})),
	},
]

export const allJobTypes = JOB_TYPES
