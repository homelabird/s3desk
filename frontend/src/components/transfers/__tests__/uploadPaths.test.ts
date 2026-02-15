import { describe, expect, it } from 'vitest'

import { normalizeRelPath, normalizeUploadPath, resolveUploadItemPath, resolveUploadItemPathNormalized } from '../uploadPaths'

describe('normalizeRelPath', () => {
	it('normalizes slashes and trims', () => {
		expect(normalizeRelPath('  a\\b\\c.txt  ')).toBe('a/b/c.txt')
	})

	it('strips leading ./', () => {
		expect(normalizeRelPath('./a/b.txt')).toBe('a/b.txt')
	})
})

describe('normalizeUploadPath', () => {
	it('rejects empty and traversal', () => {
		expect(normalizeUploadPath('')).toBe('')
		expect(normalizeUploadPath('   ')).toBe('')
		expect(normalizeUploadPath('../c.txt')).toBe('')
		expect(normalizeUploadPath('a/../../c.txt')).toBe('')
	})

	it('normalizes slashes and dot segments', () => {
		expect(normalizeUploadPath('a\\\\b\\\\c.txt')).toBe('a/b/c.txt')
		expect(normalizeUploadPath('/a//b/./c.txt')).toBe('a/b/c.txt')
		expect(normalizeUploadPath('a/../c.txt')).toBe('c.txt')
		expect(normalizeUploadPath('dir/')).toBe('dir')
	})

	it('rejects NUL bytes', () => {
		expect(normalizeUploadPath('a/\u0000b.txt')).toBe('')
	})
})

describe('resolveUploadItemPath', () => {
	it('prefers relPath when present', () => {
		const file = new File(['x'], 'fallback.txt', { type: 'text/plain' })
		expect(resolveUploadItemPath({ file, relPath: '  a/b.txt  ' })).toBe('a/b.txt')
	})

	it('falls back to file.name when relPath is empty', () => {
		const file = new File(['x'], 'fallback.txt', { type: 'text/plain' })
		expect(resolveUploadItemPath({ file, relPath: '   ' })).toBe('fallback.txt')
		expect(resolveUploadItemPath({ file })).toBe('fallback.txt')
	})

	it('normalizes the resolved path', () => {
		const file = new File(['x'], 'fallback.txt', { type: 'text/plain' })
		expect(resolveUploadItemPathNormalized({ file, relPath: './a\\b.txt' })).toBe('a/b.txt')
	})
})
