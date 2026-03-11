import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Space, Tag, Typography } from 'antd'
import { Fragment, useMemo, useRef } from 'react'

import { OverlaySheet } from '../../components/OverlaySheet'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import styles from './JobsLogsDrawer.module.css'

type ParsedLogLine = {
	line: string
	lineNumber: number
	timestamp: string | null
	level: 'error' | 'warn' | 'info' | 'debug' | 'plain'
	levelLabel: string | null
	message: string
}

const LOG_LINE_PATTERN =
	/^(?<timestamp>\[?\d{4}-\d{2}-\d{2}[^\s\]]*\]?|\[[^\]]+\])\s+(?<level>trace|debug|info|warn|warning|error|fatal)\b[: -]*(?<message>.*)$/i

function parseLogLine(line: string, lineNumber: number): ParsedLogLine {
	const match = LOG_LINE_PATTERN.exec(line)
	if (match?.groups) {
		const rawLevel = match.groups.level.toLowerCase()
		const level =
			rawLevel === 'error' || rawLevel === 'fatal'
				? 'error'
				: rawLevel === 'warn' || rawLevel === 'warning'
					? 'warn'
					: rawLevel === 'info'
						? 'info'
						: 'debug'
		return {
			line,
			lineNumber,
			timestamp: match.groups.timestamp ?? null,
			level,
			levelLabel: rawLevel.toUpperCase(),
			message: match.groups.message || line,
		}
	}

	const normalized = line.toLowerCase()
	const fallbackLevel = normalized.includes('error') || normalized.includes('fatal') ? 'error' : normalized.includes('warn') ? 'warn' : 'plain'
	return {
		line,
		lineNumber,
		timestamp: null,
		level: fallbackLevel,
		levelLabel: fallbackLevel === 'plain' ? null : fallbackLevel.toUpperCase(),
		message: line,
	}
}

function highlightLogText(text: string, query: string) {
	if (!query) return text
	const normalizedText = text.toLowerCase()
	const normalizedQuery = query.toLowerCase()
	const chunks: Array<{ text: string; match: boolean }> = []
	let cursor = 0

	while (cursor < text.length) {
		const matchIndex = normalizedText.indexOf(normalizedQuery, cursor)
		if (matchIndex < 0) {
			chunks.push({ text: text.slice(cursor), match: false })
			break
		}
		if (matchIndex > cursor) {
			chunks.push({ text: text.slice(cursor, matchIndex), match: false })
		}
		const end = matchIndex + normalizedQuery.length
		chunks.push({ text: text.slice(matchIndex, end), match: true })
		cursor = end
	}

	return chunks.map((chunk, index) =>
		chunk.match ? (
			<mark key={`${chunk.text}-${index}`} className={styles.logHighlight}>
				{chunk.text}
			</mark>
		) : (
			<Fragment key={`${chunk.text}-${index}`}>{chunk.text}</Fragment>
		),
	)
}

type Props = {
	open: boolean
	onClose: () => void
	drawerWidth: number | string
	activeLogJobId: string | null
	isLogsLoading: boolean
	onRefresh: () => void
	followLogs: boolean
	onFollowLogsChange: (next: boolean) => void
	logPollPaused: boolean
	logPollFailures: number
	onResumeLogPolling: () => void
	logSearchQuery: string
	onLogSearchQueryChange: (next: string) => void
	onCopyVisibleLogs: () => Promise<void>
	normalizedLogSearchQuery: string
	visibleLogEntries: string[]
	activeLogLines: number
	onLogsContainerRef: (element: HTMLDivElement | null) => void
	visibleLogText: string
	searchInputWidth: number | string
}

