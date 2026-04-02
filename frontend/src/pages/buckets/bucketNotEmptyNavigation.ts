export function buildBucketObjectsNavigationState(bucketName: string) {
	return {
		openBucket: true,
		bucket: bucketName,
		prefix: '',
	}
}

export function buildBucketDeleteJobNavigationState(bucketName: string) {
	return {
		openDeleteJob: true,
		bucket: bucketName,
		deleteAll: true,
	}
}
