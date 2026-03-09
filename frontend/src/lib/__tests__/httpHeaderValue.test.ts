import { describe, expect, it } from 'vitest'

import { getHttpHeaderValueValidationError } from '../httpHeaderValue'

describe('httpHeaderValue', () => {
	it('accepts ASCII and Latin-1 header values', () => {
		expect(getHttpHeaderValueValidationError('X-Api-Token', 'token-123')).toBeNull()
		expect(getHttpHeaderValueValidationError('X-Api-Token', 'latin-1-\u00ff')).toBeNull()
	})

	it('rejects header values with line breaks', () => {
		expect(getHttpHeaderValueValidationError('X-Api-Token', 'bad\nvalue')).toContain('cannot contain line breaks')
	})

	it('rejects header values outside Latin-1', () => {
		expect(getHttpHeaderValueValidationError('X-Api-Token', '한글-token')).toContain('ASCII or Latin-1')
	})
})
