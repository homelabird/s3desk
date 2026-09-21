import { describe, expect, it } from 'vitest'
import { constrainUploadTuning, MiB, needsConservativeTransfers, sanitizeTransferSafetyMode, shouldUseNativeDownload } from '../transferSafetyPolicy'
import { isDownloadLinkFresh, validateNativeDownloadLink } from '../nativeDownloadLink'

const tuning = { batchConcurrency: 32, batchBytes: 128 * MiB, chunkConcurrency: 16, chunkSizeBytes: 256 * MiB, chunkThresholdBytes: 512 * MiB }
const desktop = { coarsePointer: false, saveData: false, deviceMemory: 8, effectiveType: '4g' }
describe('mobile transfer safety', () => {
	it.each([128, 512, 4096, 12288])('caps new transfers for a %i MiB file', (size) => {
		expect(constrainUploadTuning(tuning, size * MiB, true, false)).toEqual({ batchConcurrency: 2, batchBytes: 16 * MiB, chunkConcurrency: 2, chunkSizeBytes: 32 * MiB, chunkThresholdBytes: 64 * MiB })
	})
	it('uses smaller data-saver chunks while respecting the maximum part count', () => {
		expect(constrainUploadTuning(tuning, 4096 * MiB, true, true).chunkSizeBytes).toBe(16 * MiB)
		const size = 600000 * MiB
		expect(Math.ceil(size / constrainUploadTuning(tuning, size, true, true).chunkSizeBytes)).toBeLessThanOrEqual(10000)
	})
	it('preserves an explicit unrestricted choice and sanitizes invalid preferences', () => {
		expect(needsConservativeTransfers('unrestricted', { ...desktop, coarsePointer: true, saveData: true })).toBe(false)
		expect(constrainUploadTuning(tuning, 4096 * MiB, false, false)).toBe(tuning)
		expect(sanitizeTransferSafetyMode('wrong')).toBe('auto')
	})
	it.each([{ coarsePointer: true }, { saveData: true }, { effectiveType: '3g' }, { deviceMemory: 4 }])('detects constrained environments %j', (delta) => {
		expect(needsConservativeTransfers('auto', { ...desktop, ...delta })).toBe(true)
	})
	it('uses native downloads for mobile, unknown size and large objects', () => {
		expect(shouldUseNativeDownload(8, true)).toBe(true)
		expect(shouldUseNativeDownload(undefined, false)).toBe(true)
		expect(shouldUseNativeDownload(33 * MiB, false)).toBe(true)
		expect(shouldUseNativeDownload(8, false)).toBe(false)
	})
})
describe('browser download links', () => {
	const now = 100000
	const expiresAt = new Date(now + 300000).toISOString()
	it('accepts a short-lived HTTP(S) link and requires a fresh expiry', () => {
		const link = validateNativeDownloadLink({ url: '/download-proxy?sig=example', expiresAt }, 'https://app.example', now)
		expect(link.url).toBe('https://app.example/download-proxy?sig=example')
		expect(isDownloadLinkFresh(link.expiresAtMs, now)).toBe(true)
		expect(isDownloadLinkFresh(link.expiresAtMs, now + 300000)).toBe(false)
	})
	it.each(['javascript:alert(1)', 'data:text/html,test', 'https://user:pass@app.example/x', '/x?apiToken=secret', '/x?X-Api-Token=secret'])('rejects unsafe links %s', (url) => {
		expect(() => validateNativeDownloadLink({ url, expiresAt }, 'https://app.example', now)).toThrow()
	})
	it('rejects expired or malformed expiry values', () => {
		expect(() => validateNativeDownloadLink({ url: '/x', expiresAt: 'invalid' }, 'https://app.example', now)).toThrow()
		expect(() => validateNativeDownloadLink({ url: '/x', expiresAt: new Date(now).toISOString() }, 'https://app.example', now)).toThrow()
	})
})
