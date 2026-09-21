import { waitForNetworkRetry } from '../lib/networkRecovery'
import { clearNetworkStatus, logNetworkEvent, publishNetworkStatus } from '../lib/networkStatus'
import { DEFAULT_TIMEOUT_MS, MAX_RETRY_DELAY_MS, parseRetryAfterSeconds, readRetryDefaults } from './config'
import { readNormalizedErrorFromResponse, RequestAbortedError, RequestTimeoutError } from './errors'

export type RequestOptions = {
	profileId?: string
	timeoutMs?: number
	retries?: number
	retryDelayMs?: number
	/** Only after server capability verification, for receipt-protected controls. */
	operationReplay?: boolean
}

export function rejectedTransferHandle<T>(error: Error): { promise: Promise<T>; abort: () => void } {
	return {
		promise: Promise.reject(error),
		abort: () => {},
	}
}

function isIdempotentMethod(method?: string): boolean {
	return !method || ['GET', 'HEAD'].includes(method.toUpperCase())
}

function shouldRetryStatus(status: number): boolean {
	return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function isRetryableFetchError(err: unknown): boolean {
	if (err instanceof RequestTimeoutError) return true
	if (err instanceof RequestAbortedError) return false
	if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') return false
	return err instanceof TypeError
}

function retryDelayMs(baseDelayMs: number, attempt: number): number {
	const jitter = Math.floor(Math.random() * 200)
	const delay = Math.min(baseDelayMs * Math.pow(2, attempt), MAX_RETRY_DELAY_MS)
	return delay + jitter
}

function retryDelayLabel(delayMs: number): string {
	return `${Math.max(1, Math.ceil(delayMs / 1000))}s`
}

function sleep(delayMs: number, signal?: AbortSignal | null): Promise<void> {
	if (!signal) return new Promise((resolve) => setTimeout(resolve, delayMs))
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			clearTimeout(timer)
			signal.removeEventListener('abort', onAbort)
			reject(new RequestAbortedError())
		}
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort)
			resolve()
		}, delayMs)
		signal.addEventListener('abort', onAbort, { once: true })
		if (signal.aborted) onAbort()
	})
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
	if (!timeoutMs || timeoutMs <= 0) {
		return fetch(url, init)
	}

	let timedOut = false
	const controller = new AbortController()
	const signal = controller.signal

	let cleanup = () => {}
	if (init.signal) {
		if (init.signal.aborted) {
			controller.abort()
		} else {
			const onAbort = () => controller.abort()
			init.signal.addEventListener('abort', onAbort, { once: true })
			cleanup = () => init.signal?.removeEventListener('abort', onAbort)
		}
	}

	const timer = setTimeout(() => {
		timedOut = true
		controller.abort()
	}, timeoutMs)

	try {
		const response = await fetch(url, { ...init, signal })
		if (!response.body) return response
		const body = await response.arrayBuffer()
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		})
	} catch (err) {
		if (timedOut) throw new RequestTimeoutError(timeoutMs)
		throw err
	} finally {
		clearTimeout(timer)
		cleanup()
	}
}

export async function fetchWithRetry(url: string, init: RequestInit, options: RequestOptions): Promise<Response> {
	const protectedOperation = options.operationReplay === true && !!new Headers(init.headers).get('Idempotency-Key')
	const idempotent = isIdempotentMethod(init.method) || protectedOperation
	const retryDefaults = readRetryDefaults()
	const retries = options.retries ?? (idempotent ? retryDefaults.retries : 0)
	const timeoutMs = options.timeoutMs ?? (idempotent ? DEFAULT_TIMEOUT_MS : 0)
	const baseDelayMs = options.retryDelayMs ?? retryDefaults.retryDelayMs

	const statusScope = Symbol()
	let attempt = 0
	try {
		for (;;) {
			if (init.signal?.aborted) throw new RequestAbortedError()
			try {
				const res = await fetchWithTimeout(url, init, timeoutMs)
				if (!res.ok && idempotent && attempt < retries) {
					const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get('Retry-After'))
					const normalizedError = await readNormalizedErrorFromResponse(res)
					const operationError = protectedOperation ? await res.clone().json().catch(() => null) : null
					const unknown = operationError?.error?.code === 'operation_outcome_unknown'
					// A completed receipt, including a provider error, is definitive.
					// Gateway response loss can safely retry only the SAME operation key.
					const retryDueToStatus = protectedOperation
						? res.headers.get('Idempotency-Replayed') == null && !unknown && (
							['operation_in_progress', 'operation_receipt_unavailable'].includes(operationError?.error?.code) || [502, 503, 504].includes(res.status))
						: shouldRetryStatus(res.status)
					const retryDueToNormalized = !protectedOperation && normalizedError?.retryable === true
					if (retryDueToStatus || retryDueToNormalized) {
						const delayMs =
							retryAfterSeconds != null ? Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS) : retryDelayMs(baseDelayMs, attempt)
						const delayLabel = retryDelayLabel(delayMs)
						const reasonParts: string[] = [retryDueToStatus ? `HTTP ${res.status}` : `normalized=${normalizedError?.code ?? 'retryable'}`]
						if (retryAfterSeconds != null) reasonParts.push(`Retry-After ${retryAfterSeconds}s`)
						if (retryDueToStatus && normalizedError?.code) reasonParts.push(`normalized=${normalizedError.code}`)
						const reason = reasonParts.join(', ')
						logNetworkEvent({ kind: 'retry', message: `Retry ${attempt + 1}/${retries} in ${delayLabel} (${reason})` })
						const message = `Temporary request failure (${reason}). Auto-retry in ${delayLabel}.`
						publishNetworkStatus({ kind: 'unstable', message }, statusScope)
						await sleep(delayMs, init.signal)
						publishNetworkStatus({ kind: 'unstable', message: 'Retrying request…' }, statusScope)
						attempt += 1
						continue
					}
				}
				return res
			} catch (err) {
				if (init.signal?.aborted) throw new RequestAbortedError()
				if (idempotent && attempt < retries && isRetryableFetchError(err)) {
					const delayMs = retryDelayMs(baseDelayMs, attempt)
					const delayLabel = retryDelayLabel(delayMs)
					logNetworkEvent({ kind: 'retry', message: `Retry ${attempt + 1}/${retries} in ${delayLabel} (network error)` })
					publishNetworkStatus({ kind: 'unstable', message: `Network unstable. Auto-retry in ${delayLabel}.` }, statusScope)
					await waitForNetworkRetry(delayMs, init.signal)
					publishNetworkStatus({ kind: 'unstable', message: 'Retrying request…' }, statusScope)
					attempt += 1
					continue
				}
				throw err
			}
		}
	} finally {
		clearNetworkStatus(statusScope)
	}
}
