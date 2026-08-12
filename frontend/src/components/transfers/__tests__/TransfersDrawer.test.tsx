import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TransfersDrawer, type TransfersDrawerProps } from '../TransfersDrawer'

function buildProps(overrides: Partial<TransfersDrawerProps> = {}): TransfersDrawerProps {
	return {
		open: true,
		onClose: vi.fn(),
		tab: 'uploads',
		onTabChange: vi.fn(),
		activeDownloadCount: 0,
		activeUploadCount: 1,
		activeTransferCount: 1,
		downloadTasks: [],
		uploadTasks: [
			{
				id: 'upload-commit',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'photos/',
				fileCount: 1,
				status: 'commit',
				createdAtMs: 1,
				loadedBytes: 1024,
				totalBytes: 1024,
				speedBps: 0,
				etaSeconds: 0,
				label: 'Upload: one file',
			},
		],
		downloadSummaryText: '',
		uploadSummaryText: '',
		hasCompletedDownloads: false,
		hasCompletedUploads: false,
		onClearCompletedDownloads: vi.fn(),
		onClearCompletedUploads: vi.fn(),
		onClearAll: vi.fn(),
		onCancelDownload: vi.fn(),
		onRetryDownload: vi.fn(),
		onRemoveDownload: vi.fn(),
		onCancelUpload: vi.fn(),
		onRetryUpload: vi.fn(),
		onRemoveUpload: vi.fn(),
		onOpenJobs: vi.fn(),
		...overrides,
	}
}

afterEach(() => {
	document.body.style.overflow = ''
	vi.unstubAllGlobals()
})

describe('TransfersDrawer', () => {
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

	it('hides unavailable clear actions when only commit uploads remain visible', () => {
		render(<TransfersDrawer {...buildProps()} />)

		expect(screen.queryByRole('button', { name: 'Clear done' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
		expect(screen.getByText('Committing')).toBeInTheDocument()
		expect(screen.getByRole('list', { name: 'Upload transfers' })).toBeInTheDocument()
		expect(screen.getByRole('listitem', { name: /Upload Upload: one file, Committing/i })).toBeInTheDocument()
	})

	it('exposes download transfer rows as a named list', () => {
		render(
			<TransfersDrawer
				{...buildProps({
					tab: 'downloads',
					activeDownloadCount: 1,
					activeUploadCount: 0,
					downloadTasks: [
						{
							id: 'download-1',
							kind: 'object',
							profileId: 'profile-1',
							bucket: 'bucket-a',
							key: 'reports/demo.csv',
							label: 'demo.csv',
							status: 'running',
							createdAtMs: 1,
							loadedBytes: 512,
							totalBytes: 1024,
							speedBps: 128,
							etaSeconds: 4,
						},
					],
					uploadTasks: [],
				})}
			/>,
		)

		expect(screen.getByRole('list', { name: 'Download transfers' })).toBeInTheDocument()
		expect(screen.getByRole('listitem', { name: /Download demo.csv, Downloading/i })).toBeInTheDocument()
	})

	it('windows large transfer queues', () => {
		const uploadTasks = Array.from({ length: 200 }, (_, index) => ({
			id: `upload-${index}`,
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'photos/',
			fileCount: 1,
			status: 'queued' as const,
			createdAtMs: index,
			loadedBytes: 0,
			totalBytes: 1024,
			speedBps: 0,
			etaSeconds: 0,
			label: `Upload ${index}`,
		}))

		render(<TransfersDrawer {...buildProps({ uploadTasks })} />)

		expect(screen.getAllByRole('listitem')).toHaveLength(12)
		expect(screen.getByText('Upload 0')).toBeInTheDocument()
		expect(screen.queryByText('Upload 199')).not.toBeInTheDocument()
	})
})
