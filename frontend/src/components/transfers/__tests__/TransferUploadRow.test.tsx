import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TransferUploadRow } from '../TransferUploadRow'
import type { UploadTask } from '../transferTypes'

function buildUploadTask(): UploadTask {
	return {
		id: 'upload-1',
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'videos/',
		fileCount: 2,
		status: 'queued',
		createdAtMs: 1,
		loadedBytes: 0,
		totalBytes: 1024,
		speedBps: 0,
		etaSeconds: 0,
		label: 'Upload: 2 file(s)',
		filePaths: ['videos/clip.mp4', 'videos/notes.txt'],
		preview: {
			kind: 'video_frame',
			source: 'local',
			url: 'blob:preview-upload-1',
			label: 'videos/clip.mp4',
			width: 160,
			height: 90,
		},
	}
}

describe('TransferUploadRow', () => {
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

	it('renders a local video preview when present', () => {
		render(
			<TransferUploadRow
				task={buildUploadTask()}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
				onRemove={vi.fn()}
				onOpenJobs={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('transfer-upload-preview')).toHaveAttribute('src', 'blob:preview-upload-1')
		expect(screen.getByAltText('Local preview of videos/clip.mp4')).toBeInTheDocument()
		expect(screen.getByText('Local preview')).toBeInTheDocument()
		expect(screen.getByText('Preview frame: videos/clip.mp4.')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Cancel upload Upload: 2 file(s)' })).toHaveTextContent('Cancel')
		expect(screen.getByRole('button', { name: 'Remove upload Upload: 2 file(s)' })).toHaveTextContent('Remove')
	})

	it('keeps cancel available while a handed-off upload job is still waiting', () => {
		const onCancel = vi.fn()
		const jobId = 'job-1234567890abcdef1234567890abcdef'
		const task = {
			...buildUploadTask(),
			status: 'waiting_job' as const,
			jobId,
			error: 'Job polling unavailable',
		}

		render(
			<TransferUploadRow
				task={task}
				onCancel={onCancel}
				onRetry={vi.fn()}
				onRemove={vi.fn()}
				onOpenJobs={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Cancel upload Upload: 2 file(s)' }))

		expect(screen.getByText('Job polling unavailable')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Jobs for upload Upload: 2 file(s)' })).toHaveTextContent('Jobs')
		expect(screen.getByLabelText(`Job ${jobId}`)).toHaveAttribute('title', jobId)
		expect(screen.getByLabelText(`Job ${jobId}`)).toHaveTextContent('job-12345678...90abcdef')
		expect(screen.getByText('Transferring')).toHaveAttribute('aria-live', 'polite')
		expect(screen.getByText('0 B/1.00 KB · - · -')).not.toHaveAttribute('aria-live')
		expect(screen.getByText('Finalization: server job is applying uploaded files. Open Jobs for details.')).toBeInTheDocument()
		expect(onCancel).toHaveBeenCalledWith('upload-1')
		expect(screen.queryByRole('button', { name: 'Retry upload Upload: 2 file(s)' })).not.toBeInTheDocument()
	})

	it('labels retry actions with the upload context', () => {
		render(
			<TransferUploadRow
				task={{
					...buildUploadTask(),
					status: 'failed',
				}}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
				onRemove={vi.fn()}
				onOpenJobs={vi.fn()}
			/>,
		)

		expect(screen.getByRole('button', { name: 'Retry upload Upload: 2 file(s)' })).toHaveTextContent('Retry')
		expect(screen.getByText('Recovery: Retry will reuse remembered local files.')).toBeInTheDocument()
	})

	it('shows fallback path and file re-selection guidance for failed uploads', () => {
		render(
			<TransferUploadRow
				task={{
					...buildUploadTask(),
					status: 'failed',
					uploadMode: 'staging',
					uploadFallbackFrom: 'presigned',
					uploadFallbackReason: 'network_path_failed',
					retryFileHandleState: 'selection_required',
					error: 'Local files are no longer available.',
				}}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
				onRemove={vi.fn()}
				onOpenJobs={vi.fn()}
			/>,
		)

		expect(screen.getByText('Staging')).toBeInTheDocument()
		expect(screen.getByText('Fallback')).toBeInTheDocument()
		expect(screen.getByTestId('transfer-upload-recovery')).toHaveTextContent(
			'Fallback: Presigned browser upload failed on the network. Continuing with Staging upload.',
		)
		expect(screen.getByTestId('transfer-upload-recovery')).toHaveTextContent(
			'Recovery: Retry opens the file picker. Select the same files or folder to resume.',
		)
		expect(screen.getByRole('button', { name: 'Retry upload Upload: 2 file(s)' })).toHaveAttribute(
			'title',
			'Retry opens the file picker so you can select the same files or folder.',
		)
	})

	it('does not offer remove while an upload commit is finalizing', () => {
		render(
			<TransferUploadRow
				task={{
					...buildUploadTask(),
					status: 'commit',
					prefix: 'very/long/destination/path/that/needs/to/wrap/on/mobile/',
				}}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
				onRemove={vi.fn()}
				onOpenJobs={vi.fn()}
			/>,
		)

		const destination = screen.getByText('s3://bucket-a/very/long/destination/path/that/needs/to/wrap/on/mobile/')
		expect(destination.closest('[class*="rowDestination"]')).toBeTruthy()
		expect(screen.getByText('Finalizing upload…')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Cancel upload Upload: 2 file(s)' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Remove upload Upload: 2 file(s)' })).not.toBeInTheDocument()
	})
})
