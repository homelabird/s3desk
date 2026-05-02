import { afterEach, describe, expect, it } from 'vitest'

import { clipboardFailureHint } from '../clipboard'

const originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext')

function restoreSecureContext(descriptor?: PropertyDescriptor) {
	if (descriptor) {
		Object.defineProperty(window, 'isSecureContext', descriptor)
		return
	}
	Reflect.deleteProperty(window, 'isSecureContext')
}

afterEach(() => {
	restoreSecureContext(originalSecureContext)
})

describe('clipboardFailureHint', () => {
	it('returns the localhost-based origin hint for insecure contexts', () => {
		Object.defineProperty(window, 'isSecureContext', {
			value: false,
			configurable: true,
		})

		expect(clipboardFailureHint()).toBe(
			'Copy failed. Clipboard access is restricted on insecure origins (try HTTPS or a localhost-based origin).',
		)
	})

	it('keeps the generic fallback for secure contexts', () => {
		Object.defineProperty(window, 'isSecureContext', {
			value: true,
			configurable: true,
		})

		expect(clipboardFailureHint()).toBe('Copy failed.')
	})
})
