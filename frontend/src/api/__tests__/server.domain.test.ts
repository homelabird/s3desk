import { describe, expect, it, vi } from 'vitest'

import { importPortableBackup, previewPortableImport, restoreServerBackup } from '../domains/server'

describe('backup bundle trust transport', () => {
	it.each([restoreServerBackup, previewPortableImport, importPortableBackup])('requires an explicit unsigned trust choice', async (send) => {
		const request = vi.fn().mockResolvedValue({})
		const file = new File(['synthetic bundle'], 'backup.tar.gz')
		await send(request, file)
		const defaultForm = request.mock.calls[0][1].body as FormData
		expect(defaultForm.get('allowUnsigned')).toBeNull()
		await send(request, file, 'synthetic-password', true)
		const trustedForm = request.mock.calls[1][1].body as FormData
		expect(trustedForm.get('allowUnsigned')).toBe('true')
		expect(trustedForm.get('password')).toBe('synthetic-password')
	})
})
