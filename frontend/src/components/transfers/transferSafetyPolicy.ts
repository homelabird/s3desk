export const TRANSFER_SAFETY_MODE_KEY = 'transferSafetyMode'
export type TransferSafetyMode = 'auto' | 'conservative' | 'unrestricted'
export type TransferEnvironment = {
	coarsePointer: boolean
	saveData: boolean
	effectiveType?: string
	deviceMemory?: number
}
export type TransferTuning = {
	batchConcurrency: number
	batchBytes: number
	chunkSizeBytes: number
	chunkConcurrency: number
	chunkThresholdBytes: number
}
export const MiB = 1024 * 1024
export const MAX_BUFFERED_DOWNLOAD_BYTES = 128 * MiB
export const NATIVE_DOWNLOAD_THRESHOLD_BYTES = 32 * MiB

export function sanitizeTransferSafetyMode(value: unknown): TransferSafetyMode {
	return value === 'conservative' || value === 'unrestricted' ? value : 'auto'
}

export function needsConservativeTransfers(mode: TransferSafetyMode, env: TransferEnvironment): boolean {
	if (mode === 'unrestricted') return false
	return mode === 'conservative' || env.coarsePointer || env.saveData ||
		['slow-2g', '2g', '3g'].includes(env.effectiveType ?? '') ||
		(typeof env.deviceMemory === 'number' && env.deviceMemory > 0 && env.deviceMemory <= 4)
}

export function constrainUploadTuning(tuning: TransferTuning, maxFileBytes: number | null, conservative: boolean, saveData: boolean): TransferTuning {
	if (!conservative) return tuning
	// Limit requests, not merely task count. Still respect S3's 10,000-part limit.
	const requiredPartSize = Math.ceil(Math.max(0, typeof maxFileBytes === 'number' && Number.isFinite(maxFileBytes) ? maxFileBytes : 0) / 10_000 / MiB) * MiB
	if (requiredPartSize > 512 * MiB) throw new Error('File exceeds the supported multipart size limit.')
	const chunkSizeBytes = Math.max(saveData ? 16 * MiB : 32 * MiB, requiredPartSize)
	return {
		batchConcurrency: Math.min(tuning.batchConcurrency, 2),
		batchBytes: Math.min(tuning.batchBytes, 16 * MiB),
		chunkSizeBytes,
		chunkConcurrency: Math.min(tuning.chunkConcurrency, 2),
		chunkThresholdBytes: Math.min(tuning.chunkThresholdBytes, 64 * MiB),
	}
}

export function shouldUseNativeDownload(bytes: number | undefined, conservative: boolean): boolean {
	return conservative || typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0 || bytes > NATIVE_DOWNLOAD_THRESHOLD_BYTES
}
