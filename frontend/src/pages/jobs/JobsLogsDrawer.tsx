import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Input, Tag, Typography } from 'antd'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Fragment, useCallback, useMemo, useRef, useState } from 'react'

import { OverlaySheet } from '../../components/OverlaySheet'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import { parseJobLogLine, type ParsedJobLogLine } from './jobLogParsing'
import styles from './JobsLogsDrawer.module.css'
import type { JobsLogSeveritySummary } from './useJobsLogsState'

const ESTIMATED_LOG_ROW_HEIGHT_PX = 58
const LOG_VIRTUALIZER_INITIAL_RECT = { width: 720, height: 480 }
const LOG_PARSE_CACHE_LIMIT = 4096
const LOG_PARSE_CACHE_RETAINED = 2048

function getParsedLogCacheKey(line: string, lineNumber: number) {
	return `${lineNumber}\u0000${line}`
}

function trimParsedLogLineCache(cache: Map<string, ParsedJobLogLine>) {
	if (cache.size <= LOG_PARSE_CACHE_LIMIT) return
	const deleteCount = cache.size - LOG_PARSE_CACHE_RETAINED
	let deleted = 0
	for (const key of cache.keys()) {
		cache.delete(key)
		deleted += 1
		if (deleted >= deleteCount) break
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
	visibleLogLineNumbers?: number[]
	visibleLogSeveritySummary: JobsLogSeveritySummary
	latestErrorIndex: number
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
		visibleLogLineNumbers,
		visibleLogSeveritySummary,
		latestErrorIndex,
		activeLogLines,
		onLogsContainerRef,
		visibleLogText,
		searchInputWidth,
	} = props
	const parsedLogLineCacheRef = useRef<Map<string, ParsedJobLogLine>>(new Map())
	const [logViewportElement, setLogViewportElement] = useState<HTMLDivElement | null>(null)
	const getVisibleLogLineNumber = useCallback(
		(index: number) => visibleLogLineNumbers?.[index] ?? index + 1,
		[visibleLogLineNumbers],
	)
	const getParsedVisibleEntry = useCallback(
		(index: number) => {
			const line = visibleLogEntries[index]
			if (line === undefined) return null

			const lineNumber = getVisibleLogLineNumber(index)
			const cacheKey = getParsedLogCacheKey(line, lineNumber)
			const cached = parsedLogLineCacheRef.current.get(cacheKey)
			if (cached) return cached

			const parsed = parseJobLogLine(line, lineNumber)
			parsedLogLineCacheRef.current.set(cacheKey, parsed)
			trimParsedLogLineCache(parsedLogLineCacheRef.current)
			return parsed
		},
		[getVisibleLogLineNumber, visibleLogEntries],
	)
	const setLogViewportRef = useCallback(
		(element: HTMLDivElement | null) => {
			setLogViewportElement((prev) => (prev === element ? prev : element))
			onLogsContainerRef(element)
		},
		[onLogsContainerRef],
	)
	const getVirtualLogItemKey = useCallback(
		(index: number) => {
			const line = visibleLogEntries[index]
			return line === undefined ? index : `${getVisibleLogLineNumber(index)}-${line}`
		},
		[getVisibleLogLineNumber, visibleLogEntries],
	)
	const logVirtualizer = useVirtualizer({
		count: visibleLogEntries.length,
		getScrollElement: () => logViewportElement,
		estimateSize: () => ESTIMATED_LOG_ROW_HEIGHT_PX,
		overscan: 14,
		initialRect: LOG_VIRTUALIZER_INITIAL_RECT,
		getItemKey: getVirtualLogItemKey,
	})
	const measuredVirtualLogItems = logVirtualizer.getVirtualItems()
	const virtualLogItems = useMemo(() => {
		if (measuredVirtualLogItems.length > 0 || visibleLogEntries.length === 0) return measuredVirtualLogItems
		const fallbackCount = Math.min(visibleLogEntries.length, 32)
		return Array.from({ length: fallbackCount }, (_, index) => ({
			key: getVirtualLogItemKey(index),
			index,
			start: index * ESTIMATED_LOG_ROW_HEIGHT_PX,
		}))
	}, [getVirtualLogItemKey, measuredVirtualLogItems, visibleLogEntries.length])
	const virtualizedLogHeight = Math.max(
		logVirtualizer.getTotalSize(),
		visibleLogEntries.length * ESTIMATED_LOG_ROW_HEIGHT_PX,
	)

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
				<div className={styles.drawerExtra}>
					<Button icon={<ReloadOutlined />} disabled={!activeLogJobId} loading={isLogsLoading} onClick={onRefresh} aria-label="Refresh job logs">
						<span className={styles.refreshLabel}>Refresh</span>
					</Button>
					{activeLogLines > 0 ? (
						<div className={styles.drawerExtraGroup}>
							<Typography.Text type="secondary">Follow</Typography.Text>
							<ToggleSwitch checked={followLogs} onChange={onFollowLogsChange} ariaLabel="Follow job logs" />
						</div>
					) : null}
				</div>
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
					{activeLogLines > 0 ? (
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
							<Button onClick={() => logVirtualizer.scrollToIndex(latestErrorIndex, { align: 'center' })}>Jump to latest error</Button>
						) : null}
						</div>
					) : null}
					<Typography.Text type="secondary" className={styles.metaLine} role="status" aria-live="polite" aria-atomic="true">
						Lines: {activeLogLines.toLocaleString()}
						{normalizedLogSearchQuery ? ` · Matches: ${visibleLogEntries.length.toLocaleString()}` : ''}
						{visibleLogSeveritySummary.error ? ` · Errors: ${visibleLogSeveritySummary.error.toLocaleString()}` : ''}
						{visibleLogSeveritySummary.warn ? ` · Warnings: ${visibleLogSeveritySummary.warn.toLocaleString()}` : ''}
					</Typography.Text>
					{!isLogsLoading && activeLogLines === 0 ? (
						<div className={styles.emptyLogs}>
							<Empty description="No log output was recorded for this job. Open Details to review its result and metadata." />
						</div>
					) : (
						<div ref={setLogViewportRef} className={styles.logViewport} role="region" aria-label="Job log output" tabIndex={0}>
							{normalizedLogSearchQuery && visibleLogEntries.length === 0 ? (
								<Typography.Text type="secondary" className={styles.logEmpty}>
									No matching log lines.
								</Typography.Text>
							) : (
								<div className={styles.logList} style={{ height: virtualizedLogHeight }}>
									{virtualLogItems.map((virtualItem) => {
									const entry = getParsedVisibleEntry(virtualItem.index)
									if (!entry) return null
									return (
										<div
											key={virtualItem.key}
											ref={logVirtualizer.measureElement}
											data-index={virtualItem.index}
											className={styles.logVirtualRow}
											style={{ transform: `translateY(${virtualItem.start}px)` }}
										>
											<div
												className={`${styles.logRow} ${entry.level === 'error' ? styles.logRowError : ''} ${entry.level === 'warn' ? styles.logRowWarn : ''}`.trim()}
											>
												<div className={styles.logIndex}>#{entry.lineNumber}</div>
												<div>
													{entry.timestamp ? <div className={styles.logTimestamp}>{entry.timestamp}</div> : null}
													{entry.levelLabel ? <Tag color={entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warning' : entry.level === 'info' ? 'blue' : 'default'}>{entry.levelLabel}</Tag> : null}
												</div>
												<div className={styles.logMessage}>{highlightLogText(entry.message, normalizedLogSearchQuery)}</div>
											</div>
										</div>
									)
									})}
								</div>
							)}
						</div>
					)}
				</>
			) : (
				<Typography.Text type="secondary">Select a job</Typography.Text>
			)}
		</OverlaySheet>
	)
}
