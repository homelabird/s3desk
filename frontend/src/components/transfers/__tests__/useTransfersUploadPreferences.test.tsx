import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
	DEFAULT_DOWNLOAD_TASK_CONCURRENCY,
	DEFAULT_UPLOAD_TASK_CONCURRENCY,
	DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY,
	MAX_UPLOAD_TASK_CONCURRENCY,
	MIN_DOWNLOAD_TASK_CONCURRENCY,
	UPLOAD_TASK_CONCURRENCY_STORAGE_KEY,
} from '../transferConcurrencyPreferences'
import { useTransfersUploadPreferences } from '../useTransfersUploadPreferences'

describe('useTransfersUploadPreferences', () => {
	const MiB = 1024 * 1024

	beforeEach(() => {
		window.localStorage.clear()
	})

	afterEach(() => {
		window.localStorage.clear()
	})

	it('uses conservative faster task concurrency defaults', () => {
		const { result } = renderHook(() => useTransfersUploadPreferences())

		expect(result.current.uploadTaskConcurrency).toBe(DEFAULT_UPLOAD_TASK_CONCURRENCY)
		expect(result.current.downloadTaskConcurrency).toBe(DEFAULT_DOWNLOAD_TASK_CONCURRENCY)
	})

	it('sanitizes persisted task concurrency settings', async () => {
		window.localStorage.setItem(UPLOAD_TASK_CONCURRENCY_STORAGE_KEY, JSON.stringify(MAX_UPLOAD_TASK_CONCURRENCY + 5))
		window.localStorage.setItem(DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY, JSON.stringify(MIN_DOWNLOAD_TASK_CONCURRENCY - 1))

		const { result } = renderHook(() => useTransfersUploadPreferences())

		expect(result.current.uploadTaskConcurrency).toBe(MAX_UPLOAD_TASK_CONCURRENCY)
		expect(result.current.downloadTaskConcurrency).toBe(MIN_DOWNLOAD_TASK_CONCURRENCY)

		await waitFor(() => {
			expect(window.localStorage.getItem(UPLOAD_TASK_CONCURRENCY_STORAGE_KEY)).toBe(
				JSON.stringify(MAX_UPLOAD_TASK_CONCURRENCY),
			)
			expect(window.localStorage.getItem(DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY)).toBe(
				JSON.stringify(MIN_DOWNLOAD_TASK_CONCURRENCY),
			)
		})
	})

	it('clamps manual upload tuning settings when auto-tune is disabled', () => {
		window.localStorage.setItem('uploadAutoTuneEnabled', JSON.stringify(false))
		window.localStorage.setItem('uploadBatchConcurrency', JSON.stringify(99))
		window.localStorage.setItem('uploadBatchBytesMiB', JSON.stringify(1))
		window.localStorage.setItem('uploadChunkSizeMiB', JSON.stringify(2048))
		window.localStorage.setItem('uploadChunkConcurrency', JSON.stringify(0))
		window.localStorage.setItem('uploadChunkThresholdMiB', JSON.stringify(99999))

		const { result } = renderHook(() => useTransfersUploadPreferences())

		expect(result.current.pickUploadTuning(32 * MiB, 16 * MiB)).toEqual({
			batchConcurrency: 32,
			batchBytes: 8 * MiB,
			chunkSizeBytes: 512 * MiB,
			chunkConcurrency: 1,
			chunkThresholdBytes: 2048 * MiB,
		})
	})

	it('picks upload tuning tiers from the larger of total bytes and max file bytes', () => {
		const { result } = renderHook(() => useTransfersUploadPreferences())

		expect(result.current.pickUploadTuning(128 * MiB, null)).toEqual({
			batchConcurrency: 8,
			batchBytes: 32 * MiB,
			chunkSizeBytes: 64 * MiB,
			chunkConcurrency: 4,
			chunkThresholdBytes: 128 * MiB,
		})
		expect(result.current.pickUploadTuning(512 * MiB, null)).toEqual({
			batchConcurrency: 16,
			batchBytes: 64 * MiB,
			chunkSizeBytes: 128 * MiB,
			chunkConcurrency: 8,
			chunkThresholdBytes: 256 * MiB,
		})
		expect(result.current.pickUploadTuning(1024 * MiB, 4096 * MiB)).toEqual({
			batchConcurrency: 24,
			batchBytes: 96 * MiB,
			chunkSizeBytes: 256 * MiB,
			chunkConcurrency: 12,
			chunkThresholdBytes: 512 * MiB,
		})
		expect(result.current.pickUploadTuning(1024 * MiB, 16384 * MiB)).toEqual({
			batchConcurrency: 32,
			batchBytes: 128 * MiB,
			chunkSizeBytes: 256 * MiB,
			chunkConcurrency: 16,
			chunkThresholdBytes: 512 * MiB,
		})
	})
})
