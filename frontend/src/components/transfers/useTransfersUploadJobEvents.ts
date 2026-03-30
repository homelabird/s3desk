import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

import { buildApiHttpUrl, buildApiWsUrl } from '../../api/baseUrl'
import type { APIClient } from '../../api/client'
import type { JobProgress, JobStatus, WSEvent } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { maybeReportNetworkError } from './transferDownloadUtils'
import type { UploadTask } from './transferTypes'

type UseTransfersUploadJobEventsArgs = {
	api: APIClient
	apiToken: string
	hasPendingUploadJobs: boolean
	uploadTasksRef: MutableRefObject<UploadTask[]>
	handleUploadJobUpdate: (
		taskId: string,
		job: { status?: JobStatus; progress?: JobProgress | null; error?: string | null },
	) => Promise<void>
	updateUploadTask: (taskId: string, updater: (task: UploadTask) => UploadTask) => void
}

type RealtimeTicketResponse = {
	ticket?: string
}

export function getRealtimeSequenceState(lastSeq: number, nextSeq: number | undefined) {
	if (typeof nextSeq !== 'number' || !Number.isFinite(nextSeq)) {
		return { hasGap: false, resolvedSeq: lastSeq }
	}
	return {
		hasGap: lastSeq > 0 && nextSeq > lastSeq + 1,
		resolvedSeq: nextSeq > lastSeq ? nextSeq : lastSeq,
	}
}

