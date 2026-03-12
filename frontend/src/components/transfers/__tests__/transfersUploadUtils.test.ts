import { describe, expect, it } from 'vitest'

import { buildUploadItems } from '../transfersUploadUtils'

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
})
