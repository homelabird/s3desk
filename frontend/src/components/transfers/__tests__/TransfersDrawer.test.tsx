import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'

import { TransfersDrawer, type TransfersDrawerProps } from '../TransfersDrawer'
import { DialogModal } from '../../DialogModal'
import type { DownloadTask, TransfersTab, UploadTask } from '../transferTypes'

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
		onClearFinished: vi.fn(),
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

function RemovalExample(props: { tab?: TransfersTab; keepTask?: boolean; openOtherDialog?: boolean }) {
	const [downloads, setDownloads] = useState<DownloadTask[]>(() => Array.from({ length: 3 }, (_, index) => ({
		id: `download-${index + 1}`, kind: 'object', profileId: 'profile-1', bucket: 'bucket-a',
		key: `download-${index + 1}.txt`, label: `download-${index + 1}.txt`, status: 'succeeded',
		createdAtMs: index + 1, loadedBytes: 1024, totalBytes: 1024, speedBps: 0, etaSeconds: 0,
	})))
	const [uploads, setUploads] = useState<UploadTask[]>(() => Array.from({ length: 3 }, (_, index) => ({
		...buildProps().uploadTasks[0], id: `upload-${index + 1}`, label: `upload-${index + 1}.csv`, status: 'succeeded',
	})))
	const [otherOpen, setOtherOpen] = useState(false)
	return (
		<>
			<TransfersDrawer {...buildProps({
				tab: props.tab ?? 'downloads', downloadTasks: downloads, uploadTasks: uploads,
				activeUploadCount: 0, activeTransferCount: 0,
				hasCompletedDownloads: downloads.length > 0, hasCompletedUploads: uploads.length > 0,
				onRemoveDownload: (taskId) => {
					if (props.keepTask) return
					setDownloads((tasks) => tasks.filter((task) => task.id !== taskId))
					if (props.openOtherDialog) setOtherOpen(true)
				},
				onRemoveUpload: (taskId) => setUploads((tasks) => tasks.filter((task) => task.id !== taskId)),
			})} />
			<DialogModal open={otherOpen} title="Other action" onClose={() => setOtherOpen(false)}>
				<button>Other action button</button>
			</DialogModal>
		</>
	)
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

	it.each(['downloads', 'uploads'] as const)('restores keyboard removal to the next or previous Remove action and then the %s tab', (tab) => {
		render(<RemovalExample tab={tab} />)
		const kind = tab === 'downloads' ? 'download' : 'upload'
		const extension = kind === 'download' ? 'txt' : 'csv'
		const remove = (index: number) => screen.getByRole('button', { name: `Remove ${kind} ${kind}-${index}.${extension}` })
		remove(1).focus()
		fireEvent.click(remove(1), { detail: 0 })
		expect(remove(2)).toHaveFocus()
		remove(3).focus()
		fireEvent.click(remove(3), { detail: 0 })
		expect(remove(2)).toHaveFocus()
		fireEvent.click(remove(2), { detail: 0 })
		expect(screen.getByRole('tab', { name: new RegExp(tab, 'i') })).toHaveFocus()
	}, 15_000)

	it('does not jump to another action after pointer removal', () => {
		render(<RemovalExample />)
		const remove = screen.getByRole('button', { name: 'Remove download download-1.txt' })
		remove.focus()
		fireEvent.click(remove, { detail: 1 })
		expect(screen.getByRole('button', { name: 'Remove download download-2.txt' })).not.toHaveFocus()
		expect(document.body).toHaveFocus()
	})

	it('preserves existing focus when the removed action does not own it', () => {
		render(<RemovalExample />)
		const close = screen.getByRole('button', { name: 'Close' })
		close.focus()
		fireEvent.click(screen.getByRole('button', { name: 'Remove download download-1.txt' }), { detail: 0 })
		expect(close).toHaveFocus()
	})

	it('keeps focus on a keyboard action when its callback does not remove the task', () => {
		render(<RemovalExample keepTask />)
		const remove = screen.getByRole('button', { name: 'Remove download download-1.txt' })
		remove.focus()
		fireEvent.click(remove, { detail: 0 })
		expect(remove).toHaveFocus()
	})

	it('does not restore transfer focus while a subsequent dialog opens', async () => {
		render(<RemovalExample openOtherDialog />)
		const next = screen.getByRole('button', { name: 'Remove download download-2.txt' })
		const focus = vi.spyOn(next, 'focus')
		const remove = screen.getByRole('button', { name: 'Remove download download-1.txt' })
		remove.focus()
		fireEvent.click(remove, { detail: 0 })
		await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Other action' })).getByRole('button', { name: 'Close' })).toHaveFocus())
		expect(focus).not.toHaveBeenCalled()
	})

	it('hides unavailable clear actions when only commit uploads remain visible', () => {
		render(<TransfersDrawer {...buildProps()} />)

		expect(screen.queryByRole('button', { name: 'Clear done' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Clear all finished' })).not.toBeInTheDocument()
		expect(screen.getByText('Committing')).toBeInTheDocument()
		expect(screen.getByRole('list', { name: 'Upload transfers' })).toBeInTheDocument()
		expect(screen.getByRole('listitem', { name: /Upload Upload: one file, Committing/i })).toBeInTheDocument()
	})

	it('names the all-queues clear action when only the hidden upload queue has finished transfers', () => {
		const props = buildProps({ tab: 'downloads', activeUploadCount: 0, activeTransferCount: 0 })
		props.uploadTasks = props.uploadTasks.map((task) => ({ ...task, status: 'failed' }))
		render(<TransfersDrawer {...props} />)

		expect(screen.getByText('No downloads yet')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Clear done' })).not.toBeInTheDocument()
		fireEvent.click(screen.getByRole('button', { name: 'Clear all finished' }))
		expect(props.onClearFinished).toHaveBeenCalledTimes(1)
		expect(props.onClearCompletedDownloads).not.toHaveBeenCalled()
		expect(props.onClearCompletedUploads).not.toHaveBeenCalled()
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
