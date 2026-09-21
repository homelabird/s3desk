const PRESIGNED_MIN_PART_BYTES = 5 * 1024 * 1024
const PRESIGNED_MAX_PARTS = 10_000

export type PresignedMultipartPlan = {
	partSizeBytes: number
	partCount: number
}

export const planPresignedMultipart = (args: {
	fileSize: number
	partSizeBytes: number
	thresholdBytes: number
}): PresignedMultipartPlan | null => {
	if (!Number.isFinite(args.fileSize) || args.fileSize <= 0) return null
	if (args.fileSize < args.thresholdBytes) return null

	let partSizeBytes = Math.max(PRESIGNED_MIN_PART_BYTES, Math.ceil(args.partSizeBytes))
	let partCount = Math.ceil(args.fileSize / partSizeBytes)
	if (partCount > PRESIGNED_MAX_PARTS) {
		partSizeBytes = Math.ceil(args.fileSize / PRESIGNED_MAX_PARTS)
		if (partSizeBytes < PRESIGNED_MIN_PART_BYTES) {
			partSizeBytes = PRESIGNED_MIN_PART_BYTES
		}
		partCount = Math.ceil(args.fileSize / partSizeBytes)
	}

	if (partCount < 2) return null
	return { partSizeBytes, partCount }
}
