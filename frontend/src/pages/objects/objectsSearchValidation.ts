export function getObjectsSearchRangeErrors(
	minSize: number | null,
	maxSize: number | null,
	modifiedAfter: number | null,
	modifiedBefore: number | null,
) {
	return {
		sizeError: minSize != null && maxSize != null && minSize > maxSize
			? 'Minimum size must not exceed maximum size.' : undefined,
		dateError: modifiedAfter != null && modifiedBefore != null && modifiedAfter > modifiedBefore
			? 'Start date must not be after end date.' : undefined,
	}
}
