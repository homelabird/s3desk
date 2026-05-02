import type { QueryClient } from '@tanstack/react-query'

import { queryKeys } from '../../api/queryKeys'
import type { Job, JobCreateRequest } from '../../api/types'
import { objectsFeedback } from './objectsFeedback'
import { confirmMoveFolderDrop, confirmMoveObjectsDrop, showObjectsJobStartedFeedback } from './objectsJobFeedback'
import { displayNameForKey, folderLabelFromPrefix, normalizePrefix } from './objectsListUtils'

export type ObjectsDndPayload =
	| { kind: 'objects'; bucket: string; keys: string[] }
	| { kind: 'prefix'; bucket: string; prefix: string }

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type PerformObjectsDropArgs = {
	payload: ObjectsDndPayload
	targetPrefixRaw: string
	mode: 'copy' | 'move'
	profileId: string | null
	apiToken: string
	bucket: string
	prefix: string
	contextVersion: number
	isCurrentContext: (contextVersion: number) => boolean
	createJobWithRetry: CreateJobWithRetry
	queryClient: QueryClient
	onOpenJobs: () => void
}

export function showObjectsDndLocalFilesOnFolderTargetUnsupported() {
	objectsFeedback.localFilesOnFolderTargetUnsupported()
}

export function showObjectsDndError(error: unknown) {
	objectsFeedback.error(error)
}

function normalizeDropTargetPrefix(raw: string): string {
	const trimmed = raw.trim()
	if (!trimmed || trimmed === '/') return ''
	return normalizePrefix(trimmed)
}

async function createJobAndNotify({
	req,
	profileId,
	apiToken,
	contextVersion,
	isCurrentContext,
	createJobWithRetry,
	queryClient,
	onOpenJobs,
}: {
	req: JobCreateRequest
	profileId: string
	apiToken: string
	contextVersion: number
	isCurrentContext: (contextVersion: number) => boolean
	createJobWithRetry: CreateJobWithRetry
	queryClient: QueryClient
	onOpenJobs: () => void
}) {
	const job = await createJobWithRetry(req)
	await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.scope(profileId, apiToken), exact: false })
	if (!isCurrentContext(contextVersion)) return job
	showObjectsJobStartedFeedback({ jobId: job.id, label: 'Task', onOpenJobs })
	return job
}

export async function performObjectsDrop({
	payload,
	targetPrefixRaw,
	mode,
	profileId,
	apiToken,
	bucket,
	prefix,
	contextVersion,
	isCurrentContext,
	createJobWithRetry,
	queryClient,
	onOpenJobs,
}: PerformObjectsDropArgs) {
	if (!profileId || !bucket) return
	if (payload.bucket !== bucket) {
		objectsFeedback.dragDropAcrossBucketsUnsupported()
		return
	}

	const targetPrefix = normalizeDropTargetPrefix(targetPrefixRaw)
	const notifyJob = (req: JobCreateRequest) =>
		createJobAndNotify({
			req,
			profileId,
			apiToken,
			contextVersion,
			isCurrentContext,
			createJobWithRetry,
			queryClient,
			onOpenJobs,
		})

	if (payload.kind === 'prefix') {
		const srcPrefix = normalizePrefix(payload.prefix)
		const folderName = folderLabelFromPrefix(srcPrefix)
		const dstPrefix = `${targetPrefix}${folderName}/`

		if (dstPrefix === srcPrefix) {
			objectsFeedback.alreadyInDestination()
			return
		}
		if (dstPrefix.startsWith(srcPrefix)) {
			objectsFeedback.cannotMoveCopyFolderIntoItself()
			return
		}

		const doCreate = async () =>
			notifyJob({
				type: mode === 'copy' ? 'transfer_copy_prefix' : 'transfer_move_prefix',
				payload: {
					srcBucket: bucket,
					srcPrefix,
					dstBucket: bucket,
					dstPrefix,
					include: [],
					exclude: [],
					dryRun: false,
				},
			})

		if (mode === 'move') {
			if (!isCurrentContext(contextVersion)) return
			confirmMoveFolderDrop({
				bucket,
				dstPrefix,
				srcPrefix,
				onConfirm: async () => {
					if (!isCurrentContext(contextVersion)) return
					await doCreate()
				},
			})
			return
		}

		await doCreate()
		return
	}

	const keys = payload.keys.filter(Boolean)
	if (keys.length < 1) return

	const pairs = keys
		.map((srcKey) => {
			const name = displayNameForKey(srcKey, prefix)
			const dstKey = `${targetPrefix}${name}`
			return { srcKey, dstKey }
		})
		.filter((p) => p.srcKey && p.dstKey)
		.filter((p) => p.srcKey !== p.dstKey)

	if (pairs.length === 0) {
		objectsFeedback.alreadyInDestination()
		return
	}

	const doCreate = async () => {
		if (pairs.length > 1) {
			return notifyJob({
				type: mode === 'copy' ? 'transfer_copy_batch' : 'transfer_move_batch',
				payload: {
					srcBucket: bucket,
					dstBucket: bucket,
					items: pairs,
					dryRun: false,
				},
			})
		}
		return notifyJob({
			type: mode === 'copy' ? 'transfer_copy_object' : 'transfer_move_object',
			payload: {
				srcBucket: bucket,
				srcKey: pairs[0].srcKey,
				dstBucket: bucket,
				dstKey: pairs[0].dstKey,
				dryRun: false,
			},
		})
	}

	if (mode === 'move') {
		if (!isCurrentContext(contextVersion)) return
		confirmMoveObjectsDrop({
			bucket,
			count: pairs.length,
			targetPrefix,
			onConfirm: async () => {
				if (!isCurrentContext(contextVersion)) return
				await doCreate()
			},
		})
		return
	}

	await doCreate()
}
