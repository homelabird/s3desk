import { APIError } from '../api/client'

type JobQueueRetryOptions = {
	actionLabel?: string
	maxRetries?: number
}

export type JobQueueBannerDetail = {
	message: string
	type?: 'info' | 'warning'
}

const defaultRetryAfterSeconds = 3
const defaultMaxRetries = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const bannerEventName = 'job-queue-banner'
const bannerClearEventName = 'job-queue-banner:clear'

export function publishJobQueueBanner(detail: JobQueueBannerDetail) {
	if (typeof window === 'undefined') return
	window.dispatchEvent(new CustomEvent<JobQueueBannerDetail>(bannerEventName, { detail }))
}

export function clearJobQueueBanner() {
	if (typeof window === 'undefined') return
	window.dispatchEvent(new Event(bannerClearEventName))
}

export function subscribeJobQueueBanner(onShow: (detail: JobQueueBannerDetail) => void, onClear: () => void): () => void {
	if (typeof window === 'undefined') return () => {}
	const handleShow = (event: Event) => {
		if (!(event instanceof CustomEvent)) return
		onShow(event.detail as JobQueueBannerDetail)
	}
	const handleClear = () => onClear()
	window.addEventListener(bannerEventName, handleShow)
	window.addEventListener(bannerClearEventName, handleClear)
	return () => {
		window.removeEventListener(bannerEventName, handleShow)
		window.removeEventListener(bannerClearEventName, handleClear)
	}
}

function readQueueStats(details?: Record<string, unknown>): string {
	if (!details) return ''
	const rawDepth = details['queueDepth']
	const rawCapacity = details['queueCapacity']
	const depth = typeof rawDepth === 'number' ? rawDepth : Number(rawDepth)
	const capacity = typeof rawCapacity === 'number' ? rawCapacity : Number(rawCapacity)
	if (!Number.isFinite(depth) || !Number.isFinite(capacity)) return ''
	return ` (${depth}/${capacity})`
}

export async function withJobQueueRetry<T>(action: () => Promise<T>, options: JobQueueRetryOptions = {}): Promise<T> {
	const maxRetries = options.maxRetries ?? defaultMaxRetries
	let attempts = 0

	for (;;) {
		try {
			const result = await action()
			if (attempts > 0) clearJobQueueBanner()
			return result
		} catch (err) {
			if (!(err instanceof APIError) || err.status !== 429 || err.code !== 'job_queue_full') {
				if (attempts > 0) clearJobQueueBanner()
				throw err
			}
			if (attempts >= maxRetries) {
				clearJobQueueBanner()
				throw err
			}
			const retryAfter = err.retryAfterSeconds ?? defaultRetryAfterSeconds
			const delayMs = Math.max(500, retryAfter * 1000 * (attempts + 1))
			const jitterMs = Math.floor(Math.random() * 250)
			const queueHint = readQueueStats(err.details)
			const label = options.actionLabel ? ` (${options.actionLabel})` : ''
				publishJobQueueBanner({
					type: 'warning',
					message: `Queue full${queueHint}. Retrying${label} in ${Math.ceil((delayMs + jitterMs) / 1000)}s…`,
				})
			await sleep(delayMs + jitterMs)
			attempts += 1
		}
	}
}
