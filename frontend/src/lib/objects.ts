import type { APIClient } from '../api/client'
import type { ObjectItem } from '../api/types'

export async function listAllObjects(args: {
	api: APIClient
	profileId: string
	bucket: string
	prefix?: string
	maxKeys?: number
}): Promise<ObjectItem[]> {
	const items: ObjectItem[] = []
	let continuationToken: string | undefined
	const maxKeys = args.maxKeys ?? 1000

	while (true) {
		const resp = await args.api.listObjects({
			profileId: args.profileId,
			bucket: args.bucket,
			prefix: args.prefix,
			maxKeys,
			continuationToken,
		})
		items.push(...(resp.items ?? []))
		if (!resp.isTruncated || !resp.nextContinuationToken) break
		continuationToken = resp.nextContinuationToken ?? undefined
	}

	return items
}
