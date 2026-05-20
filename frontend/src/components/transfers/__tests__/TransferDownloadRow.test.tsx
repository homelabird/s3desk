import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TransferDownloadRow } from '../TransferDownloadRow'
import type { DownloadTask } from '../transferTypes'

function buildDownloadTask(): DownloadTask {
	return {
		id: 'download-1',
		profileId: 'profile-1',
		kind: 'job_artifact',
		jobId: 'job-1',
		label: 'Download job artifact',
		status: 'waiting',
		createdAtMs: 1,
		loadedBytes: 0,
		totalBytes: 4096,
		speedBps: 0,
		etaSeconds: 0,
	}
}

describe('TransferDownloadRow', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'ResizeObserver',
			class ResizeObserver {
				observe() {}
				unobserve() {}
				disconnect() {}
			},
		)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('announces status without making changing progress text live', () => {
		render(
			<TransferDownloadRow
				task={buildDownloadTask()}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
				onRemove={vi.fn()}
				onOpenJobs={vi.fn()}
			/>,
		)

		expect(screen.getByText('Waiting')).toHaveAttribute('aria-live', 'polite')
		expect(screen.getByText('Waiting for job to finish…')).not.toHaveAttribute('aria-live')
		expect(screen.getByRole('button', { name: 'Jobs for download Download job artifact' })).toHaveTextContent('Jobs')
		expect(screen.getByRole('button', { name: 'Cancel download Download job artifact' })).toHaveTextContent('Cancel')
		expect(screen.getByRole('button', { name: 'Remove download Download job artifact' })).toHaveTextContent('Remove')
	})

	it('labels retry actions with the download context', () => {
		render(
			<TransferDownloadRow
				task={{
					...buildDownloadTask(),
					status: 'failed',
				}}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
				onRemove={vi.fn()}
				onOpenJobs={vi.fn()}
			/>,
		)

		expect(screen.getByRole('button', { name: 'Retry download Download job artifact' })).toHaveTextContent('Retry')
	})

	it('renders long destinations as wrapping row text instead of an ellipsis-only label', () => {
		render(
			<TransferDownloadRow
				task={{
					...buildDownloadTask(),
					kind: 'object_device',
					bucket: 'bucket-a',
					key: 'very/long/source/path/that/should/wrap/on/mobile/report.csv',
					targetDirHandle: { name: 'Downloads' } as FileSystemDirectoryHandle,
					targetLabel: 'Downloads',
					targetPath: 'very/long/local/path/that/should/wrap/report.csv',
				}}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
				onRemove={vi.fn()}
				onOpenJobs={vi.fn()}
			/>,
		)

		const destination = screen.getByText(
			's3://bucket-a/very/long/source/path/that/should/wrap/on/mobile/report.csv → Downloads/very/long/local/path/that/should/wrap/report.csv',
		)
		expect(destination.closest('[class*="rowDestination"]')).toBeTruthy()
	})
})
