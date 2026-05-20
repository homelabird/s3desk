import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

import { type APIClientShape } from '../../api/client'
import { copyToClipboard } from '../../lib/clipboard'
import { legacyProfileScopedStorageKeys, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { jobsFeedback } from './jobsFeedback'

type UseJobsLogsStateArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	maxLogLines?: number
}

type JobsLogLevel = 'error' | 'warn' | 'info' | 'debug' | 'plain'

export type JobsLogSeveritySummary = {
	error: number
	warn: number
}

export type JobsLogEntry = {
	line: string
	lineNumber: number
	normalizedLine: string
	level: JobsLogLevel
}

export type JobsLogVisibleView = {
	entries: string[]
	lineNumbers: number[]
	text: string
	severitySummary: JobsLogSeveritySummary
	latestErrorIndex: number
}

export type JobsLogSearchCache = {
	sourceEntries: readonly JobsLogEntry[]
	normalizedQuery: string
	matchedEntries: JobsLogEntry[]
}

export type JobsLogVisibleViewResult = {
	view: JobsLogVisibleView
	searchCache: JobsLogSearchCache | null
}

const LOG_LEVEL_PATTERN =
	/^(?:\[?\d{4}-\d{2}-\d{2}[^\s\]]*\]?|\[[^\]]+\])\s+(?<level>trace|debug|info|warn|warning|error|fatal)\b[: -]*(?:.*)$/i

function classifyLogLevel(line: string, normalizedLine: string): JobsLogLevel {
	const match = LOG_LEVEL_PATTERN.exec(line)
	const rawLevel = match?.groups?.level?.toLowerCase()
	if (rawLevel) {
		if (rawLevel === 'error' || rawLevel === 'fatal') return 'error'
		if (rawLevel === 'warn' || rawLevel === 'warning') return 'warn'
		if (rawLevel === 'info') return 'info'
		return 'debug'
	}

	if (normalizedLine.includes('error') || normalizedLine.includes('fatal')) return 'error'
	if (normalizedLine.includes('warn')) return 'warn'
	return 'plain'
}

function createLogEntry(line: string, lineNumber: number): JobsLogEntry {
	const normalizedLine = line.toLowerCase()
	return {
		line,
		lineNumber,
		normalizedLine,
		level: classifyLogLevel(line, normalizedLine),
	}
}

function parseLogEntries(text: string, firstLineNumber = 1): JobsLogEntry[] {
	const lines = text.split('\n')
	const entries: JobsLogEntry[] = []
	for (let index = 0; index < lines.length; index += 1) {
		const line = (lines[index] ?? '').trimEnd()
		if (line.length > 0) entries.push(createLogEntry(line, firstLineNumber + index))
	}
	return entries
}

function getNextLineNumberAfterText(text: string, firstLineNumber = 1) {
	if (!text) return firstLineNumber
	let newlineCount = 0
	for (let index = 0; index < text.length; index += 1) {
		if (text.charCodeAt(index) === 10) newlineCount += 1
	}
	const sourceLineCount = newlineCount + (text.endsWith('\n') ? 0 : 1)
	return firstLineNumber + sourceLineCount
}

function consumeCompleteLogEntries(text: string, firstLineNumber: number) {
	if (!text) return { entries: [] as JobsLogEntry[], nextLineNumber: firstLineNumber, remainder: '' }

	const parts = text.split('\n')
	const remainder = text.endsWith('\n') ? '' : (parts.pop() ?? '')
	const completeParts = text.endsWith('\n') ? parts.slice(0, -1) : parts
	const entries: JobsLogEntry[] = []
	for (let index = 0; index < completeParts.length; index += 1) {
		const line = (completeParts[index] ?? '').trimEnd()
		if (line.length > 0) entries.push(createLogEntry(line, firstLineNumber + index))
	}

	return {
		entries,
		nextLineNumber: firstLineNumber + completeParts.length,
		remainder,
	}
}

function buildVisibleLogView(entries: readonly JobsLogEntry[]): JobsLogVisibleView {
	const visibleEntries: string[] = []
	const lineNumbers: number[] = []
	let error = 0
	let warn = 0
	let latestErrorIndex = -1

	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index]
		if (!entry) continue
		visibleEntries.push(entry.line)
		lineNumbers.push(entry.lineNumber)
		if (entry.level === 'error') {
			error += 1
			latestErrorIndex = index
		}
		if (entry.level === 'warn') warn += 1
	}

	return {
		entries: visibleEntries,
		lineNumbers,
		text: visibleEntries.join('\n'),
		severitySummary: { error, warn },
		latestErrorIndex,
	}
}

