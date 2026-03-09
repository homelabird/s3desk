export type BucketOption = {
	label: string
	value: string
}

export type DeleteJobPrefill = {
	bucket: string
	prefix: string
	deleteAll: boolean
}

export type DeleteJobModalPrefill = Pick<DeleteJobPrefill, 'prefix' | 'deleteAll'>
