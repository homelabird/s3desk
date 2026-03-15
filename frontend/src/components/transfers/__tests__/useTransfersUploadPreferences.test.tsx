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
})