export function useTransfersUploadJobEvents({
	api,
	apiToken,
	hasPendingUploadJobs,
	uploadTasksRef,
	handleUploadJobUpdate,
	updateUploadTask,
}: UseTransfersUploadJobEventsArgs) {
	const [connected, setConnected] = useState(false)
	const lastSeqRef = useRef(0)

	useEffect(() => {
		if (!hasPendingUploadJobs) {
			setConnected(false)
			return
		}
		if (typeof window === 'undefined') {
			setConnected(false)
			return
		}

		let stopped = false
		let ws: WebSocket | null = null
		let es: EventSource | null = null
		let reconnectTimer: number | null = null
		let reconnectAttempt = 0
		let wsProbeTimer: number | null = null
		let connectNonce = 0
		let wsUnavailable = false
		let hadConnected = false
		let shouldRefreshOnOpen = false
		let refreshInFlight = false
		let currentTransport: 'ws' | 'sse' | null = null

		const clearReconnect = () => {
			if (reconnectTimer) {
				window.clearTimeout(reconnectTimer)
				reconnectTimer = null
			}
		}

		const clearWSProbeTimer = () => {
			if (wsProbeTimer) {
				window.clearTimeout(wsProbeTimer)
				wsProbeTimer = null
			}
		}

		const closeWebSocket = () => {
			if (!ws) return
			ws.onopen = null
			ws.onerror = null
			ws.onclose = null
			ws.onmessage = null
			try {
				ws.close()
			} catch {
				// ignore
			}
			ws = null
		}

		const closeEventSource = () => {
			if (!es) return
			es.onopen = null
			es.onerror = null
			es.onmessage = null
			try {
				es.close()
			} catch {
				// ignore
			}
			es = null
		}

		const closeTransport = () => {
			closeWebSocket()
			closeEventSource()
		}

		const refreshWaitingJobs = async () => {
			if (stopped || refreshInFlight) return
			refreshInFlight = true
			const waiting = uploadTasksRef.current.filter((t) => t.status === 'waiting_job' && !!t.jobId)
			try {
				for (const task of waiting) {
					if (stopped) return
					try {
						const job = await api.jobs.getJob(task.profileId, task.jobId as string)
						if (stopped) return
						await handleUploadJobUpdate(task.id, job)
					} catch (err) {
						maybeReportNetworkError(err)
						if (stopped) return
						updateUploadTask(task.id, (prev) => ({ ...prev, error: formatErr(err) }))
					}
				}
			} finally {
				refreshInFlight = false
			}
		}

		const markRefreshOnReconnect = () => {
			if (hadConnected) {
				shouldRefreshOnOpen = true
			}
		}

		const scheduleReconnect = () => {
			if (stopped || reconnectTimer) return
			const jitter = Math.floor(Math.random() * 250)
			const delay = Math.min(20_000, 1000 * Math.pow(2, reconnectAttempt) + jitter)
			reconnectAttempt += 1
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

		const handleTransportOpen = (transport: 'ws' | 'sse') => {
			currentTransport = transport
			setConnected(true)
			reconnectAttempt = 0
			clearReconnect()
			if (transport === 'ws') {
				wsUnavailable = false
				clearWSProbeTimer()
			} else {
				scheduleWSProbe()
			}
			if (shouldRefreshOnOpen) {
				shouldRefreshOnOpen = false
				void refreshWaitingJobs()
			}
			hadConnected = true
		}

		const handleEvent = (data: string) => {
			try {
				const msg = JSON.parse(data) as WSEvent
				const { hasGap, resolvedSeq } = getRealtimeSequenceState(lastSeqRef.current, msg.seq)
				if (hasGap) {
					void refreshWaitingJobs()
				}
				lastSeqRef.current = resolvedSeq
				if (!msg.jobId || typeof msg.payload !== 'object' || msg.payload === null) return
				const task = uploadTasksRef.current.find((t) => t.status === 'waiting_job' && t.jobId === msg.jobId)
				if (!task) return
				if (msg.type !== 'job.progress' && msg.type !== 'job.completed') return
				const payload = msg.payload as { status?: JobStatus; progress?: JobProgress; error?: string | null }
				void handleUploadJobUpdate(task.id, payload)
			} catch {
				// ignore malformed events
			}
		}

		const fetchRealtimeTicket = async (transport: 'ws' | 'sse') => {
			const url = buildApiHttpUrl('/realtime-ticket')
			url.searchParams.set('transport', transport)

			const headers: Record<string, string> = {}
			if (apiToken) {
				headers['X-Api-Token'] = apiToken
			}

			const response = await fetch(url.toString(), {
				method: 'POST',
				headers,
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
			if (stopped || typeof window.EventSource === 'undefined') {
				setConnected(false)
				scheduleReconnect()
				return
			}
			const nonce = ++connectNonce
			clearReconnect()
			clearWSProbeTimer()
			closeTransport()
			let ticket = ''
			try {
				ticket = await fetchRealtimeTicket('sse')
			} catch {
				setConnected(false)
				scheduleReconnect()
				return
			}
			if (stopped || nonce !== connectNonce) return
			try {
				es = new EventSource(buildSSEURL(ticket, lastSeqRef.current))
			} catch {
				setConnected(false)
				scheduleReconnect()
				return
			}
			es.onopen = () => {
				handleTransportOpen('sse')
			}
			es.onerror = () => {
				markRefreshOnReconnect()
				clearWSProbeTimer()
				closeEventSource()
				currentTransport = 'sse'
				setConnected(false)
				scheduleReconnect()
			}
			es.onmessage = (ev) => handleEvent(ev.data)
		}

		const connectWS = async () => {
			if (stopped || typeof window.WebSocket === 'undefined') {
				await connectSSE()
				return
			}
			const nonce = ++connectNonce
			clearReconnect()
			clearWSProbeTimer()
			closeTransport()
			let ticket = ''
			try {
				ticket = await fetchRealtimeTicket('ws')
			} catch {
				await connectSSE()
				return
			}
			if (stopped || nonce !== connectNonce) return
			try {
				ws = new WebSocket(buildWSURL(ticket, lastSeqRef.current))
			} catch {
				await connectSSE()
				return
			}
			let wsOpened = false
			let disconnectHandled = false
			const wsFallbackTimer = window.setTimeout(() => {
				if (wsOpened || stopped || disconnectHandled) return
				try {
					ws?.close()
				} catch {
					// ignore
				}
			}, 1500)

			ws.onopen = () => {
				wsOpened = true
				window.clearTimeout(wsFallbackTimer)
				handleTransportOpen('ws')
				closeEventSource()
			}

			const onDisconnect = () => {
				if (disconnectHandled) return
				disconnectHandled = true
				window.clearTimeout(wsFallbackTimer)
				if (stopped) return
				const failedBeforeOpen = !wsOpened
				if (failedBeforeOpen) wsUnavailable = true
				markRefreshOnReconnect()
				currentTransport = null
				setConnected(false)
				void connectSSE()
				if (!failedBeforeOpen) scheduleReconnect()
			}

			ws.onerror = onDisconnect
			ws.onclose = onDisconnect
			ws.onmessage = (ev) => handleEvent(typeof ev.data === 'string' ? ev.data : '')
		}

		void connectWS()
		return () => {
			stopped = true
			clearReconnect()
			clearWSProbeTimer()
			closeTransport()
		}
	}, [api, apiToken, handleUploadJobUpdate, hasPendingUploadJobs, updateUploadTask, uploadTasksRef])

	useEffect(() => {
		if (!hasPendingUploadJobs || connected) return

		let stopped = false
		let pollInFlight = false
		const tick = async () => {
			if (pollInFlight) return
			pollInFlight = true
			const waiting = uploadTasksRef.current.filter((t) => t.status === 'waiting_job' && !!t.jobId)
			try {
				for (const task of waiting) {
					if (stopped) return
					try {
						const job = await api.jobs.getJob(task.profileId, task.jobId as string)
						if (stopped) return
						await handleUploadJobUpdate(task.id, job)
					} catch (err) {
						maybeReportNetworkError(err)
						updateUploadTask(task.id, (prev) => ({ ...prev, error: formatErr(err) }))
					}
				}
			} finally {
				pollInFlight = false
			}
		}

		void tick()
		const id = window.setInterval(() => void tick(), 2000)
		return () => {
			stopped = true
			window.clearInterval(id)
		}
	}, [api, connected, handleUploadJobUpdate, hasPendingUploadJobs, updateUploadTask, uploadTasksRef])
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
