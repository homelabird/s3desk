import { render, screen } from '@testing-library/react'
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
		expect(screen.getByText('Preview frame: videos/clip.mp4')).toBeInTheDocument()
	})
})
