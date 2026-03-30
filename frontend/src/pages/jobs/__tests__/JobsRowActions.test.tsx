import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Job } from '../../../api/types'
import { ensureDomShims } from '../../../test/domShims'
import { JobsRowActions } from '../JobsRowActions'

const confirmDangerActionMock = vi.fn()

vi.mock('../../../lib/confirmDangerAction', () => ({
	confirmDangerAction: (options: { onConfirm: () => Promise<void> | void }) => confirmDangerActionMock(options),
}))

vi.mock('../../../components/MenuPopover', () => ({
	MenuPopover: ({ menu, children }: { menu: { items?: Array<Record<string, unknown>> }; children: (args: { toggle: () => void }) => ReactNode }) => (
		<div>
			{children({ toggle: vi.fn() })}
			<div>
				{menu.items?.map((item) => {
					if (!item || item.type === 'divider') return null
					return (
						<button
							key={String(item.key)}
							type="button"
							disabled={Boolean(item.disabled)}
							onClick={() => (item.onClick as (() => void) | undefined)?.()}
						>
							{typeof item.label === 'string' ? item.label : String(item.key)}
						</button>
					)
				})}
			</div>
		</div>
	),
}))

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	confirmDangerActionMock.mockClear()
})

const baseJob: Job = {
	id: 'job-1',
	type: 'transfer_sync_staging_to_s3',
	status: 'failed',
	payload: {},
	createdAt: '2026-03-09T09:40:17Z',
	error: null,
	errorCode: null,
}

describe('JobsRowActions', () => {
	it('renders details, logs, and actions controls', () => {
		const { getByRole } = render(
			<JobsRowActions
				job={baseJob}
				apiToken="token-a"
				isOffline={false}
				isLogsLoading={false}
				activeLogJobId={null}
				cancelingJobId={null}
				retryingJobId={null}
				deletingJobId={null}
				cancelPending={false}
				retryPending={false}
				deletePending={false}
				profileId="profile-1"
				jobSummary="summary"
				onOpenDetails={vi.fn()}
				onOpenLogs={vi.fn()}
				onRequestCancelJob={vi.fn()}
				onRequestRetryJob={vi.fn()}
				onRequestDeleteJob={vi.fn(async () => {})}
				onQueueDownloadJobArtifact={vi.fn()}
			/>,
		)

		expect(getByRole('button', { name: 'Details' })).toBeInTheDocument()
		expect(getByRole('button', { name: 'Logs' })).toBeInTheDocument()
		expect(getByRole('button', { name: 'Open actions menu' })).toBeInTheDocument()
	})

	it('ignores stale delete confirmations after the jobs context changes', async () => {
		const onRequestDeleteJob = vi.fn(async () => {})
		const view = render(
			<JobsRowActions
				job={baseJob}
				apiToken="token-a"
				isOffline={false}
				isLogsLoading={false}
				activeLogJobId={null}
				cancelingJobId={null}
				retryingJobId={null}
				deletingJobId={null}
				cancelPending={false}
				retryPending={false}
				deletePending={false}
				profileId="profile-1"
				jobSummary="summary"
				onOpenDetails={vi.fn()}
				onOpenLogs={vi.fn()}
				onRequestCancelJob={vi.fn()}
				onRequestRetryJob={vi.fn()}
				onRequestDeleteJob={onRequestDeleteJob}
				onQueueDownloadJobArtifact={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Delete record' }))

		const confirmCall = confirmDangerActionMock.mock.calls.at(-1)?.[0] as { onConfirm: () => Promise<void> | void } | undefined
		expect(confirmCall).toBeDefined()

		view.rerender(
			<JobsRowActions
				job={baseJob}
				apiToken="token-b"
				isOffline={false}
				isLogsLoading={false}
				activeLogJobId={null}
				cancelingJobId={null}
				retryingJobId={null}
				deletingJobId={null}
				cancelPending={false}
				retryPending={false}
				deletePending={false}
				profileId="profile-2"
				jobSummary="summary"
				onOpenDetails={vi.fn()}
				onOpenLogs={vi.fn()}
				onRequestCancelJob={vi.fn()}
				onRequestRetryJob={vi.fn()}
				onRequestDeleteJob={onRequestDeleteJob}
				onQueueDownloadJobArtifact={vi.fn()}
			/>,
		)

		await act(async () => {
			await confirmCall?.onConfirm()
		})

		expect(onRequestDeleteJob).not.toHaveBeenCalled()
	})
})
