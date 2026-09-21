import type { UploadCommitRequest } from '../../api/uploads'

/** The exact JSON body keeps the same intent across a lost commit response. */
export type PendingUploadCommit = { uploadId: string; body: string }
export function readPendingUploadCommit(raw: unknown): PendingUploadCommit | undefined {
	if (!raw || typeof raw !== 'object') return undefined
	const value = raw as Partial<PendingUploadCommit>
	if (typeof value.uploadId !== 'string' || !value.uploadId || value.uploadId.length > 256 || /[\r\n\0]/.test(value.uploadId) ||
		typeof value.body !== 'string' || value.body.length > 8 * 1024 * 1024) return undefined
	try {
		if (value.body) {
			const parsed: unknown = JSON.parse(value.body)
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
		}
		return { uploadId: value.uploadId, body: value.body }
	} catch { return undefined }
}
export function pendingCommitRequest(pending: PendingUploadCommit): UploadCommitRequest | undefined {
	return pending.body ? JSON.parse(pending.body) as UploadCommitRequest : undefined
}
