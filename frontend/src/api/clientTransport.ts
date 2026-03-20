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
	const fetchResponse: FetchResponseFn = async (path, init, options = {}) => {
		const mergedOptions = mergeRequestOptions(args.getDefaultOptions(), options)
		const headers = new Headers(init.headers ?? {})
		setSafeFetchHeader(headers, 'X-Profile-Id', mergedOptions.profileId)
		setSafeFetchHeader(headers, 'X-Api-Token', args.getApiToken())

		const res = await fetchWithRetry(args.getBaseUrl() + path, {
			...init,
			headers,
		}, mergedOptions)

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