export function JobsLogsDrawer(props: Props) {
	const {
		open,
		onClose,
		drawerWidth,
		activeLogJobId,
		isLogsLoading,
		onRefresh,
		followLogs,
		onFollowLogsChange,
		logPollPaused,
		logPollFailures,
		onResumeLogPolling,
		logSearchQuery,
		onLogSearchQueryChange,
		onCopyVisibleLogs,
		normalizedLogSearchQuery,
		visibleLogEntries,
		activeLogLines,
		onLogsContainerRef,
		visibleLogText,
		searchInputWidth,
	} = props
	const latestErrorRef = useRef<HTMLDivElement | null>(null)
	const parsedVisibleEntries = useMemo(
		() => visibleLogEntries.map((line, index) => parseLogLine(line, index + 1)),
		[visibleLogEntries],
	)
	const logSeveritySummary = useMemo(() => {
		const summary = { error: 0, warn: 0 }
		for (const entry of parsedVisibleEntries) {
			if (entry.level === 'error') summary.error += 1
			if (entry.level === 'warn') summary.warn += 1
		}
		return summary
	}, [parsedVisibleEntries])
	const latestErrorIndex = useMemo(() => {
		for (let index = parsedVisibleEntries.length - 1; index >= 0; index -= 1) {
			if (parsedVisibleEntries[index]?.level === 'error') return index
		}
		return -1
	}, [parsedVisibleEntries])

	const handleDownloadVisibleLogs = () => {
		if (!activeLogJobId || visibleLogEntries.length === 0) return
		const blob = new Blob([visibleLogText], { type: 'text/plain;charset=utf-8' })
		const objectUrl = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = objectUrl
		anchor.download = `job-${activeLogJobId}${normalizedLogSearchQuery ? '-filtered' : ''}.log`
		document.body.appendChild(anchor)
		anchor.click()
		anchor.remove()
		URL.revokeObjectURL(objectUrl)
	}

	return (
		<OverlaySheet
			open={open}
			onClose={onClose}
			title="Job Logs"
			placement="right"
			width={typeof drawerWidth === 'number' ? `${drawerWidth}px` : drawerWidth}
			extra={
				<Space>
					<Button icon={<ReloadOutlined />} disabled={!activeLogJobId} loading={isLogsLoading} onClick={onRefresh}>
						Refresh
					</Button>
					<Space>
						<Typography.Text type="secondary">Follow</Typography.Text>
						<ToggleSwitch checked={followLogs} onChange={onFollowLogsChange} ariaLabel="Follow job logs" />
					</Space>
				</Space>
			}
		>
			{activeLogJobId ? (
				<>
					{logPollPaused ? (
						<Alert
							type="warning"
							showIcon
							title="Log polling paused"
							description={`Paused after ${logPollFailures} failed attempts. Click retry to resume polling.`}
							action={
								<Button size="small" onClick={onResumeLogPolling}>
									Retry
								</Button>
							}
							style={{ marginBottom: 12 }}
						/>
					) : null}
					<div className={styles.toolbar}>
						<Input
							allowClear
							placeholder="Search logs (contains)"
							aria-label="Search logs"
							value={logSearchQuery}
							onChange={(event) => onLogSearchQueryChange(event.target.value)}
							style={{ width: searchInputWidth }}
						/>
						<Button icon={<CopyOutlined />} onClick={() => void onCopyVisibleLogs()} disabled={visibleLogEntries.length === 0}>
							Copy {normalizedLogSearchQuery ? 'visible' : 'all'}
						</Button>
						<Button onClick={handleDownloadVisibleLogs} disabled={visibleLogEntries.length === 0}>
							Download {normalizedLogSearchQuery ? 'visible' : 'all'}
						</Button>
						{latestErrorIndex >= 0 ? (
							<Button onClick={() => latestErrorRef.current?.scrollIntoView({ block: 'nearest' })}>Jump to latest error</Button>
						) : null}
					</div>
					<Typography.Text type="secondary" className={styles.metaLine}>
						Lines: {activeLogLines.toLocaleString()}
						{normalizedLogSearchQuery ? ` · Matches: ${visibleLogEntries.length.toLocaleString()}` : ''}
						{logSeveritySummary.error ? ` · Errors: ${logSeveritySummary.error.toLocaleString()}` : ''}
						{logSeveritySummary.warn ? ` · Warnings: ${logSeveritySummary.warn.toLocaleString()}` : ''}
					</Typography.Text>
					<div ref={onLogsContainerRef} className={styles.logViewport}>
						{normalizedLogSearchQuery && visibleLogEntries.length === 0 ? (
							<Typography.Text type="secondary" className={styles.logEmpty}>
								No matching log lines.
							</Typography.Text>
						) : (
							<div className={styles.logList}>
								{parsedVisibleEntries.map((entry, index) => (
									<div
										key={`${entry.lineNumber}-${entry.line}`}
										ref={index === latestErrorIndex ? latestErrorRef : null}
										className={`${styles.logRow} ${entry.level === 'error' ? styles.logRowError : ''} ${entry.level === 'warn' ? styles.logRowWarn : ''}`.trim()}
									>
										<div className={styles.logIndex}>#{entry.lineNumber}</div>
										<div>
											{entry.timestamp ? <div className={styles.logTimestamp}>{entry.timestamp}</div> : null}
											{entry.levelLabel ? <Tag color={entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warning' : entry.level === 'info' ? 'blue' : 'default'}>{entry.levelLabel}</Tag> : null}
										</div>
										<div className={styles.logMessage}>{highlightLogText(entry.message, normalizedLogSearchQuery)}</div>
									</div>
								))}
							</div>
						)}
					</div>
				</>
			) : (
				<Typography.Text type="secondary">Select a job</Typography.Text>
			)}
		</OverlaySheet>
	)
}
