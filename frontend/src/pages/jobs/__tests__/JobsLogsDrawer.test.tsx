import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { JobsLogsDrawer } from '../JobsLogsDrawer'

beforeAll(() => {
	ensureDomShims()
})

describe('JobsLogsDrawer', () => {
	it('surfaces severity counts and quick navigation for visible log lines', () => {
		render(
			<JobsLogsDrawer
				open
				onClose={vi.fn()}
				drawerWidth={720}
				activeLogJobId="job-1"
				isLogsLoading={false}
				onRefresh={vi.fn()}
				followLogs
				onFollowLogsChange={vi.fn()}
				logPollPaused={false}
				logPollFailures={0}
				onResumeLogPolling={vi.fn()}
				logSearchQuery=""
				onLogSearchQueryChange={vi.fn()}
				onCopyVisibleLogs={vi.fn(async () => {})}
				normalizedLogSearchQuery=""
				visibleLogEntries={[
					'2026-03-11T09:00:01Z INFO started sync',
					'2026-03-11T09:00:02Z WARN slow downstream',
					'2026-03-11T09:00:03Z ERROR transfer failed',
				]}
				activeLogLines={3}
				onLogsContainerRef={vi.fn()}
				visibleLogText={[
					'2026-03-11T09:00:01Z INFO started sync',
					'2026-03-11T09:00:02Z WARN slow downstream',
					'2026-03-11T09:00:03Z ERROR transfer failed',
				].join('\n')}
				searchInputWidth={320}
			/>,
		)

		expect(screen.getByText(/Lines: 3/)).toBeInTheDocument()
		expect(screen.getByText(/Errors: 1/)).toBeInTheDocument()
		expect(screen.getByText(/Warnings: 1/)).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Jump to latest error' })).toBeInTheDocument()
		expect(screen.getByText('transfer failed')).toBeInTheDocument()
	})
})
