import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

import { buildApiHttpUrl, buildApiWsUrl } from '../../api/baseUrl'
import type { APIClientShape } from '../../api/client'
import type { JobProgress, JobStatus, WSEvent } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { maybeReportNetworkError } from './transferDownloadUtils'
import type { UploadTask } from './transferTypes'

type UseTransfersUploadJobEventsArgs = {
	api: APIClientShape
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
	const refreshInFlightRef = useRef(false)
	const refreshSignalRef = useRef<AbortSignal | null>(null)
	const pendingRefreshRef = useRef<{ isStopped: () => boolean; signal: AbortSignal } | null>(null)
	const refreshInputsRef = useRef({ api, handleUploadJobUpdate, updateUploadTask, uploadTasksRef })
	useEffect(() => {
		refreshInputsRef.current = { api, handleUploadJobUpdate, updateUploadTask, uploadTasksRef }
	}, [api, handleUploadJobUpdate, updateUploadTask, uploadTasksRef])

	const refreshWaitingJobs = useCallback(async (isStopped: () => boolean, signal: AbortSignal, queueIfBusy = false) => {
		if (isStopped() || signal.aborted) return
		if (refreshInFlightRef.current) {
			if (queueIfBusy || refreshSignalRef.current !== signal) pendingRefreshRef.current = { isStopped, signal }
			return
		}

		refreshInFlightRef.current = true
		refreshSignalRef.current = signal
		let shouldStop = isStopped
		let currentSignal = signal
		try {
			while (true) {
				if (!shouldStop() && !currentSignal.aborted) {
					const {
						api: currentApi,
						handleUploadJobUpdate: handleUpdate,
						updateUploadTask: updateTask,
						uploadTasksRef: tasksRef,
					} = refreshInputsRef.current
					const waiting = tasksRef.current.filter((task) => task.status === 'waiting_job' && !!task.jobId)
					const byProfile = new Map<string, UploadTask[]>()
					for (const task of waiting) {
						const tasks = byProfile.get(task.profileId) ?? []
						tasks.push(task)
						byProfile.set(task.profileId, tasks)
					}

					for (const [profileId, tasks] of byProfile) {
						if (shouldStop() || currentSignal.aborted) break
						for (let index = 0; index < tasks.length; index += 200) {
							if (shouldStop() || currentSignal.aborted) break
							const batch = tasks.slice(index, index + 200)
							try {
								const response = await currentApi.jobs.listJobs(profileId, {
									ids: batch.map((task) => task.jobId as string),
									limit: batch.length,
									signal: currentSignal,
								})
								if (shouldStop() || currentSignal.aborted) break
								const jobsByID = new Map(response.items.map((job) => [job.id, job]))
								await Promise.all(
									batch.map(async (task) => {
										if (shouldStop() || currentSignal.aborted) return
										const current = tasksRef.current.find((candidate) => candidate.id === task.id)
										if (
											!current ||
											current.status !== 'waiting_job' ||
											current.profileId !== task.profileId ||
											current.jobId !== task.jobId
										) {
											return
										}
										const job = jobsByID.get(task.jobId as string)
										if (job) {
											await handleUpdate(task.id, job)
											return
										}
										updateTask(task.id, (prev) =>
											prev.status === 'waiting_job' &&
											prev.profileId === task.profileId &&
											prev.jobId === task.jobId
												? { ...prev, error: 'job not found' }
												: prev,
										)
									}),
								)
							} catch (err) {
								if (shouldStop() || currentSignal.aborted) break
								maybeReportNetworkError(err)
								for (const task of batch) {
									updateTask(task.id, (prev) =>
										prev.status === 'waiting_job' &&
										prev.profileId === task.profileId &&
										prev.jobId === task.jobId
											? { ...prev, error: formatErr(err) }
											: prev,
									)
								}
							}
						}
					}
				}

				const pending = pendingRefreshRef.current
				pendingRefreshRef.current = null
				if (!pending) return
				shouldStop = pending.isStopped
				currentSignal = pending.signal
				refreshSignalRef.current = currentSignal
			}
		} finally {
			refreshInFlightRef.current = false
			refreshSignalRef.current = null
		}
	}, [])

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
		const controller = new AbortController()
		let ws: WebSocket | null = null
		let es: EventSource | null = null
		let reconnectTimer: number | null = null
		let reconnectAttempt = 0
		let connectNonce = 0
		let wsUnavailable = false
		let hadConnected = false
		let shouldRefreshOnOpen = false

		const clearReconnect = () => {
			if (reconnectTimer) {
				window.clearTimeout(reconnectTimer)
				reconnectTimer = null
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

		const handleTransportOpen = (transport: 'ws' | 'sse') => {
			setConnected(true)
			reconnectAttempt = 0
			clearReconnect()
			if (transport === 'ws') {
				wsUnavailable = false
			}
			if (shouldRefreshOnOpen) {
				shouldRefreshOnOpen = false
				void refreshWaitingJobs(() => stopped, controller.signal, true)
			}
			hadConnected = true
		}

		const handleEvent = (data: string) => {
			try {
				const msg = JSON.parse(data) as WSEvent
				const { hasGap, resolvedSeq } = getRealtimeSequenceState(lastSeqRef.current, msg.seq)
				if (hasGap) {
					void refreshWaitingJobs(() => stopped, controller.signal, true)
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
				signal: controller.signal,
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
			if (typeof window.EventSource === 'undefined') {
				wsUnavailable = false
				setConnected(false)
				scheduleReconnect()
				return
			}
			const nonce = ++connectNonce
			clearReconnect()
			closeTransport()
			let ticket = ''
			try {
				ticket = await fetchRealtimeTicket('sse')
			} catch {
				wsUnavailable = false
				setConnected(false)
				scheduleReconnect()
				return
			}
			if (stopped || nonce !== connectNonce) return
			try {
				es = new EventSource(buildSSEURL(ticket, lastSeqRef.current))
			} catch {
				wsUnavailable = false
				setConnected(false)
				scheduleReconnect()
				return
			}
			es.onopen = () => {
				handleTransportOpen('sse')
			}
			es.onerror = () => {
				markRefreshOnReconnect()
				closeEventSource()
				wsUnavailable = false
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
			controller.abort()
			clearReconnect()
			closeTransport()
		}
	}, [apiToken, handleUploadJobUpdate, hasPendingUploadJobs, refreshWaitingJobs, uploadTasksRef])

	useEffect(() => {
		if (!hasPendingUploadJobs || connected) return

		let stopped = false
		const controller = new AbortController()
		const tick = async () => {
			await refreshWaitingJobs(() => stopped, controller.signal)
		}

		void tick()
		const id = window.setInterval(() => void tick(), 2000)
		return () => {
			stopped = true
			controller.abort()
			window.clearInterval(id)
		}
	}, [apiToken, connected, hasPendingUploadJobs, refreshWaitingJobs])
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
