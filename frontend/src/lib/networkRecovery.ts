import { RequestAbortedError } from '../api/errors'

/** Connectivity events are hints, never proof that the API is reachable. */
export function subscribeNetworkRecovery(callback: () => void): () => void {
	if (typeof window === 'undefined') return () => {}
	const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { connection?: EventTarget }
	let timer: ReturnType<typeof setTimeout> | undefined
	let lastEmittedAt = 0
	const changed = () => {
		if (timer !== undefined) return
		timer = setTimeout(() => { timer = undefined; lastEmittedAt = Date.now(); callback() }, Math.max(150, 2000 - (Date.now() - lastEmittedAt)))
	}
	window.addEventListener('online', changed)
	nav?.connection?.addEventListener('change', changed)
	return () => {
		clearTimeout(timer)
		window.removeEventListener('online', changed)
		nav?.connection?.removeEventListener('change', changed)
	}
}

/** Bounded backoff: never wait indefinitely for navigator.onLine. */
export function waitForNetworkRetry(delayMs: number, signal?: AbortSignal | null): Promise<void> {
	return new Promise((resolve, reject) => {
		let unsubscribe = () => {}
		const cleanup = () => { clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', abort) }
		const finish = () => { cleanup(); resolve() }
		const abort = () => { cleanup(); reject(new RequestAbortedError()) }
		const timer = setTimeout(finish, Math.max(0, delayMs))
		unsubscribe = subscribeNetworkRecovery(finish)
		signal?.addEventListener('abort', abort, { once: true })
		if (signal?.aborted) abort()
	})
}

/** Cancel one consumer without canceling a shared capability query. */
export function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
	if (!signal) return promise
	if (signal.aborted) return Promise.reject(new RequestAbortedError())
	return new Promise((resolve, reject) => {
		const abort = () => reject(new RequestAbortedError())
		signal.addEventListener('abort', abort, { once: true })
		promise.then(
			value => { signal.removeEventListener('abort', abort); if (!signal.aborted) resolve(value) },
			error => { signal.removeEventListener('abort', abort); reject(error) },
		)
	})
}
