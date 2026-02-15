import { useMutation } from '@tanstack/react-query'
import { message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

import { type APIClient } from '../../api/client'
import { clipboardFailureHint, copyToClipboard } from '../../lib/clipboard'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { useLocalStorageState } from '../../lib/useLocalStorageState'

type UseJobsLogsStateArgs = {
	api: APIClient
	profileId: string | null
	maxLogLines?: number
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

export function useJobsLogsState({ api, profileId, maxLogLines = 2000 }: UseJobsLogsStateArgs): JobsLogsState {
	const [logsOpen, setLogsOpen] = useState(false)
	const [activeLogJobId, setActiveLogJobId] = useState<string | null>(null)
	const [logByJobId, setLogByJobId] = useState<Record<string, string[]>>({})
	const [logSearchQuery, setLogSearchQuery] = useState('')
	const [followLogs, setFollowLogs] = useLocalStorageState('jobsFollowLogs', true)
	const logsContainerRef = useRef<HTMLDivElement | null>(null)
	const logOffsetsRef = useRef<Record<string, number>>({})
	const logRemaindersRef = useRef<Record<string, string>>({})
	const logPollDelayRef = useRef<number>(1500)
	const logPollFailuresRef = useRef<number>(0)
	const [logPollFailures, setLogPollFailures] = useState(0)
	const [logPollPaused, setLogPollPaused] = useState(false)
	const [logPollRetryToken, setLogPollRetryToken] = useState(0)

	const logPollBaseMs = 1500
	const logPollMaxMs = 20_000
	const logPollPauseAfter = 3

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
		mutationFn: (jobId: string) => {
			if (!profileId) throw new Error('profile is required')
			return api.getJobLogsTail(profileId, jobId, 256 * 1024)
		},
		onSuccess: ({ text, nextOffset }, jobId) => {
			const lines = text
				.split('\n')
				.map((line) => line.trimEnd())
				.filter((line) => line.length > 0)
				.slice(-maxLogLines)
			setLogByJobId((prev) => ({ ...prev, [jobId]: lines }))
			logOffsetsRef.current[jobId] = nextOffset
			logRemaindersRef.current[jobId] = ''
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const refreshLogsForJob = useCallback(
		(jobId: string) => {
			logsMutation.mutate(jobId)
		},
		[logsMutation],
	)

	const refreshActiveLogs = useCallback(() => {
		if (!activeLogJobId) return
		logsMutation.mutate(activeLogJobId)
	}, [activeLogJobId, logsMutation])

	const openLogsForJob = useCallback(
		(jobId: string) => {
			setActiveLogJobId(jobId)
			setLogsOpen(true)
			logsMutation.mutate(jobId)
		},
		[logsMutation],
	)

	const closeLogs = useCallback(() => {
		setLogsOpen(false)
		setLogSearchQuery('')
	}, [])

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
		}

		setActiveLogJobId((prev) => {
			if (!prev || !jobIds.includes(prev)) return prev
			setLogsOpen(false)
			return null
		})
	}, [])

	const clearLogsForJob = useCallback(
		(jobId: string) => {
			clearLogsForJobs([jobId])
		},
		[clearLogsForJobs],
	)

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
				const { text, nextOffset } = await api.getJobLogsAfterOffset(profileId, jobId, offset, 128 * 1024)
				if (nextOffset < offset) {
					logOffsetsRef.current[jobId] = nextOffset
					logRemaindersRef.current[jobId] = ''
				}
				recordSuccess()
				if (nextOffset === offset || !text) return
				logOffsetsRef.current[jobId] = nextOffset

				const combined = (logRemaindersRef.current[jobId] ?? '') + text
				const parts = combined.split('\n')
				if (!combined.endsWith('\n')) {
					logRemaindersRef.current[jobId] = parts.pop() ?? ''
				} else {
					logRemaindersRef.current[jobId] = ''
				}

				const newLines = parts
					.map((line) => line.trimEnd())
					.filter((line) => line.length > 0)
				if (newLines.length === 0) return

				setLogByJobId((prev) => {
					const next = { ...prev }
					const existing = next[jobId] ?? []
					next[jobId] = [...existing, ...newLines].slice(-maxLogLines)
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
	const visibleLogEntries = useMemo(() => {
		if (!normalizedLogSearchQuery) return activeLogEntries
		return activeLogEntries.filter((line) => line.toLowerCase().includes(normalizedLogSearchQuery))
	}, [activeLogEntries, normalizedLogSearchQuery])
	const visibleLogText = useMemo(() => visibleLogEntries.join('\n'), [visibleLogEntries])

	const copyVisibleLogs = useCallback(async () => {
		if (visibleLogEntries.length === 0) {
			message.info(normalizedLogSearchQuery ? 'No matching log lines to copy.' : 'No log lines to copy.')
			return
		}
		const result = await copyToClipboard(visibleLogText)
		if (result.ok) {
			message.success(`Copied ${visibleLogEntries.length.toLocaleString()} line(s)`)
			return
		}
		message.error(clipboardFailureHint())
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
