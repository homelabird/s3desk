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
				visibleLogSeveritySummary={{ error: 1, warn: 1 }}
				latestErrorIndex={2}
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

		const logCounts = screen.getByRole('status')
		expect(logCounts).toHaveTextContent('Lines: 3')
		expect(logCounts).toHaveTextContent('Errors: 1')
		expect(logCounts).toHaveTextContent('Warnings: 1')
		expect(screen.getByRole('button', { name: 'Jump to latest error' })).toBeInTheDocument()
		expect(screen.getByText('transfer failed')).toBeInTheDocument()
	})

	it('renders filtered log hits with their source line numbers', () => {
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
				logSearchQuery="needle"
				onLogSearchQueryChange={vi.fn()}
				onCopyVisibleLogs={vi.fn(async () => {})}
				normalizedLogSearchQuery="needle"
				visibleLogEntries={[
					'2026-03-11T09:00:02Z INFO needle on source line two',
					'2026-03-11T09:00:04Z ERROR last needle',
				]}
				visibleLogLineNumbers={[2, 4]}
				visibleLogSeveritySummary={{ error: 1, warn: 0 }}
				latestErrorIndex={1}
				activeLogLines={4}
				onLogsContainerRef={vi.fn()}
				visibleLogText={[
					'2026-03-11T09:00:02Z INFO needle on source line two',
					'2026-03-11T09:00:04Z ERROR last needle',
				].join('\n')}
				searchInputWidth={320}
			/>,
		)

		expect(screen.getByText('#2')).toBeInTheDocument()
		expect(screen.getByText('#4')).toBeInTheDocument()
		expect(screen.queryByText('#1')).not.toBeInTheDocument()
	})

	it('virtualizes very large logs without truncating visible log metadata', () => {
		const lines = Array.from({ length: 650 }, (_, index) => `2026-03-11T09:00:00Z INFO line-${index + 1}`)
		const originalExec = RegExp.prototype.exec
		let logLineParseAttempts = 0
		const execSpy = vi.spyOn(RegExp.prototype, 'exec').mockImplementation(function (this: RegExp, value: string) {
			if (typeof value === 'string' && value.startsWith('2026-03-11T09:00:00Z INFO line-')) {
				logLineParseAttempts += 1
			}
			return originalExec.call(this, value)
		})

		try {
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
					visibleLogEntries={lines}
					visibleLogSeveritySummary={{ error: 0, warn: 0 }}
					latestErrorIndex={-1}
					activeLogLines={lines.length}
					onLogsContainerRef={vi.fn()}
					visibleLogText={lines.join('\n')}
					searchInputWidth={320}
				/>,
			)

			expect(screen.getByText(/Lines: 650/)).toBeInTheDocument()
			expect(screen.queryByText(/Virtualized rows/)).not.toBeInTheDocument()
			expect(screen.getByRole('region', { name: 'Job log output' })).toHaveAttribute('tabindex', '0')
			expect(screen.getByText('line-1')).toBeInTheDocument()
			expect(screen.queryByText('line-650')).not.toBeInTheDocument()
			expect(logLineParseAttempts).toBeLessThan(100)
		} finally {
			execSpy.mockRestore()
		}
	})
})
