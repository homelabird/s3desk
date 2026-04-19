import { type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import { buildApiHttpUrl, buildApiWsUrl } from '../../api/baseUrl'
import { queryKeys } from '../../api/queryKeys'
import type { Job, JobProgress, JobsListResponse, JobStatus, WSEvent } from '../../api/types'
import { updateJob } from './jobUtils'

const eventsRetryThreshold = 3

type UseJobsRealtimeEventsArgs = {
	apiToken: string
	profileId: string | null
	queryClient: QueryClient
	onJobsDeleted?: (jobIds: string[]) => void
}

type EventsTransport = 'ws' | 'sse' | null
type RealtimeTicketResponse = {
	ticket?: string
}

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
	const lastSeqScopeKeyRef = useRef<string>('')
	const currentScopeKey = `${apiToken || 'none'}:${profileId ?? 'none'}`

	const retryRealtime = useCallback(() => {
		setEventsManualRetryToken((prev) => prev + 1)
	}, [])

	useEffect(() => {
		if (lastSeqScopeKeyRef.current !== currentScopeKey) {
			lastSeqRef.current = 0
			lastSeqScopeKeyRef.current = currentScopeKey
			setEventsConnected(false)
			setEventsTransport(null)
			setEventsRetryCount(0)
		}

		if (!profileId) {
			setEventsConnected(false)
			setEventsTransport(null)
			setEventsRetryCount(0)
			return
		}

		let ws: WebSocket | null = null
		let es: EventSource | null = null
		let stopped = false
		let hadConnected = false
		let shouldRefreshOnOpen = false
		let currentTransport: EventsTransport = null
		let reconnectTimer: number | null = null
		let wsProbeTimer: number | null = null
		let reconnectAttempt = 0
		let connectNonce = 0
		let wsUnavailable = false
		const jobsQueryKey = queryKeys.jobs.scope(profileId, apiToken)

		const refreshJobs = () => {
			queryClient.invalidateQueries({ queryKey: jobsQueryKey, exact: false }).catch(() => {})
		}

		const markRefreshOnReconnect = () => {
			if (hadConnected) {
				shouldRefreshOnOpen = true
			}
		}

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

		const closeEventSource = () => {
			if (!es) return
			try {
				es.close()
			} catch {
				// ignore
			}
			es = null
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
				if (wsUnavailable) {
					void connectSSE()
					return
				}
				void connectWS()
			}, delay)
		}

		const scheduleWSProbe = () => {
			if (stopped || wsProbeTimer) return
			wsProbeTimer = window.setTimeout(() => {
				wsProbeTimer = null
				if (stopped) return
				if (currentTransport !== 'ws') void connectWS()
			}, 15_000)
		}

		const handleTransportOpen = (transport: Exclude<EventsTransport, null>) => {
			setTransport(transport)
			setEventsConnected(true)
			setEventsRetryCount(0)
			reconnectAttempt = 0
			clearReconnectTimer()
			if (transport === 'ws') wsUnavailable = false
			if (shouldRefreshOnOpen) {
				shouldRefreshOnOpen = false
				refreshJobs()
			}
			hadConnected = true
		}

		const handleEvent = (data: string) => {
			try {
				const msg = JSON.parse(data) as WSEvent
				if (typeof msg.seq === 'number') {
					if (lastSeqRef.current > 0 && msg.seq > lastSeqRef.current + 1) {
						refreshJobs()
					}
					if (msg.seq > lastSeqRef.current) {
						lastSeqRef.current = msg.seq
					}
				}

				if (msg.type === 'jobs.deleted' && typeof msg.payload === 'object' && msg.payload !== null) {
					const payload = msg.payload as { jobIds?: unknown }
					const jobIds = Array.isArray(payload.jobIds)
						? payload.jobIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
						: []
					if (jobIds.length > 0) {
						refreshJobs()
						onJobsDeleted?.(jobIds)
					}
				}

				if (msg.type === 'job.created') {
					refreshJobs()
				}

				if (
					(msg.type === 'job.progress' || msg.type === 'job.completed') &&
					msg.jobId &&
					typeof msg.payload === 'object' &&
					msg.payload !== null
				) {
					const payload = msg.payload as { status?: JobStatus; progress?: JobProgress; error?: string; errorCode?: string }
					const applyJobPatch = (job: Job): Job => ({
						...job,
						status: payload.status ?? job.status,
						progress: payload.progress ?? job.progress,
						error: payload.error ?? job.error,
						errorCode: payload.errorCode ?? job.errorCode,
					})
					queryClient.setQueriesData(
						{ queryKey: jobsQueryKey, exact: false },
						(old: InfiniteData<JobsListResponse, string | undefined> | undefined) =>
							updateJob(old, msg.jobId!, applyJobPatch),
					)
					queryClient.setQueryData(
						queryKeys.jobs.detail(profileId, msg.jobId, apiToken),
						(old: Job | undefined) => (old ? applyJobPatch(old) : old),
					)
					if (msg.type === 'job.completed') {
						queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(profileId, msg.jobId, apiToken), exact: true }).catch(() => {})
					}
				}
			} catch {
				// ignore malformed events
			}
		}

		const fetchRealtimeTicket = async (transport: 'ws' | 'sse') => {
			const url = buildApiHttpUrl('/realtime-ticket')
			url.searchParams.set('transport', transport)
			const response = await fetch(url.toString(), {
				method: 'POST',
				headers: {
					'X-Api-Token': apiToken,
				},
			})
			if (!response.ok) {
				throw new Error(`ticket request failed: ${response.status}`)
			}
			const payload = (await response.json()) as RealtimeTicketResponse
			if (!payload.ticket) {
				throw new Error('ticket missing')
			}
			return payload.ticket
		}

		const connectSSE = async () => {
			if (stopped) return
			const nonce = ++connectNonce
			closeEventSource()
			try {
				const ticket = await fetchRealtimeTicket('sse')
				if (stopped || nonce !== connectNonce) return
				es = new EventSource(buildSSEURL(ticket, lastSeqRef.current))
			} catch {
				scheduleReconnect()
				return
			}
			es.onopen = () => {
				handleTransportOpen('sse')
				scheduleWSProbe()
			}
			es.onerror = () => {
				markRefreshOnReconnect()
				clearWsProbeTimer()
				closeEventSource()
				setTransport('sse')
				setEventsConnected(false)
				scheduleReconnect()
			}
			es.onmessage = (ev) => handleEvent(ev.data)
		}

		const connectWS = async () => {
			if (stopped) return
			const nonce = ++connectNonce
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
			let ticket = ''
			try {
				ticket = await fetchRealtimeTicket('ws')
			} catch {
				connectSSE()
				return
			}
			if (stopped || nonce !== connectNonce) return
			ws = new WebSocket(buildWSURL(ticket, lastSeqRef.current))

			let opened = false
			let disconnectHandled = false
			const fallbackTimer = window.setTimeout(() => {
				if (stopped || opened || disconnectHandled) return
				try {
					ws?.close()
				} catch {
					// ignore
				}
			}, 1500)

			ws.onopen = () => {
				opened = true
				window.clearTimeout(fallbackTimer)
				handleTransportOpen('ws')
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
				if (disconnectHandled) return
				disconnectHandled = true
				window.clearTimeout(fallbackTimer)
				if (stopped) return
				const failedBeforeOpen = !opened
				if (failedBeforeOpen) wsUnavailable = true
				markRefreshOnReconnect()
				setTransport(null)
				setEventsConnected(false)
				void connectSSE()
				if (!failedBeforeOpen) scheduleReconnect()
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
			closeEventSource()
		}
	}, [apiToken, currentScopeKey, eventsManualRetryToken, onJobsDeleted, profileId, queryClient])

	return {
		eventsConnected: profileId ? eventsConnected : false,
		eventsTransport: profileId ? eventsTransport : null,
		eventsRetryCount: profileId ? eventsRetryCount : 0,
		eventsRetryThreshold,
		retryRealtime,
	}
}

function buildWSURL(realtimeTicket: string, afterSeq?: number): string {
	const url = buildApiWsUrl('/ws')
	if (realtimeTicket) url.searchParams.set('realtimeTicket', realtimeTicket)
	url.searchParams.set('includeLogs', 'false')
	if (afterSeq && afterSeq > 0) url.searchParams.set('afterSeq', String(afterSeq))
	return url.toString()
}

function buildSSEURL(realtimeTicket: string, afterSeq?: number): string {
	const url = buildApiHttpUrl('/events')
	if (realtimeTicket) url.searchParams.set('realtimeTicket', realtimeTicket)
	url.searchParams.set('includeLogs', 'false')
	if (afterSeq && afterSeq > 0) url.searchParams.set('afterSeq', String(afterSeq))
	return url.toString()
}
