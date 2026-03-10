import { describe, expect, it } from 'vitest'

import { buildApiHttpUrlFor, buildApiWsUrlFor, DEFAULT_API_BASE_URL, getSafeBrowserObjectUrl, normalizeApiBaseUrl, stripApiBaseSuffix } from '../baseUrl'

describe('api/baseUrl', () => {
	it('normalizeApiBaseUrl trims and strips trailing slashes', () => {
		expect(normalizeApiBaseUrl('/api/v1/')).toBe('/api/v1')
		expect(normalizeApiBaseUrl('  /api/v1///  ')).toBe('/api/v1')
	})

	it('normalizeApiBaseUrl falls back to default when empty', () => {
		expect(normalizeApiBaseUrl('')).toBe(DEFAULT_API_BASE_URL)
		expect(normalizeApiBaseUrl('   ')).toBe(DEFAULT_API_BASE_URL)
	})

	it('normalizeApiBaseUrl rejects unsafe absolute schemes', () => {
		expect(normalizeApiBaseUrl('javascript:alert(1)')).toBe(DEFAULT_API_BASE_URL)
		expect(normalizeApiBaseUrl('data:text/plain,hello')).toBe(DEFAULT_API_BASE_URL)
	})

	it('buildApiHttpUrlFor builds URL relative to origin', () => {
		const url = buildApiHttpUrlFor('/api/v1', '/events', 'https://app.example.com')
		expect(url.toString()).toBe('https://app.example.com/api/v1/events')
	})

	it('buildApiHttpUrlFor builds URL for absolute API base', () => {
		const url = buildApiHttpUrlFor('https://api.example.com/api/v1', 'events', 'https://app.example.com')
		expect(url.toString()).toBe('https://api.example.com/api/v1/events')
	})

	it('buildApiWsUrlFor upgrades protocol (http->ws, https->wss)', () => {
		expect(buildApiWsUrlFor('/api/v1', '/ws', 'http://app.example.com').toString()).toBe('ws://app.example.com/api/v1/ws')
		expect(buildApiWsUrlFor('/api/v1', '/ws', 'https://app.example.com').toString()).toBe('wss://app.example.com/api/v1/ws')
		expect(buildApiWsUrlFor('https://api.example.com/api/v1', '/ws', 'https://app.example.com').toString()).toBe('wss://api.example.com/api/v1/ws')
		expect(buildApiWsUrlFor('http://api.example.com/api/v1', '/ws', 'https://app.example.com').toString()).toBe('ws://api.example.com/api/v1/ws')
	})

	it('stripApiBaseSuffix removes /api/v1 only when present at the end', () => {
		expect(stripApiBaseSuffix('/api/v1')).toBe('/')
		expect(stripApiBaseSuffix('/api/v1/')).toBe('/')
		expect(stripApiBaseSuffix('/s3desk/api/v1')).toBe('/s3desk')
		expect(stripApiBaseSuffix('/api/v2')).toBe('/api/v2')
	})

	it('classifies safe browser object URLs and rejects unsafe schemes', () => {
		expect(getSafeBrowserObjectUrl('https://storage.example.com/object.txt').kind).toBe('external_storage')
		expect(getSafeBrowserObjectUrl('/download-proxy?key=report.txt', { origin: 'https://app.example.com' }).kind).toBe('api_proxy')
		expect(() => getSafeBrowserObjectUrl('javascript:alert(1)')).toThrow(/Only HTTP\(S\)/)
		expect(() => getSafeBrowserObjectUrl('https://user:pass@example.com/object.txt')).toThrow(/embedded credentials/)
	})
})
