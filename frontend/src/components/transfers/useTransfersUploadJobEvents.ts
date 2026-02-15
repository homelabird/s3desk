import { useEffect, useState } from 'react'
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

function buildWSURL(apiToken: string): string {
	const url = buildApiWsUrl('/ws')
	if (apiToken) url.searchParams.set('apiToken', apiToken)
	url.searchParams.set('includeLogs', 'false')
	return url.toString()
}

function buildSSEURL(apiToken: string): string {
	const url = buildApiHttpUrl('/events')
	if (apiToken) url.searchParams.set('apiToken', apiToken)
	url.searchParams.set('includeLogs', 'false')
	return url.toString()
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
		let wsFallbackTimer: number | null = null
		let wsOpened = false

		const clearReconnect = () => {
			if (reconnectTimer) {
				window.clearTimeout(reconnectTimer)
				reconnectTimer = null
			}
		}

		const clearWSFallbackTimer = () => {
			if (wsFallbackTimer) {
				window.clearTimeout(wsFallbackTimer)
				wsFallbackTimer = null
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
				connect()
			}, delay)
		}

		const handleEvent = (data: string) => {
			try {
				const msg = JSON.parse(data) as WSEvent
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

		const closeTransport = () => {
			if (ws) {
				try {
					ws.close()
				} catch {
					// ignore
				}
				ws = null
			}
			if (es) {
				try {
					es.close()
				} catch {
					// ignore
				}
				es = null
			}
		}

		const connectSSE = () => {
			if (stopped || typeof window.EventSource === 'undefined') {
				setConnected(false)
				scheduleReconnect()
				return
			}
			clearReconnect()
			clearWSFallbackTimer()
			closeTransport()
			try {
				es = new EventSource(buildSSEURL(apiToken))
			} catch {
				setConnected(false)
				scheduleReconnect()
				return
			}
			es.onopen = () => {
				setConnected(true)
				reconnectAttempt = 0
			}
			es.onerror = () => {
				setConnected(false)
				scheduleReconnect()
			}
			es.onmessage = (ev) => handleEvent(ev.data)
		}

		const connectWS = () => {
			if (stopped || typeof window.WebSocket === 'undefined') {
				connectSSE()
				return
			}
			clearReconnect()
			clearWSFallbackTimer()
			closeTransport()
			wsOpened = false
			try {
				ws = new WebSocket(buildWSURL(apiToken))
			} catch {
				connectSSE()
				return
			}
			wsFallbackTimer = window.setTimeout(() => {
				if (!wsOpened && !stopped) {
					connectSSE()
				}
			}, 1500)
			ws.onopen = () => {
				wsOpened = true
				clearWSFallbackTimer()
				setConnected(true)
				reconnectAttempt = 0
			}
			ws.onerror = () => {
				setConnected(false)
				if (!wsOpened) {
					clearWSFallbackTimer()
					connectSSE()
					return
				}
				scheduleReconnect()
			}
			ws.onclose = () => {
				setConnected(false)
				if (!wsOpened) {
					clearWSFallbackTimer()
					connectSSE()
					return
				}
				scheduleReconnect()
			}
			ws.onmessage = (ev) => handleEvent(typeof ev.data === 'string' ? ev.data : '')
		}

		const connect = () => {
			connectWS()
		}

		connect()
		return () => {
			stopped = true
			clearReconnect()
			clearWSFallbackTimer()
			closeTransport()
		}
	}, [apiToken, handleUploadJobUpdate, hasPendingUploadJobs, uploadTasksRef])

	useEffect(() => {
		if (!hasPendingUploadJobs || connected) return

		let stopped = false
		const tick = async () => {
			const waiting = uploadTasksRef.current.filter((t) => t.status === 'waiting_job' && !!t.jobId)
			for (const task of waiting) {
				if (stopped) return
				try {
					const job = await api.getJob(task.profileId, task.jobId as string)
					if (stopped) return
					await handleUploadJobUpdate(task.id, job)
				} catch (err) {
					maybeReportNetworkError(err)
					updateUploadTask(task.id, (prev) => ({ ...prev, error: formatErr(err) }))
				}
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

