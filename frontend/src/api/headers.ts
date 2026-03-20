import { getHttpHeaderValueValidationError } from '../lib/httpHeaderValue'

export function createInvalidHeaderValueError(name: string, value: string): Error | null {
	const message = getHttpHeaderValueValidationError(name, value)
	return message ? new Error(message) : null
}

export function setSafeFetchHeader(headers: Headers, name: string, value?: string | null) {
	const normalized = value?.trim()
	if (!normalized) return
	const err = createInvalidHeaderValueError(name, normalized)
	if (err) throw err
	headers.set(name, normalized)
}

export function setSafeXHRHeader(xhr: XMLHttpRequest, name: string, value?: string | null) {
	const normalized = value?.trim()
	if (!normalized) return
	const err = createInvalidHeaderValueError(name, normalized)
	if (err) throw err
	xhr.setRequestHeader(name, normalized)
}
