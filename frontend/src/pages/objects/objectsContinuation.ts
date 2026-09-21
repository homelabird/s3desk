import type { ListObjectsResponse } from '../../api/types'

type GetNextObjectsContinuationTokenArgs = {
	lastPage: ListObjectsResponse
	lastPageParam: string | undefined
	allPageParams: Array<string | undefined>
	bucket: string
	prefix: string
	onWarn?: (message: string, context: Record<string, unknown>) => void
}

export function getNextObjectsContinuationToken({
	lastPage,
	lastPageParam,
	allPageParams,
	bucket,
	prefix,
	onWarn,
}: GetNextObjectsContinuationTokenArgs): string | undefined {
	if (!lastPage.isTruncated) return undefined

	const warnContext = { bucket, prefix }
	const nextToken = lastPage.nextContinuationToken ?? undefined
	if (!nextToken) {
		onWarn?.('List objects missing continuation token; stopping pagination', warnContext)
		return undefined
	}

	// Filtering (for example a page containing only a directory's own marker)
	// may leave an empty page while the provider still has further results.
	// The cursor, not item count, determines whether listing can continue.

	if (typeof lastPageParam === 'string' && lastPageParam && nextToken === lastPageParam) {
		onWarn?.('List objects repeated continuation token; stopping pagination', { ...warnContext, nextToken })
		return undefined
	}

	const seen = new Set<string>()
	for (const param of allPageParams) {
		if (typeof param === 'string' && param) seen.add(param)
	}
	if (seen.has(nextToken)) {
		onWarn?.('List objects hit previously seen continuation token; stopping pagination', { ...warnContext, nextToken })
		return undefined
	}

	return nextToken
}
