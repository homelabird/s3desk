export function buildS3Location(bucket: string, prefix: string): string {
	if (!bucket) return ''
	const normalizedPrefix = (prefix ?? '').replace(/^\/+/, '')
	return normalizedPrefix ? `s3://${bucket}/${normalizedPrefix}` : `s3://${bucket}/`
}
