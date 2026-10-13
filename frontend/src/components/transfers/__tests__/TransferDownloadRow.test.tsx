import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MouseEvent } from 'react'

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
		expect(screen.queryByRole('button', { name: 'Remove download Download job artifact' })).not.toBeInTheDocument()
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
		expect(screen.getByRole('button', { name: 'Remove download Download job artifact' })).toHaveTextContent('Remove')
		expect(screen.getByRole('button', { name: 'Remove download Download job artifact' })).not.toHaveClass('ant-btn-dangerous')
		expect(screen.getByRole('button', { name: 'Remove download Download job artifact' })).toHaveAttribute('title', 'Remove from transfer history')
		expect(screen.getByText('0 B/4.00 KB')).toBeInTheDocument()
	})

	it('shows speed and ETA while a download is running', () => {
		render(
			<TransferDownloadRow
				task={{ ...buildDownloadTask(), status: 'running', loadedBytes: 2048, speedBps: 1024, etaSeconds: 2 }}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
				onRemove={vi.fn()}
			/>,
		)

		expect(screen.getByText('2.00 KB/4.00 KB · 1.00 KB/s · 2s eta')).toBeInTheDocument()
	})

	it('keeps downloaded bytes without an invented percentage until the total is known', () => {
		const callbacks = { onCancel: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn() }
		const task = { ...buildDownloadTask(), status: 'running' as const, loadedBytes: 2048, totalBytes: undefined, speedBps: 1024, etaSeconds: 0 }
		const { rerender } = render(<TransferDownloadRow task={task} {...callbacks} />)
		expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
		expect(screen.getByText('2.00 KB · Total size unknown · 1.00 KB/s · -')).toBeInTheDocument()

		rerender(<TransferDownloadRow task={{ ...task, totalBytes: 4096 }} {...callbacks} />)
		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
		expect(screen.queryByText(/Total size unknown/)).not.toBeInTheDocument()

		rerender(<TransferDownloadRow task={{ ...task, status: 'succeeded' }} {...callbacks} />)
		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
		expect(screen.getByText('2.00 KB')).toBeInTheDocument()
		expect(screen.queryByText(/Total size unknown|KB\/s/)).not.toBeInTheDocument()
	})

	it.each([0, 1])('forwards removal click detail %s with the task identity', (detail) => {
		const onRemove = vi.fn((taskId: string, event?: MouseEvent<HTMLElement>) => ({ taskId, detail: event?.detail, ownsFocus: document.activeElement === event?.currentTarget }))
		render(<TransferDownloadRow task={{ ...buildDownloadTask(), status: 'succeeded' }} onCancel={vi.fn()} onRetry={vi.fn()} onRemove={onRemove} />)
		const remove = screen.getByRole('button', { name: 'Remove download Download job artifact' })
		remove.focus()
		fireEvent.click(remove, { detail })
		expect(onRemove).toHaveReturnedWith({ taskId: 'download-1', detail, ownsFocus: true })
	})

	it.each(['succeeded', 'failed', 'canceled'] as const)('keeps byte progress without stale speed or ETA after a download is %s', (status) => {
		const loadedBytes = status === 'succeeded' ? 4096 : 2048
		render(
			<TransferDownloadRow
				task={{ ...buildDownloadTask(), status, loadedBytes, speedBps: 1024, etaSeconds: 2 }}
				onCancel={vi.fn()}
				onRetry={vi.fn()}
				onRemove={vi.fn()}
			/>,
		)

		expect(screen.getByText(`${status === 'succeeded' ? '4.00' : '2.00'} KB/4.00 KB`)).toBeInTheDocument()
		expect(screen.queryByText(/KB\/s|eta/)).not.toBeInTheDocument()
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
 it('lets users explicitly prepare a fresh link after browser handoff', () => {
  const retry = vi.fn()
  render(<TransferDownloadRow task={{ ...buildDownloadTask(), status: 'handed_off' }} onRetry={retry} onCancel={vi.fn()} onRemove={vi.fn()} />)
  const button = screen.getByRole('button', { name: 'Download again download Download job artifact' })
  expect(button).toHaveAttribute('title', expect.stringMatching(/browser|duplicate/i))
  fireEvent.click(button)
  expect(retry).toHaveBeenCalledTimes(1)
 })

})