export function createJobsLogVisibleView(
	activeLogEntries: readonly JobsLogEntry[],
	normalizedLogSearchQuery: string,
	previousSearchCache: JobsLogSearchCache | null = null,
): JobsLogVisibleViewResult {
	const normalizedQuery = normalizedLogSearchQuery.trim().toLowerCase()
	if (!normalizedQuery) {
		return {
			view: buildVisibleLogView(activeLogEntries),
			searchCache: null,
		}
	}

	let searchSource = activeLogEntries
	if (
		previousSearchCache?.sourceEntries === activeLogEntries &&
		previousSearchCache.normalizedQuery.length > 0 &&
		normalizedQuery.startsWith(previousSearchCache.normalizedQuery)
	) {
		searchSource = previousSearchCache.matchedEntries
	}

	const matchedEntries: JobsLogEntry[] = []
	for (let index = 0; index < searchSource.length; index += 1) {
		const entry = searchSource[index]
		if (entry?.normalizedLine.includes(normalizedQuery)) matchedEntries.push(entry)
	}

	return {
		view: buildVisibleLogView(matchedEntries),
		searchCache: {
			sourceEntries: activeLogEntries,
			normalizedQuery,
			matchedEntries,
		},
	}
}

export type JobsLogsState = {
	logsOpen: boolean
	activeLogJobId: string | null
	logSearchQuery: string
	setLogSearchQuery: (next: string) => void
	followLogs: boolean
	setFollowLogs: (next: boolean) => void
	logsContainerRef: MutableRefObject<HTMLDivElement | null>
	logPollFailures: number
	logPollPaused: boolean
	resumeLogPolling: () => void
	activeLogLines: number
	normalizedLogSearchQuery: string
	visibleLogEntries: string[]
	visibleLogLineNumbers: number[]
	visibleLogSeveritySummary: JobsLogSeveritySummary
	latestVisibleLogErrorIndex: number
	visibleLogText: string
	copyVisibleLogs: () => Promise<void>
	openLogsForJob: (jobId: string) => void
	closeLogs: () => void
	refreshLogsForJob: (jobId: string) => void
	refreshActiveLogs: () => void
	isLogsLoading: boolean
	clearLogsForJobs: (jobIds: string[]) => void
	clearLogsForJob: (jobId: string) => void
}

