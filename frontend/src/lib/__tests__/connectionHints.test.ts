import { describe, expect, it } from 'vitest'

import { getConnectionTroubleshootingHint } from '../connectionHints'

describe('getConnectionTroubleshootingHint', () => {
	it('returns hint for invalid_credentials', () => {
		const hint = getConnectionTroubleshootingHint('invalid_credentials')
		expect(hint).toBeDefined()
		expect(hint).toContain('Access Key')
	})

	it('returns hint for endpoint_unreachable', () => {
		const hint = getConnectionTroubleshootingHint('endpoint_unreachable')
		expect(hint).toBeDefined()
		expect(hint).toContain('endpoint')
	})

	it('returns hint for signature_mismatch', () => {
		const hint = getConnectionTroubleshootingHint('signature_mismatch')
		expect(hint).toBeDefined()
		expect(hint).toContain('region')
	})

	it('returns hint for invalid_config', () => {
		const hint = getConnectionTroubleshootingHint('invalid_config')
		expect(hint).toBeDefined()
		expect(hint).toContain('endpoint')
	})

	it('returns hint for network_error', () => {
		const hint = getConnectionTroubleshootingHint('network_error')
		expect(hint).toBeDefined()
		expect(hint).toContain('Network')
	})

	it('returns undefined for unknown codes', () => {
		expect(getConnectionTroubleshootingHint('unknown_code')).toBeUndefined()
		expect(getConnectionTroubleshootingHint('')).toBeUndefined()
	})
})
