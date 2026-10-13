import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { JobsLogsDrawer } from '../JobsLogsDrawer'

beforeAll(() => {
	ensureDomShims()
})

describe('JobsLogsDrawer', () => {
	it('keeps the job target and distinguishes the first load from an empty result or failure', () => {
		const props = {
			open: true, onClose: vi.fn(), drawerWidth: 720, activeLogJobId: 'job-loading', isLogsLoading: true, logsError: null, onRefresh: vi.fn(),
			followLogs: true, onFollowLogsChange: vi.fn(), logPollPaused: false, logPollFailures: 0, onResumeLogPolling: vi.fn(),
			logSearchQuery: '', onLogSearchQueryChange: vi.fn(), onCopyVisibleLogs: vi.fn(async () => {}), normalizedLogSearchQuery: '',
			visibleLogEntries: [], visibleLogSeveritySummary: { error: 0, warn: 0 }, latestErrorIndex: -1,
			activeLogLines: 0, onLogsContainerRef: vi.fn(), visibleLogText: '', searchInputWidth: 320,
		}
		const { rerender } = render(<JobsLogsDrawer {...props} />)
		expect(screen.getByText('job-loading')).toBeInTheDocument()
		expect(screen.getByRole('status', { name: 'Loading job logs' })).toBeInTheDocument()
		expect(screen.queryByText('Loaded lines: 0')).not.toBeInTheDocument()
		expect(screen.queryByText(/No log output was recorded/)).not.toBeInTheDocument()

		rerender(<JobsLogsDrawer {...props} isLogsLoading={false} logsError={new Error('Log read denied')} />)
		expect(screen.getByText('job-loading')).toBeInTheDocument()
		expect(screen.queryByRole('status', { name: 'Loading job logs' })).not.toBeInTheDocument()
		expect(screen.queryByRole('region', { name: 'Job log output' })).not.toBeInTheDocument()
		expect(screen.queryByText('Loaded lines: 0')).not.toBeInTheDocument()

		rerender(<JobsLogsDrawer {...props} isLogsLoading={false} />)
		expect(screen.getByText(/No log output was recorded/)).toBeInTheDocument()
		expect(screen.getByRole('status')).toHaveTextContent('Loaded lines: 0')

		rerender(<JobsLogsDrawer {...props} activeLogLines={1} visibleLogEntries={['[info] cached output']} visibleLogText="[info] cached output" />)
		expect(screen.getByText('cached output')).toBeInTheDocument()
		expect(screen.queryByRole('status', { name: 'Loading job logs' })).not.toBeInTheDocument()
	})

	it('surfaces severity counts and quick navigation for visible log lines', () => {
		render(
			<JobsLogsDrawer
				open
				onClose={vi.fn()}
				drawerWidth={720}
				activeLogJobId="job-1"
				isLogsLoading={false}
				logsError={null}
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
		expect(logCounts).toHaveTextContent('Loaded lines: 3')
		expect(screen.getByRole('button', { name: 'Copy loaded' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Download loaded' })).toBeInTheDocument()
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
				logsError={null}
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
		expect(screen.getByRole('button', { name: 'Copy visible' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Download visible' })).toBeInTheDocument()
	})

	it('parses legacy backend lines and explains empty logs', () => {
		const { rerender } = render(
			<JobsLogsDrawer
				open onClose={vi.fn()} drawerWidth={720} activeLogJobId="job-1" isLogsLoading={false} logsError={null} onRefresh={vi.fn()}
				followLogs onFollowLogsChange={vi.fn()} logPollPaused={false} logPollFailures={0} onResumeLogPolling={vi.fn()}
				logSearchQuery="" onLogSearchQueryChange={vi.fn()} onCopyVisibleLogs={vi.fn(async () => {})} normalizedLogSearchQuery=""
				visibleLogEntries={['[info] uploaded file']} visibleLogSeveritySummary={{ error: 0, warn: 0 }} latestErrorIndex={-1}
				activeLogLines={1} onLogsContainerRef={vi.fn()} visibleLogText="[info] uploaded file" searchInputWidth={320}
			/>,
		)

		expect(screen.getByText('INFO')).toBeInTheDocument()
		expect(screen.getByText('uploaded file')).toBeInTheDocument()

		rerender(
			<JobsLogsDrawer
				open onClose={vi.fn()} drawerWidth={720} activeLogJobId="job-1" isLogsLoading={false} logsError={null} onRefresh={vi.fn()}
				followLogs onFollowLogsChange={vi.fn()} logPollPaused={false} logPollFailures={0} onResumeLogPolling={vi.fn()}
				logSearchQuery="" onLogSearchQueryChange={vi.fn()} onCopyVisibleLogs={vi.fn(async () => {})} normalizedLogSearchQuery=""
				visibleLogEntries={[]} visibleLogSeveritySummary={{ error: 0, warn: 0 }} latestErrorIndex={-1}
				activeLogLines={0} onLogsContainerRef={vi.fn()} visibleLogText="" searchInputWidth={320}
			/>,
		)

		expect(screen.getByText(/No log output was recorded/)).toBeInTheDocument()
		expect(screen.queryByRole('textbox', { name: 'Search logs' })).not.toBeInTheDocument()
		expect(screen.queryByText('Follow')).not.toBeInTheDocument()
	})

	it('shows log load failures instead of the empty-log state', () => {
		const onRefresh = vi.fn()
		render(
			<JobsLogsDrawer
				open onClose={vi.fn()} drawerWidth={720} activeLogJobId="job-1" isLogsLoading={false}
				logsError={new Error('log endpoint unavailable')} onRefresh={onRefresh}
				followLogs onFollowLogsChange={vi.fn()} logPollPaused={false} logPollFailures={0} onResumeLogPolling={vi.fn()}
				logSearchQuery="" onLogSearchQueryChange={vi.fn()} onCopyVisibleLogs={vi.fn(async () => {})} normalizedLogSearchQuery=""
				visibleLogEntries={[]} visibleLogSeveritySummary={{ error: 0, warn: 0 }} latestErrorIndex={-1}
				activeLogLines={0} onLogsContainerRef={vi.fn()} visibleLogText="" searchInputWidth={320}
			/>,
		)

		expect(screen.getByText('Failed to load job logs')).toBeInTheDocument()
		expect(screen.getByText('log endpoint unavailable')).toBeInTheDocument()
		expect(screen.queryByText(/No log output was recorded/)).not.toBeInTheDocument()
		screen.getByRole('button', { name: 'Refresh job logs' }).click()
		expect(onRefresh).toHaveBeenCalledOnce()
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
					logsError={null}
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

			expect(screen.getByText(/Loaded lines: 650/)).toBeInTheDocument()
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
