import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildUploadItems, promptForFiles } from '../transfersUploadUtils'

function withUploadPath(
	file: File,
	key: 'webkitRelativePath' | 'relativePath',
	value: string,
): File {
	Object.defineProperty(file, key, {
		value,
		configurable: true,
	})
	return file
}

describe('buildUploadItems', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('strips the shared browser folder root from webkitRelativePath selections', () => {
		const files = [
			withUploadPath(new File(['alpha'], 'alpha.txt', { type: 'text/plain' }), 'webkitRelativePath', 'upload-folder/dir-a/alpha.txt'),
			withUploadPath(new File(['beta'], 'beta.txt', { type: 'text/plain' }), 'webkitRelativePath', 'upload-folder/dir-b/nested/beta.txt'),
		]

		expect(buildUploadItems(files, { directorySelectionMode: 'input' })).toMatchObject([
			{ relPath: 'dir-a/alpha.txt' },
			{ relPath: 'dir-b/nested/beta.txt' },
		])
	})

	it('preserves explicit relativePath values from directory-handle selections', () => {
		const files = [
			withUploadPath(new File(['alpha'], 'alpha.txt', { type: 'text/plain' }), 'relativePath', 'dir-a/alpha.txt'),
			withUploadPath(new File(['beta'], 'beta.txt', { type: 'text/plain' }), 'relativePath', 'dir-b/nested/beta.txt'),
		]

		expect(buildUploadItems(files)).toMatchObject([
			{ relPath: 'dir-a/alpha.txt' },
			{ relPath: 'dir-b/nested/beta.txt' },
		])
	})

	it('strips the shared browser folder root when input selections expose relativePath', () => {
		const files = [
			withUploadPath(new File(['alpha'], 'alpha.txt', { type: 'text/plain' }), 'relativePath', 'upload-folder/dir-a/alpha.txt'),
			withUploadPath(new File(['beta'], 'beta.txt', { type: 'text/plain' }), 'relativePath', 'upload-folder/dir-b/nested/beta.txt'),
		]

		expect(buildUploadItems(files, { directorySelectionMode: 'input' })).toMatchObject([
			{ relPath: 'dir-a/alpha.txt' },
			{ relPath: 'dir-b/nested/beta.txt' },
		])
	})

	it('resolves null when the file picker is canceled', async () => {
		vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
			window.dispatchEvent(new Event('focus'))
		})

		await expect(promptForFiles({ multiple: true, directory: false })).resolves.toBeNull()
		expect(document.querySelector('input[type="file"]')).toBeNull()
	})

	it('returns selected files when the file picker changes', async () => {
		const file = new File(['hello'], 'demo.txt', { type: 'text/plain' })
		vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
			Object.defineProperty(this, 'files', {
				value: [file],
				configurable: true,
			})
			this.dispatchEvent(new Event('change'))
		})

		await expect(promptForFiles({ multiple: true, directory: false })).resolves.toEqual([file])
		expect(document.querySelector('input[type="file"]')).toBeNull()
	})
})
