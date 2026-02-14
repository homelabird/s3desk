import type { Job, JobProgress } from '../../api/types'
import { formatBytes, formatDurationSeconds } from '../../lib/transfer'
import { formatS3Destination, getBool, getNumber, getString, parentPrefixFromKey } from './jobUtils'

export const compareText = (left?: string | null, right?: string | null) => (left ?? '').localeCompare(right ?? '')

export const compareNumber = (left?: number | null, right?: number | null) => (left ?? 0) - (right ?? 0)

export const getProgressSortValue = (job: Job) => {
	const bytes = job.progress?.bytesDone ?? 0
	const ops = job.progress?.objectsDone ?? 0
	const speed = job.progress?.speedBps ?? 0
	if (bytes) return bytes
	if (ops) return ops
	return speed
}

export function jobSummary(job: Job): string | null {
	const bucket = getString(job.payload, 'bucket')
	const prefix = getString(job.payload, 'prefix')
	const localPath = getString(job.payload, 'localPath')
	const uploadId = getString(job.payload, 'uploadId')
	const label = getString(job.payload, 'label')
	const rootName = getString(job.payload, 'rootName')
	const rootKind = getString(job.payload, 'rootKind')
	const totalFiles = getNumber(job.payload, 'totalFiles')
	const totalBytes = getNumber(job.payload, 'totalBytes')
	const deleteAll = getBool(job.payload, 'deleteAll')
	const fullReindex = getBool(job.payload, 'fullReindex')
	const srcBucket = getString(job.payload, 'srcBucket')
	const srcKey = getString(job.payload, 'srcKey')
	const srcPrefix = getString(job.payload, 'srcPrefix')
	const dstBucket = getString(job.payload, 'dstBucket')
	const dstKey = getString(job.payload, 'dstKey')
	const dstPrefix = getString(job.payload, 'dstPrefix')
	const dryRun = getBool(job.payload, 'dryRun')

	const tag = dryRun ? ' (dry-run)' : ''

	switch (job.type) {
		case 's3_zip_prefix': {
			if (!bucket) return `zip ?${tag}`
			const src = prefix ? `s3://${bucket}/${prefix}*` : `s3://${bucket}/*`
			return `zip ${src}`
		}
		case 's3_zip_objects': {
			if (!bucket) return `zip ?${tag}`
			const keys = job.payload['keys']
			const count = Array.isArray(keys) ? keys.length : 0
			return count ? `zip ${count} object(s) in s3://${bucket}` : `zip selection in s3://${bucket}`
		}
		case 's3_delete_objects': {
			if (!bucket) return `delete ?${tag}`
			const keys = job.payload['keys']
			const count = Array.isArray(keys) ? keys.length : 0
			return count ? `delete ${count} object(s) in s3://${bucket}${tag}` : `delete objects in s3://${bucket}${tag}`
		}
		case 'transfer_sync_local_to_s3': {
			const dst = bucket ? `s3://${bucket}/${prefix ?? ''}` : 's3://?'
			const src = localPath ?? '?'
			return `${src} → ${dst}${tag}`
		}
		case 'transfer_sync_s3_to_local': {
			const src = bucket ? `s3://${bucket}/${prefix ?? ''}` : 's3://?'
			const dst = localPath ?? '?'
			return `${src} → ${dst}${tag}`
		}
		case 'transfer_sync_staging_to_s3': {
			const dest = formatS3Destination(bucket, prefix)
			const fileCountLabel = totalFiles != null ? `${totalFiles} file${totalFiles === 1 ? '' : 's'}` : null
			const totalBytesLabel = totalBytes != null ? formatBytes(totalBytes) : null
			const metricLabel = [fileCountLabel, totalBytesLabel].filter(Boolean).join(' · ')
			let subject: string | null = null
			if (rootName) {
				subject = rootKind === 'folder' ? `${rootName}/` : rootName
			} else if (label) {
				subject = label
			} else if (fileCountLabel) {
				subject = fileCountLabel
			} else if (uploadId) {
				subject = uploadId
			} else {
				subject = '?'
			}
			const detail = metricLabel && subject !== metricLabel ? ` (${metricLabel})` : ''
			return dest ? `upload ${subject}${detail} → ${dest}${tag}` : `upload ${subject}${detail}${tag}`
		}
		case 'transfer_delete_prefix': {
			if (!bucket) return `rm ?${tag}`
			if (deleteAll) return `rm s3://${bucket}/*${tag}`
			if (prefix) return `rm s3://${bucket}/${prefix}*${tag}`
			return `rm s3://${bucket}/?${tag}`
		}
		case 'transfer_copy_object': {
			if (!srcBucket || !srcKey || !dstBucket || !dstKey) return `cp ?${tag}`
			return `cp s3://${srcBucket}/${srcKey} → s3://${dstBucket}/${dstKey}${tag}`
		}
		case 'transfer_move_object': {
			if (!srcBucket || !srcKey || !dstBucket || !dstKey) return `mv ?${tag}`
			return `mv s3://${srcBucket}/${srcKey} → s3://${dstBucket}/${dstKey}${tag}`
		}
		case 'transfer_copy_batch': {
			if (!srcBucket || !dstBucket) return `cp ?${tag}`
			const items = job.payload['items']
			const count = Array.isArray(items) ? items.length : 0
			const first = Array.isArray(items) && items.length ? (items[0] as Record<string, unknown>) : null
			const firstDstKey = first && typeof first['dstKey'] === 'string' ? String(first['dstKey']) : ''
			const dstHint = firstDstKey ? parentPrefixFromKey(firstDstKey) : ''
			return count ? `cp ${count} object(s) → s3://${dstBucket}/${dstHint}${tag}` : `cp batch s3://${srcBucket} → s3://${dstBucket}${tag}`
		}
		case 'transfer_move_batch': {
			if (!srcBucket || !dstBucket) return `mv ?${tag}`
			const items = job.payload['items']
			const count = Array.isArray(items) ? items.length : 0
			const first = Array.isArray(items) && items.length ? (items[0] as Record<string, unknown>) : null
			const firstDstKey = first && typeof first['dstKey'] === 'string' ? String(first['dstKey']) : ''
			const dstHint = firstDstKey ? parentPrefixFromKey(firstDstKey) : ''
			return count ? `mv ${count} object(s) → s3://${dstBucket}/${dstHint}${tag}` : `mv batch s3://${srcBucket} → s3://${dstBucket}${tag}`
		}
		case 'transfer_copy_prefix': {
			if (!srcBucket || !srcPrefix || !dstBucket) return `cp ?${tag}`
			const dst = dstPrefix ? `s3://${dstBucket}/${dstPrefix}` : `s3://${dstBucket}/`
			return `cp s3://${srcBucket}/${srcPrefix}* → ${dst}${tag}`
		}
		case 'transfer_move_prefix': {
			if (!srcBucket || !srcPrefix || !dstBucket) return `mv ?${tag}`
			const dst = dstPrefix ? `s3://${dstBucket}/${dstPrefix}` : `s3://${dstBucket}/`
			return `mv s3://${srcBucket}/${srcPrefix}* → ${dst}${tag}`
		}
		case 's3_index_objects': {
			if (!bucket) return 'index ?'
			const range = prefix ? `s3://${bucket}/${prefix}*` : `s3://${bucket}/*`
			return `index ${range}${fullReindex ? '' : ' (incremental)'}`
		}
		default:
			return null
	}
}

export function formatProgress(p?: JobProgress | null): string {
	if (!p) return '-'
	const opsDone = p.objectsDone ?? 0
	const opsTotal = p.objectsTotal ?? null
	const opsPerSecond = p.objectsPerSecond ?? 0
	const bytesDone = p.bytesDone ?? 0
	const bytesTotal = p.bytesTotal ?? null
	const speed = p.speedBps ?? 0
	const eta = p.etaSeconds ?? 0
	const parts = []
	if (opsTotal != null) parts.push(`${opsDone}/${opsTotal} ops`)
	else if (opsDone) parts.push(`${opsDone} ops`)

	if (bytesTotal != null) parts.push(`${formatBytes(bytesDone)}/${formatBytes(bytesTotal)}`)
	else if (bytesDone) parts.push(formatBytes(bytesDone))
	if (speed) parts.push(`${formatBytes(speed)}/s`)
	else if (opsPerSecond) parts.push(`${opsPerSecond} ops/s`)
	if (eta) parts.push(`${formatDurationSeconds(eta)} eta`)
	return parts.join(' · ') || '-'
}
