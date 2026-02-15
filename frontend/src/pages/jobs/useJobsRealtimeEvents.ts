import { type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import { buildApiHttpUrl, buildApiWsUrl } from '../../api/baseUrl'
import type { JobProgress, JobsListResponse, JobStatus, WSEvent } from '../../api/types'
import { updateJob } from './jobUtils'

const eventsRetryThreshold = 3

type UseJobsRealtimeEventsArgs = {
	apiToken: string
	profileId: string | null
	queryClient: QueryClient
	onJobsDeleted?: (jobIds: string[]) => void
}

type EventsTransport = 'ws' | 'sse' | null

export type JobsRealtimeEventsState = {
	eventsConnected: boolean
	eventsTransport: EventsTransport
	eventsRetryCount: number
	eventsRetryThreshold: number
	retryRealtime: () => void
}

export function useJobsRealtimeEvents({
	apiToken,
	profileId,
	queryClient,
	onJobsDeleted,
}: UseJobsRealtimeEventsArgs): JobsRealtimeEventsState {
	const [eventsConnected, setEventsConnected] = useState(false)
	const [eventsTransport, setEventsTransport] = useState<EventsTransport>(null)
	const [eventsRetryCount, setEventsRetryCount] = useState(0)
	const [eventsManualRetryToken, setEventsManualRetryToken] = useState(0)
	const lastSeqRef = useRef<number>(0)

	const retryRealtime = useCallback(() => {
		setEventsManualRetryToken((prev) => prev + 1)
	}, [])

	useEffect(() => {
		if (!profileId) return

		let ws: WebSocket | null = null
		let es: EventSource | null = null
		let stopped = false
		let currentTransport: EventsTransport = null
		let reconnectTimer: number | null = null
		let wsProbeTimer: number | null = null
		let reconnectAttempt = 0

		const setTransport = (next: EventsTransport) => {
			currentTransport = next
			setEventsTransport(next)
		}

		const clearReconnectTimer = () => {
			if (reconnectTimer) {
				window.clearTimeout(reconnectTimer)
				reconnectTimer = null
			}
		}

		const clearWsProbeTimer = () => {
			if (wsProbeTimer) {
				window.clearTimeout(wsProbeTimer)
				wsProbeTimer = null
			}
		}

		const scheduleReconnect = () => {
			if (stopped || reconnectTimer) return
			const jitter = Math.floor(Math.random() * 250)
			const delay = Math.min(20_000, 1000 * Math.pow(2, reconnectAttempt) + jitter)
			reconnectAttempt += 1
			setEventsRetryCount(reconnectAttempt)
			reconnectTimer = window.setTimeout(() => {
				reconnectTimer = null
				if (stopped) return
				connectWS()
			}, delay)
		}

		const scheduleWSProbe = () => {
			if (stopped || wsProbeTimer) return
			wsProbeTimer = window.setTimeout(() => {
				wsProbeTimer = null
				if (stopped) return
				if (currentTransport !== 'ws') connectWS()
			}, 15_000)
		}

		const handleEvent = (data: string) => {
			try {
				const msg = JSON.parse(data) as WSEvent
				if (typeof msg.seq === 'number' && msg.seq > lastSeqRef.current) {
					lastSeqRef.current = msg.seq
				}

				if (msg.type === 'jobs.deleted' && typeof msg.payload === 'object' && msg.payload !== null) {
					const payload = msg.payload as { jobIds?: unknown }
					const jobIds = Array.isArray(payload.jobIds)
						? payload.jobIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
						: []
					if (jobIds.length > 0) {
						queryClient.invalidateQueries({ queryKey: ['jobs'], exact: false }).catch(() => {})
						onJobsDeleted?.(jobIds)
					}
				}

				if (msg.type === 'job.created') {
					queryClient.invalidateQueries({ queryKey: ['jobs'] }).catch(() => {})
				}

				if (
					(msg.type === 'job.progress' || msg.type === 'job.completed') &&
					msg.jobId &&
					typeof msg.payload === 'object' &&
					msg.payload !== null
				) {
					const payload = msg.payload as { status?: JobStatus; progress?: JobProgress; error?: string; errorCode?: string }
					queryClient.setQueriesData(
						{ queryKey: ['jobs'], exact: false },
						(old: InfiniteData<JobsListResponse, string | undefined> | undefined) =>
							updateJob(old, msg.jobId!, (job) => ({
								...job,
								status: payload.status ?? job.status,
								progress: payload.progress ?? job.progress,
								error: payload.error ?? job.error,
								errorCode: payload.errorCode ?? job.errorCode,
							})),
					)
				}
			} catch {
				// ignore malformed events
			}
		}

		const connectSSE = () => {
			if (stopped) return
			if (es) {
				try {
					es.close()
				} catch {
					// ignore
				}
			}
			try {
				es = new EventSource(buildSSEURL(apiToken, lastSeqRef.current))
			} catch {
				scheduleReconnect()
				return
			}
			es.onopen = () => {
				setTransport('sse')
				setEventsConnected(true)
				setEventsRetryCount(0)
				reconnectAttempt = 0
				scheduleWSProbe()
			}
			es.onerror = () => {
				setTransport('sse')
				setEventsConnected(false)
				scheduleReconnect()
			}
			es.onmessage = (ev) => handleEvent(ev.data)
		}

		const connectWS = () => {
			if (stopped) return
			clearReconnectTimer()
			clearWsProbeTimer()
			if (ws) {
				try {
					ws.close()
				} catch {
					// ignore
				}
				ws = null
			}
			ws = new WebSocket(buildWSURL(apiToken, lastSeqRef.current))

			let opened = false
			const fallbackTimer = window.setTimeout(() => {
				if (stopped || opened) return
				try {
					ws?.close()
				} catch {
					// ignore
				}
				connectSSE()
				scheduleWSProbe()
			}, 1500)

			ws.onopen = () => {
				opened = true
				window.clearTimeout(fallbackTimer)
				setTransport('ws')
				setEventsConnected(true)
				setEventsRetryCount(0)
				reconnectAttempt = 0
				clearWsProbeTimer()
				clearReconnectTimer()
				if (es) {
					try {
						es.close()
					} catch {
						// ignore
					}
					es = null
				}
			}

			const onDisconnect = () => {
				window.clearTimeout(fallbackTimer)
				if (stopped) return
				setTransport(null)
				setEventsConnected(false)
				connectSSE()
				scheduleReconnect()
			}

			ws.onclose = onDisconnect
			ws.onerror = onDisconnect
			ws.onmessage = (ev) => handleEvent(ev.data)
		}

		connectWS()
		return () => {
			stopped = true
			clearWsProbeTimer()
			clearReconnectTimer()
			try {
				ws?.close()
			} catch {
				// ignore
			}
			es?.close()
		}
	}, [apiToken, eventsManualRetryToken, onJobsDeleted, profileId, queryClient])

	return {
		eventsConnected: profileId ? eventsConnected : false,
		eventsTransport: profileId ? eventsTransport : null,
		eventsRetryCount: profileId ? eventsRetryCount : 0,
		eventsRetryThreshold,
		retryRealtime,
	}
}

function buildWSURL(apiToken: string, afterSeq?: number): string {
	const url = buildApiWsUrl('/ws')
	if (apiToken) url.searchParams.set('apiToken', apiToken)
	url.searchParams.set('includeLogs', 'false')
	if (afterSeq && afterSeq > 0) url.searchParams.set('afterSeq', String(afterSeq))
	return url.toString()
}

function buildSSEURL(apiToken: string, afterSeq?: number): string {
	const url = buildApiHttpUrl('/events')
	if (apiToken) url.searchParams.set('apiToken', apiToken)
	url.searchParams.set('includeLogs', 'false')
	if (afterSeq && afterSeq > 0) url.searchParams.set('afterSeq', String(afterSeq))
	return url.toString()
}
