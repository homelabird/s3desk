import { useCallback } from 'react'

import { useLocalStorageState } from '../../lib/useLocalStorageState'

export type UploadTuning = {
	batchConcurrency: number
	batchBytes: number
	chunkSizeBytes: number
	chunkConcurrency: number
	chunkThresholdBytes: number
}

export function useTransfersUploadPreferences() {
	const [downloadLinkProxyEnabled] = useLocalStorageState<boolean>('downloadLinkProxyEnabled', false)
	const [uploadAutoTuneEnabled] = useLocalStorageState<boolean>('uploadAutoTuneEnabled', true)
	const [uploadBatchConcurrencySetting] = useLocalStorageState<number>('uploadBatchConcurrency', 16)
	const [uploadBatchBytesMiBSetting] = useLocalStorageState<number>('uploadBatchBytesMiB', 64)
	const [uploadChunkSizeMiBSetting] = useLocalStorageState<number>('uploadChunkSizeMiB', 128)
	const [uploadChunkConcurrencySetting] = useLocalStorageState<number>('uploadChunkConcurrency', 8)
	const [uploadChunkThresholdMiBSetting] = useLocalStorageState<number>('uploadChunkThresholdMiB', 256)
	const [uploadChunkFileConcurrency] = useLocalStorageState<number>('uploadChunkFileConcurrency', 2)
	const [uploadResumeConversionEnabled] = useLocalStorageState<boolean>('uploadResumeConversionEnabled', false)

	const uploadBatchConcurrency = Math.min(
		32,
		Math.max(1, Number.isFinite(uploadBatchConcurrencySetting) ? uploadBatchConcurrencySetting : 16),
	)
	const uploadBatchBytesMiB = Math.min(256, Math.max(8, Number.isFinite(uploadBatchBytesMiBSetting) ? uploadBatchBytesMiBSetting : 64))
	const uploadChunkSizeMiB = Math.min(512, Math.max(16, Number.isFinite(uploadChunkSizeMiBSetting) ? uploadChunkSizeMiBSetting : 128))
	const uploadChunkConcurrency = Math.min(
		16,
		Math.max(1, Number.isFinite(uploadChunkConcurrencySetting) ? uploadChunkConcurrencySetting : 8),
	)
	const uploadChunkThresholdMiB = Math.min(
		2048,
		Math.max(64, Number.isFinite(uploadChunkThresholdMiBSetting) ? uploadChunkThresholdMiBSetting : 256),
	)
	const uploadBatchBytes = uploadBatchBytesMiB * 1024 * 1024
	const uploadChunkSizeBytes = uploadChunkSizeMiB * 1024 * 1024
	const uploadChunkThresholdBytes = uploadChunkThresholdMiB * 1024 * 1024

	const pickUploadTuning = useCallback(
		(totalBytes: number, maxFileBytes: number | null): UploadTuning => {
			if (!uploadAutoTuneEnabled) {
				return {
					batchConcurrency: uploadBatchConcurrency,
					batchBytes: uploadBatchBytes,
					chunkSizeBytes: uploadChunkSizeBytes,
					chunkConcurrency: uploadChunkConcurrency,
					chunkThresholdBytes: uploadChunkThresholdBytes,
				}
			}

			const size = Math.max(totalBytes, maxFileBytes ?? 0)
			const mib = size / (1024 * 1024)

			if (mib <= 256) {
				return {
					batchConcurrency: 8,
					batchBytes: 32 * 1024 * 1024,
					chunkSizeBytes: 64 * 1024 * 1024,
					chunkConcurrency: 4,
					chunkThresholdBytes: 128 * 1024 * 1024,
				}
			}
			if (mib <= 2048) {
				return {
					batchConcurrency: 16,
					batchBytes: 64 * 1024 * 1024,
					chunkSizeBytes: 128 * 1024 * 1024,
					chunkConcurrency: 8,
					chunkThresholdBytes: 256 * 1024 * 1024,
				}
			}
			if (mib <= 8192) {
				return {
					batchConcurrency: 24,
					batchBytes: 96 * 1024 * 1024,
					chunkSizeBytes: 256 * 1024 * 1024,
					chunkConcurrency: 12,
					chunkThresholdBytes: 512 * 1024 * 1024,
				}
			}
			return {
				batchConcurrency: 32,
				batchBytes: 128 * 1024 * 1024,
				chunkSizeBytes: 256 * 1024 * 1024,
				chunkConcurrency: 16,
				chunkThresholdBytes: 512 * 1024 * 1024,
			}
		},
		[
			uploadAutoTuneEnabled,
			uploadBatchConcurrency,
			uploadBatchBytes,
			uploadChunkConcurrency,
			uploadChunkSizeBytes,
			uploadChunkThresholdBytes,
		],
	)

	return {
		downloadLinkProxyEnabled,
		uploadChunkFileConcurrency,
		uploadResumeConversionEnabled,
		pickUploadTuning,
	}
}
