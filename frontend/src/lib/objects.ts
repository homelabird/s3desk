import type { APIClient } from '../api/client'
import type { ObjectItem } from '../api/types'

const DEBUG_OBJECTS_LIST_KEY = 'debugObjectsList'

function isObjectsListDebugEnabled(): boolean {
	if (typeof window === 'undefined') return false
	try {
		return window.localStorage.getItem(DEBUG_OBJECTS_LIST_KEY) === 'true'
	} catch {
		return false
	}
}

function logObjectsDebug(enabled: boolean, message: string, context?: Record<string, unknown>): void {
	if (!enabled) return
	if (context) console.warn(`[objects] ${message}`, context)
	else console.warn(`[objects] ${message}`)
}

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
	const seenTokens = new Set<string>()
	const debugEnabled = isObjectsListDebugEnabled()
	let pageCount = 0

	while (true) {
		pageCount += 1
		if (pageCount > 10000) {
			logObjectsDebug(debugEnabled, 'List all objects exceeded page cap; stopping pagination', {
				bucket: args.bucket,
				prefix: args.prefix ?? '',
			})
			break
		}
		const resp = await args.api.listObjects({
			profileId: args.profileId,
			bucket: args.bucket,
			prefix: args.prefix,
			maxKeys,
			continuationToken,
		})
		items.push(...(resp.items ?? []))
		if (continuationToken) {
			seenTokens.add(continuationToken)
		}
		if (!resp.isTruncated) break
		const nextToken = resp.nextContinuationToken ?? undefined
		const pageEmpty = resp.items.length === 0 && resp.commonPrefixes.length === 0
		if (pageEmpty) {
			logObjectsDebug(debugEnabled, 'List all objects returned empty page; stopping pagination', {
				bucket: args.bucket,
				prefix: args.prefix ?? '',
				nextToken,
			})
			break
		}
		if (!nextToken) {
			logObjectsDebug(debugEnabled, 'List all objects missing continuation token; stopping pagination', {
				bucket: args.bucket,
				prefix: args.prefix ?? '',
			})
			break
		}
		if (seenTokens.has(nextToken)) {
			logObjectsDebug(debugEnabled, 'List all objects repeated continuation token; stopping pagination', {
				bucket: args.bucket,
				prefix: args.prefix ?? '',
				nextToken,
			})
			break
		}
		continuationToken = nextToken
	}

	return items
}