export function useJobsLogsState({ api, apiToken, profileId, maxLogLines = 2000 }: UseJobsLogsStateArgs): JobsLogsState {
	const currentScopeKey = `${apiToken || 'none'}:${profileId ?? 'none'}`
	const [logsOpen, setLogsOpen] = useState(false)
	const [activeLogJobId, setActiveLogJobId] = useState<string | null>(null)
	const [logByJobId, setLogByJobId] = useState<Record<string, JobsLogEntry[]>>({})
	const [logSearchQuery, setLogSearchQuery] = useState('')
	const [followLogs, setFollowLogs] = useLocalStorageState(
		profileScopedStorageKey('jobs', apiToken, profileId, 'followLogs'),
		true,
		{
			legacyLocalStorageKey: 'jobsFollowLogs',
			legacyLocalStorageKeys: legacyProfileScopedStorageKeys('jobs', apiToken, profileId, 'followLogs'),
		},
	)
	const logsContainerRef = useRef<HTMLDivElement | null>(null)
	const logOffsetsRef = useRef<Record<string, number>>({})
	const logRemaindersRef = useRef<Record<string, string>>({})
	const logNextLineNumberRef = useRef<Record<string, number>>({})
	const logPollDelayRef = useRef<number>(1500)
	const logPollFailuresRef = useRef<number>(0)
	const logRequestTokenRef = useRef(0)
	const visibleLogSearchCacheRef = useRef<JobsLogSearchCache | null>(null)
	const [logPollFailures, setLogPollFailures] = useState(0)
	const [logPollPaused, setLogPollPaused] = useState(false)
	const [logPollRetryToken, setLogPollRetryToken] = useState(0)
	const lastScopeKeyRef = useRef(currentScopeKey)

	const logPollBaseMs = 1500
	const logPollMaxMs = 20_000
	const logPollPauseAfter = 3
	const invalidateLogRequests = useCallback(() => {
		logRequestTokenRef.current += 1
	}, [])

	const resetLogPolling = useCallback(() => {
		logPollFailuresRef.current = 0
		logPollDelayRef.current = logPollBaseMs
		setLogPollFailures(0)
		setLogPollPaused(false)
	}, [logPollBaseMs])

	const resumeLogPolling = useCallback(() => {
		resetLogPolling()
		setLogPollRetryToken((prev) => prev + 1)
	}, [resetLogPolling])

	const logsMutation = useMutation({
		mutationFn: ({ jobId }: { jobId: string; requestToken: number }) => {
			if (!profileId) throw new Error('profile is required')
			return api.jobs.getJobLogsTail(profileId, jobId, 256 * 1024)
		},
		onSuccess: ({ text, nextOffset }, { jobId, requestToken }) => {
			if (requestToken !== logRequestTokenRef.current) return
			const entries = parseLogEntries(text).slice(-maxLogLines)
			setLogByJobId((prev) => ({ ...prev, [jobId]: entries }))
			logOffsetsRef.current[jobId] = nextOffset
			logRemaindersRef.current[jobId] = ''
			logNextLineNumberRef.current[jobId] = getNextLineNumberAfterText(text)
		},
		onError: (err, { requestToken }) => {
			if (requestToken !== logRequestTokenRef.current) return
			jobsFeedback.error(err)
		},
	})

	const refreshLogsForJob = useCallback(
		(jobId: string) => {
			const requestToken = logRequestTokenRef.current + 1
			logRequestTokenRef.current = requestToken
			logsMutation.mutate({ jobId, requestToken })
		},
		[logsMutation],
	)

	const refreshActiveLogs = useCallback(() => {
		if (!activeLogJobId) return
		const requestToken = logRequestTokenRef.current + 1
		logRequestTokenRef.current = requestToken
		logsMutation.mutate({ jobId: activeLogJobId, requestToken })
	}, [activeLogJobId, logsMutation])

	const openLogsForJob = useCallback(
		(jobId: string) => {
			setActiveLogJobId(jobId)
			setLogsOpen(true)
			const requestToken = logRequestTokenRef.current + 1
			logRequestTokenRef.current = requestToken
			logsMutation.mutate({ jobId, requestToken })
		},
		[logsMutation],
	)

	const closeLogs = useCallback(() => {
		invalidateLogRequests()
		setLogsOpen(false)
		setLogSearchQuery('')
		visibleLogSearchCacheRef.current = null
	}, [invalidateLogRequests])

	const clearLogsForJobs = useCallback((jobIds: string[]) => {
		if (jobIds.length === 0) return

		setLogByJobId((prev) => {
			const next = { ...prev }
			for (const jobId of jobIds) delete next[jobId]
			return next
		})

		for (const jobId of jobIds) {
			delete logOffsetsRef.current[jobId]
			delete logRemaindersRef.current[jobId]
			delete logNextLineNumberRef.current[jobId]
		}

		setActiveLogJobId((prev) => {
			if (!prev || !jobIds.includes(prev)) return prev
			invalidateLogRequests()
			setLogsOpen(false)
			visibleLogSearchCacheRef.current = null
			return null
		})
	}, [invalidateLogRequests])

	const clearLogsForJob = useCallback(
		(jobId: string) => {
			clearLogsForJobs([jobId])
		},
		[clearLogsForJobs],
	)

	useEffect(() => {
		if (lastScopeKeyRef.current === currentScopeKey) return
		lastScopeKeyRef.current = currentScopeKey
		invalidateLogRequests()
		setLogsOpen(false)
		setActiveLogJobId(null)
		setLogByJobId({})
		setLogSearchQuery('')
		visibleLogSearchCacheRef.current = null
		logOffsetsRef.current = {}
		logRemaindersRef.current = {}
		logNextLineNumberRef.current = {}
		resetLogPolling()
	}, [currentScopeKey, invalidateLogRequests, resetLogPolling])

	useEffect(() => {
		if (!logsOpen || !followLogs || !activeLogJobId) {
			resetLogPolling()
		}
	}, [activeLogJobId, followLogs, logsOpen, resetLogPolling])

	useEffect(() => {
		if (!profileId) return
		if (!logsOpen || !followLogs || !activeLogJobId) return
		if (logPollPaused) return

		const jobId = activeLogJobId
		let stopped = false
		let timer: number | null = null

		const scheduleNext = () => {
			if (stopped || logPollPaused) return
			timer = window.setTimeout(() => {
				tick().catch(() => {})
			}, logPollDelayRef.current)
		}

		const recordSuccess = () => {
			if (stopped) return
			if (logPollFailuresRef.current === 0) return
			logPollFailuresRef.current = 0
			logPollDelayRef.current = logPollBaseMs
			setLogPollFailures(0)
		}

		const recordFailure = () => {
			if (stopped) return
			logPollFailuresRef.current += 1
			const failures = logPollFailuresRef.current
			setLogPollFailures(failures)
			logPollDelayRef.current = Math.min(logPollMaxMs, logPollBaseMs * Math.pow(2, failures - 1))
			if (failures >= logPollPauseAfter) {
				setLogPollPaused(true)
			}
		}

		const tick = async () => {
			const offset = logOffsetsRef.current[jobId] ?? 0
			try {
				const { text, nextOffset } = await api.jobs.getJobLogsAfterOffset(profileId, jobId, offset, 128 * 1024)
				if (stopped) return
				const offsetReset = nextOffset < offset
				if (nextOffset < offset) {
					logOffsetsRef.current[jobId] = nextOffset
					logRemaindersRef.current[jobId] = ''
					logNextLineNumberRef.current[jobId] = 1
				}
				recordSuccess()
				if (nextOffset === offset || !text) return
				logOffsetsRef.current[jobId] = nextOffset

				const combined = (logRemaindersRef.current[jobId] ?? '') + text
				const firstLineNumber = logNextLineNumberRef.current[jobId] ?? 1
				const { entries: newEntries, nextLineNumber, remainder } = consumeCompleteLogEntries(combined, firstLineNumber)
				logRemaindersRef.current[jobId] = remainder
				logNextLineNumberRef.current[jobId] = nextLineNumber
				if (newEntries.length === 0) return

				setLogByJobId((prev) => {
					const next = { ...prev }
					const existing = offsetReset ? [] : (next[jobId] ?? [])
					next[jobId] = [...existing, ...newEntries].slice(-maxLogLines)
					return next
				})
			} catch {
				recordFailure()
			} finally {
				if (!stopped && !logPollPaused && logPollFailuresRef.current < logPollPauseAfter) {
					scheduleNext()
				}
			}
		}

		tick().catch(() => {})
		return () => {
			stopped = true
			if (timer) window.clearTimeout(timer)
		}
	}, [
		activeLogJobId,
		api,
		followLogs,
		logPollBaseMs,
		logPollMaxMs,
		logPollPauseAfter,
		logPollPaused,
		logPollRetryToken,
		logsOpen,
		maxLogLines,
		profileId,
	])

	useEffect(() => {
		if (!logsOpen || !followLogs || !activeLogJobId) return
		const el = logsContainerRef.current
		if (!el) return
		el.scrollTop = el.scrollHeight
	}, [activeLogJobId, followLogs, logByJobId, logsOpen])

	useEffect(() => {
		setLogSearchQuery('')
	}, [activeLogJobId])

	const activeLogEntries = useMemo(
		() => (activeLogJobId ? (logByJobId[activeLogJobId] ?? []) : []),
		[activeLogJobId, logByJobId],
	)
	const activeLogLines = activeLogEntries.length
	const normalizedLogSearchQuery = logSearchQuery.trim().toLowerCase()
	const visibleLogViewResult = useMemo(
		() => createJobsLogVisibleView(activeLogEntries, normalizedLogSearchQuery, visibleLogSearchCacheRef.current),
		[activeLogEntries, normalizedLogSearchQuery],
	)
	useEffect(() => {
		visibleLogSearchCacheRef.current = visibleLogViewResult.searchCache
	}, [visibleLogViewResult.searchCache])
	const visibleLogView = visibleLogViewResult.view
	const visibleLogEntries = visibleLogView.entries
	const visibleLogLineNumbers = visibleLogView.lineNumbers
	const visibleLogSeveritySummary = visibleLogView.severitySummary
	const latestVisibleLogErrorIndex = visibleLogView.latestErrorIndex
	const visibleLogText = visibleLogView.text

	const copyVisibleLogs = useCallback(async () => {
		if (visibleLogEntries.length === 0) {
			jobsFeedback.noLogsToCopy(!!normalizedLogSearchQuery)
			return
		}
		const result = await copyToClipboard(visibleLogText)
		if (result.ok) {
			jobsFeedback.logsCopied(visibleLogEntries.length)
			return
		}
		jobsFeedback.clipboardFailed()
	}, [normalizedLogSearchQuery, visibleLogEntries, visibleLogText])

	return {
		logsOpen,
		activeLogJobId,
		logSearchQuery,
		setLogSearchQuery,
		followLogs,
		setFollowLogs,
		logsContainerRef,
		logPollFailures,
		logPollPaused,
		resumeLogPolling,
		activeLogLines,
		normalizedLogSearchQuery,
		visibleLogEntries,
		visibleLogLineNumbers,
		visibleLogSeveritySummary,
		latestVisibleLogErrorIndex,
		visibleLogText,
		copyVisibleLogs,
		openLogsForJob,
		closeLogs,
		refreshLogsForJob,
		refreshActiveLogs,
		isLogsLoading: logsMutation.isPending,
		clearLogsForJobs,
		clearLogsForJob,
	}
}
