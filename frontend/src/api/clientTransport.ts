import { OperationRecoveryRegistry, supportsOperationReceipt } from './operationRecovery'
import { awaitWithSignal } from '../lib/networkRecovery'
import { parseRetryAfterSeconds } from './config'
import { APIError, parseAPIError } from './errors'
import { setSafeFetchHeader } from './headers'
import { fetchWithRetry, type RequestOptions } from './retryTransport'
import type { ErrorResponse } from './types'

type RequestFn = <T>(path: string, init: RequestInit, options?: RequestOptions) => Promise<T>
type FetchResponseFn = (path: string, init: RequestInit, options?: RequestOptions) => Promise<Response>

export type APIClientTransport = {
	request: RequestFn
	fetchResponse: FetchResponseFn
	fetchRawResponse: FetchResponseFn
}

export function createAPIClientTransport(args: {
	getBaseUrl: () => string
	getApiToken: () => string
	getDefaultOptions: () => RequestOptions
}): APIClientTransport {
	const operations = new OperationRecoveryRegistry()
	let replayCapability: Promise<boolean> | undefined
	const canReplay = (): Promise<boolean> => {
		if (!replayCapability) {
			replayCapability = (async () => {
				const headers = new Headers()
				setSafeFetchHeader(headers, 'X-Api-Token', args.getApiToken())
				const res = await fetchWithRetry(args.getBaseUrl() + '/operations/capabilities', { method: 'GET', headers }, { timeoutMs: 10_000 })
				if (res.status === 404) return false // Old server: never auto-replay mutations.
				if (!res.ok) throw parseAPIError(res.status, await res.text())
				const cap = await res.json()
				return cap?.version === 1 && cap?.durable === true
			})().catch((error) => { replayCapability = undefined; throw error })
		}
		return replayCapability
	}
	const fetchResponse: FetchResponseFn = async (path, init, options = {}) => {
		const mergedOptions = mergeRequestOptions(args.getDefaultOptions(), options)
		const headers = new Headers(init.headers ?? {})
		setSafeFetchHeader(headers, 'X-Profile-Id', mergedOptions.profileId)
		setSafeFetchHeader(headers, 'X-Api-Token', args.getApiToken())

		let recovery: Awaited<ReturnType<OperationRecoveryRegistry['acquire']>> | undefined
		if (supportsOperationReceipt(path, init.method) && (init.body == null || typeof init.body === 'string') && await awaitWithSignal(canReplay(), init.signal)) {
			recovery = await awaitWithSignal(operations.acquire(JSON.stringify([args.getBaseUrl(), args.getApiToken(), mergedOptions.profileId, init.method, path, init.body ?? ''])), init.signal)
			headers.set('Idempotency-Key', recovery.operation.key)
			mergedOptions.operationReplay = true
			// Keep the timeout active until the SMALL control response body is read.
			if (!mergedOptions.timeoutMs || mergedOptions.timeoutMs <= 0) mergedOptions.timeoutMs = 30_000
		}
		const res = await fetchWithRetry(args.getBaseUrl() + path, { ...init, headers }, mergedOptions)
		// Do not forget the key after a gateway error or other unconfirmed result.
		// A subsequent explicit retry (including after refresh) reuses that intent.
		if (recovery && res.status < 500 && res.headers.has('Idempotency-Replayed')) {
			operations.settle(recovery.signature, recovery.operation.key)
		}

		const contentType = res.headers.get('content-type') ?? ''
		const isJSON = contentType.includes('application/json')
		const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get('Retry-After'))

		if (!res.ok) {
			let body: unknown = null
			if (isJSON) {
				body = await res.json().catch(() => null)
			} else {
				body = await res.text().catch(() => null)
			}

			if (typeof body === 'object' && body !== null && 'error' in body) {
				const er = body as ErrorResponse
				throw new APIError({
					status: res.status,
					code: er.error?.code ?? 'error',
					message: er.error?.message ?? res.statusText,
					normalizedError: er.error?.normalizedError ?? undefined,
					details: er.error?.details,
					retryAfterSeconds,
				})
			}

			throw new APIError({
				status: res.status,
				code: 'http_error',
				message: typeof body === 'string' && body ? body : res.statusText,
				retryAfterSeconds,
			})
		}

		return res
	}

	const fetchRawResponse: FetchResponseFn = async (path, init, options = {}) => {
		const mergedOptions = mergeRequestOptions(args.getDefaultOptions(), options)
		const headers = new Headers(init.headers ?? {})
		setSafeFetchHeader(headers, 'X-Profile-Id', mergedOptions.profileId)
		setSafeFetchHeader(headers, 'X-Api-Token', args.getApiToken())

		const res = await fetchWithRetry(args.getBaseUrl() + path, {
			...init,
			headers,
		}, mergedOptions)

		if (res.ok) return res
		const bodyText = await res.text().catch(() => null)
		throw parseAPIError(res.status, bodyText)
	}

	const request: RequestFn = async <T>(path: string, init: RequestInit, options: RequestOptions = {}) => {
		const res = await fetchResponse(path, init, options)
		if (res.status === 204) {
			return undefined as T
		}

		const contentType = res.headers.get('content-type') ?? ''
		if (contentType.includes('application/json')) {
			return (await res.json()) as T
		}

		return (await res.text()) as unknown as T
	}

	return {
		request,
		fetchResponse,
		fetchRawResponse,
	}
}

function mergeRequestOptions(defaults: RequestOptions, overrides: RequestOptions): RequestOptions {
	return { ...defaults, ...overrides }
}
