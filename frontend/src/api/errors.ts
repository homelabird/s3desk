import type { ErrorResponse } from './types'

export type NormalizedError = {
	code: string
	retryable: boolean
}

export class APIError extends Error {
	status: number
	code: string
	normalizedError?: NormalizedError
	details?: Record<string, unknown>
	retryAfterSeconds?: number

	constructor(args: { status: number; code: string; message: string; normalizedError?: NormalizedError; details?: Record<string, unknown>; retryAfterSeconds?: number }) {
		super(args.message)
		this.name = 'APIError'
		this.status = args.status
		this.code = args.code
		this.normalizedError = args.normalizedError
		this.details = args.details
		this.retryAfterSeconds = args.retryAfterSeconds
	}
}

export class RequestAbortedError extends Error {
	constructor(message = 'request aborted') {
		super(message)
		this.name = 'RequestAbortedError'
	}
}

export class RequestTimeoutError extends Error {
	timeoutMs: number
	constructor(timeoutMs: number, message = `request timed out after ${timeoutMs}ms`) {
		super(message)
		this.name = 'RequestTimeoutError'
		this.timeoutMs = timeoutMs
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseNormalizedErrorFromBody(body: unknown): NormalizedError | undefined {
	if (!isRecord(body)) return undefined
	const rawErr = body.error
	if (!isRecord(rawErr)) return undefined
	const rawNorm = rawErr.normalizedError
	if (!isRecord(rawNorm)) return undefined
	const code = rawNorm.code
	const retryable = rawNorm.retryable
	if (typeof code !== 'string' || typeof retryable !== 'boolean') return undefined
	return { code, retryable }
}

export async function readNormalizedErrorFromResponse(res: Response): Promise<NormalizedError | undefined> {
	const contentType = res.headers.get('content-type') ?? ''
	if (!contentType.includes('application/json')) return undefined
	try {
		const body = (await res.clone().json()) as unknown
		return parseNormalizedErrorFromBody(body)
	} catch {
		return undefined
	}
}

export function parseAPIError(status: number, bodyText: string | null): APIError {
	const raw = typeof bodyText === 'string' ? bodyText : ''
	try {
		const parsed: unknown = JSON.parse(raw)
		if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
			const er = parsed as ErrorResponse
			return new APIError({
				status,
				code: er.error?.code ?? 'error',
				message: er.error?.message ?? 'request failed',
				normalizedError: er.error?.normalizedError ?? undefined,
				details: er.error?.details,
			})
		}
	} catch {
		// fall through
	}

	return new APIError({
		status,
		code: 'http_error',
		message: raw || 'request failed',
	})
}
