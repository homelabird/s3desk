import type { JobCreateRequest } from '../../api/types'
import { fileNameFromKey, normalizePrefix, parentPrefixFromKey } from './objectsListUtils'

export function buildRenameJobRequest(args: {
	kind: 'object' | 'prefix'
	src: string
	name: string
	bucket: string
}): JobCreateRequest {
	const name = args.name.trim().replace(/\/+$/, '')
	if (!name) throw new Error('name is required')
	if (name === '.' || name === '..' || name.includes('\u0000')) throw new Error('invalid name')
	if (name.includes('/')) throw new Error("name must not contain '/'")

	if (args.kind === 'prefix') {
		const srcPrefix = normalizePrefix(args.src)
		const dstPrefix = `${parentPrefixFromKey(srcPrefix.replace(/\/+$/, ''))}${name}/`
		if (dstPrefix === srcPrefix) throw new Error('already in destination')
		if (dstPrefix.startsWith(srcPrefix)) throw new Error('destination must not be under source prefix')
		return {
			type: 'transfer_move_prefix',
			payload: {
				srcBucket: args.bucket,
				srcPrefix,
				dstBucket: args.bucket,
				dstPrefix,
				include: [],
				exclude: [],
				dryRun: false,
			},
		}
	}

	const srcKey = args.src.trim().replace(/^\/+/, '')
	const dstKey = `${parentPrefixFromKey(srcKey)}${name}`
	if (dstKey === srcKey) throw new Error('already in destination')
	return {
		type: 'transfer_move_object',
		payload: {
			srcBucket: args.bucket,
			srcKey,
			dstBucket: args.bucket,
			dstKey,
			dryRun: false,
		},
	}
}

export function buildMoveSelectionJobRequest(args: {
	bucket: string
	prefix: string
	dstBucket: string
	dstPrefix: string
	selectedKeys: string[]
}): JobCreateRequest {
	const dstBucket = args.dstBucket.trim()
	if (!dstBucket) throw new Error('destination bucket is required')

	const srcPrefix = normalizePrefix(args.prefix)
	const dstPrefix = normalizePrefix(args.dstPrefix)
	const uniqueKeys = Array.from(new Set(args.selectedKeys.map((key) => key.trim()).filter(Boolean)))
	if (uniqueKeys.length === 0) throw new Error('no selected keys to move')
	if (uniqueKeys.length > 50_000) throw new Error('too many keys to move; use a prefix job instead')

	const destinations = new Set<string>()
	const items: { srcKey: string; dstKey: string }[] = []
	for (const rawKey of uniqueKeys) {
		const srcKey = rawKey.replace(/^\/+/, '')
		if (!srcKey) continue
		let relativeKey = srcPrefix && srcKey.startsWith(srcPrefix) ? srcKey.slice(srcPrefix.length) : srcPrefix ? fileNameFromKey(srcKey) : srcKey
		relativeKey = relativeKey.replace(/^\/+/, '') || fileNameFromKey(srcKey)
		const dstKey = `${dstPrefix}${relativeKey}`
		if (args.bucket === dstBucket && dstKey === srcKey) continue
		if (destinations.has(dstKey)) throw new Error(`multiple selected items map to the same destination: ${dstKey}`)
		destinations.add(dstKey)
		items.push({ srcKey, dstKey })
	}
	if (items.length === 0) throw new Error('nothing to move (already in destination)')

	return {
		type: 'transfer_move_batch',
		payload: { srcBucket: args.bucket, dstBucket, items, dryRun: false },
	}
}
