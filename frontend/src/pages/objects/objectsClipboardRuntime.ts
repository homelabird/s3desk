import type { JobCreateRequest } from '../../api/types'
import { objectsFeedback } from './objectsFeedback'
import type { ClipboardObjects } from './objectsActionCatalog'
import { fileNameFromKey, normalizePrefix } from './objectsListUtils'

type PasteObjectsJobRequestArgs = {
	mode: 'copy' | 'move'
	srcBucket: string
	srcPrefix: string
	keys: string[]
	dstBucket: string
	dstPrefix: string
}

function commonPrefixFromKeys(keys: string[]): string {
	const parts = keys
		.map((k) => k.replace(/^\/+/, '').split('/').filter(Boolean))
		.filter((p) => p.length > 0)
	if (parts.length === 0) return ''
	let prefixParts = parts[0]
	for (let i = 1; i < parts.length; i++) {
		const next = parts[i]
		let j = 0
		while (j < prefixParts.length && j < next.length && prefixParts[j] === next[j]) j++
		prefixParts = prefixParts.slice(0, j)
		if (prefixParts.length === 0) return ''
	}
	return prefixParts.length ? `${prefixParts.join('/')}/` : ''
}

export function buildPasteObjectsJobRequest(args: PasteObjectsJobRequestArgs): JobCreateRequest {
	const srcBucket = args.srcBucket.trim()
	const dstBucket = args.dstBucket.trim()
	if (!srcBucket) throw new Error('source bucket is required')
	if (!dstBucket) throw new Error('destination bucket is required')

	const srcPrefix = normalizePrefix(args.srcPrefix)
	const dstPrefix = normalizePrefix(args.dstPrefix)

	const uniqueKeys = Array.from(new Set(args.keys.map((k) => k.trim()).filter(Boolean)))
	if (uniqueKeys.length === 0) throw new Error('no keys to paste')
	if (uniqueKeys.length > 50_000) throw new Error('too many keys to paste; use a prefix job instead')

	const items: { srcKey: string; dstKey: string }[] = []
	const dstSet = new Set<string>()

	for (const srcKeyRaw of uniqueKeys) {
		const srcKey = srcKeyRaw.replace(/^\/+/, '')
		if (!srcKey) continue

		let rel: string
		if (srcPrefix && srcKey.startsWith(srcPrefix)) {
			rel = srcKey.slice(srcPrefix.length)
		} else {
			rel = fileNameFromKey(srcKey)
		}
		rel = rel.replace(/^\/+/, '')
		if (!rel) rel = fileNameFromKey(srcKey)

		const dstKey = `${dstPrefix}${rel}`
		if (srcBucket === dstBucket && dstKey === srcKey) continue

		if (dstSet.has(dstKey)) {
			throw new Error(`multiple keys map to the same destination: ${dstKey}`)
		}
		dstSet.add(dstKey)
		items.push({ srcKey, dstKey })
	}

	if (items.length === 0) throw new Error('nothing to paste (already in destination)')

	return {
		type: args.mode === 'copy' ? 'transfer_copy_batch' : 'transfer_move_batch',
		payload: {
			srcBucket,
			dstBucket,
			items,
			dryRun: false,
		},
	}
}

export async function readClipboardObjectsFromSystemClipboard(bucket: string): Promise<ClipboardObjects | null> {
	if (!bucket) {
		objectsFeedback.selectBucketFirst()
		return null
	}
	if (!navigator.clipboard?.readText) {
		objectsFeedback.clipboardFailed()
		return null
	}

	let text = ''
	try {
		text = await navigator.clipboard.readText()
	} catch {
		objectsFeedback.clipboardFailed()
		return null
	}
	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
	if (lines.length === 0) {
		objectsFeedback.clipboardEmpty()
		return null
	}

	const parsed: { bucket: string; key: string }[] = []
	for (const line of lines) {
		if (line.startsWith('s3://')) {
			const rest = line.slice('s3://'.length)
			const idx = rest.indexOf('/')
			if (idx <= 0) continue
			const b = rest.slice(0, idx)
			const k = rest.slice(idx + 1).replace(/^\/+/, '')
			if (!b || !k) continue
			parsed.push({ bucket: b, key: k })
			continue
		}
		const k = line.replace(/^\/+/, '')
		if (!k) continue
		parsed.push({ bucket, key: k })
	}

	if (parsed.length === 0) {
		objectsFeedback.clipboardDoesNotContainObjectKeys()
		return null
	}

	const buckets = Array.from(new Set(parsed.map((p) => p.bucket)))
	if (buckets.length !== 1) {
		objectsFeedback.clipboardMultipleBuckets()
		return null
	}

	const srcBucket = buckets[0]
	const keys = parsed.map((p) => p.key)
	return { mode: 'copy', srcProfileId: null, srcBucket, srcPrefix: commonPrefixFromKeys(keys), keys }
}
