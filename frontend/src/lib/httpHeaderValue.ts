export function getHttpHeaderValueValidationError(name: string, value: string): string | null {
	if (!value) return null
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index)
		if (code === 0x0a || code === 0x0d) {
			return `${name} cannot contain line breaks.`
		}
		if ((code >= 0x00 && code <= 0x1f) || code === 0x7f) {
			return `${name} cannot contain control characters.`
		}
		if (code > 0xff) {
			return `${name} must use only ASCII or Latin-1 characters.`
		}
	}
	return null
}

export function assertHttpHeaderValue(name: string, value: string): void {
	const error = getHttpHeaderValueValidationError(name, value)
	if (error) {
		throw new Error(error)
	}
}
