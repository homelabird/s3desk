import { afterEach, describe, expect, it, vi } from 'vitest'

import { collectFilesFromDirectoryHandle, ensureReadWritePermission, getDevicePickerSupport } from '../deviceFs'
import { directoryPickerInsecureOriginReason, directoryPickerUnsupportedBrowserReason, localFolderWritePermissionDeniedHint } from '../secureContext'

const originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
const originalShowDirectoryPicker = Object.getOwnPropertyDescriptor(window, 'showDirectoryPicker')

function restoreWindowProperty(key: 'isSecureContext' | 'showDirectoryPicker', descriptor?: PropertyDescriptor) {
	if (descriptor) {
		Object.defineProperty(window, key, descriptor)
		return
	}
	Reflect.deleteProperty(window, key)
}

afterEach(() => {
	restoreWindowProperty('isSecureContext', originalSecureContext)
	restoreWindowProperty('showDirectoryPicker', originalShowDirectoryPicker)
})

describe('getDevicePickerSupport', () => {
	it('surfaces the unsupported-browser reason when window pickers do not exist', () => {
		Reflect.deleteProperty(window, 'showDirectoryPicker')
		Object.defineProperty(window, 'isSecureContext', {
			value: true,
			configurable: true,
		})

		expect(getDevicePickerSupport()).toEqual({
			ok: false,
			reason: directoryPickerUnsupportedBrowserReason(),
		})
	})

	it('surfaces the localhost-based origin hint when the browser is insecure', () => {
		Object.defineProperty(window, 'showDirectoryPicker', {
			value: async () => {
				throw new Error('not used')
			},
			configurable: true,
		})
		Object.defineProperty(window, 'isSecureContext', {
			value: false,
			configurable: true,
		})

		expect(getDevicePickerSupport()).toEqual({
			ok: false,
			reason: directoryPickerInsecureOriginReason(),
		})
	})

	it('accepts localhost-based secure contexts when the picker exists', () => {
		Object.defineProperty(window, 'showDirectoryPicker', {
			value: async () => {
				throw new Error('not used')
			},
			configurable: true,
		})
		Object.defineProperty(window, 'isSecureContext', {
			value: true,
			configurable: true,
		})

		expect(getDevicePickerSupport()).toEqual({ ok: true })
	})
})

describe('ensureReadWritePermission', () => {
	it('does not request permission again when readwrite access is already granted', async () => {
		const requestPermission = vi.fn()
		const handle = {
			queryPermission: vi.fn().mockResolvedValue('granted'),
			requestPermission,
		} as unknown as FileSystemDirectoryHandle

		await expect(ensureReadWritePermission(handle)).resolves.toBeUndefined()
		expect(requestPermission).not.toHaveBeenCalled()
	})

	it('requests readwrite permission when the initial query is not granted', async () => {
		const requestPermission = vi.fn().mockResolvedValue('granted')
		const handle = {
			queryPermission: vi.fn().mockResolvedValue('prompt'),
			requestPermission,
		} as unknown as FileSystemDirectoryHandle

		await expect(ensureReadWritePermission(handle)).resolves.toBeUndefined()
		expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
	})

	it('uses the shared write-permission denied hint when the browser rejects readwrite access', async () => {
		const handle = {
			queryPermission: vi.fn().mockResolvedValue('prompt'),
			requestPermission: vi.fn().mockResolvedValue('denied'),
		} as unknown as FileSystemDirectoryHandle

		await expect(ensureReadWritePermission(handle)).rejects.toThrow(
			localFolderWritePermissionDeniedHint(),
		)
	})
})

describe('collectFilesFromDirectoryHandle', () => {
	it('counts files, not remaining directory entries, against the limit', async () => {
		const emptyDirectory = {
			kind: 'directory',
			async *entries() {},
		} as unknown as FileSystemDirectoryHandle
		const handle = {
			async *entries() {
				yield ['only.txt', {
					kind: 'file',
					getFile: vi.fn().mockResolvedValue(new File(['only'], 'only.txt')),
				}]
			yield ['empty', emptyDirectory]
			},
		} as unknown as FileSystemDirectoryHandle

		await expect(collectFilesFromDirectoryHandle(handle, '', { maxFiles: 1 })).resolves.toHaveLength(1)

		const twoFiles = {
			async *entries() {
				yield ['first.txt', {
					kind: 'file',
					getFile: vi.fn().mockResolvedValue(new File(['first'], 'first.txt')),
				}]
				yield ['second.txt', {
					kind: 'file',
					getFile: vi.fn().mockResolvedValue(new File(['second'], 'second.txt')),
				}]
			},
		} as unknown as FileSystemDirectoryHandle
		await expect(collectFilesFromDirectoryHandle(twoFiles, '', { maxFiles: 1 })).rejects.toThrow(
			'Selected folder exceeds the 1 file safety limit.',
		)
	})

	it('stops before reading the next entry when the caller aborts', async () => {
		let resolveFirstFile!: (file: File) => void
		const firstGetFile = vi.fn(
			() =>
				new Promise<File>((resolve) => {
					resolveFirstFile = resolve
				}),
		)
		const nextGetFile = vi.fn().mockResolvedValue(new File(['next'], 'next.txt'))
		const handle = {
			async *entries() {
				yield ['first.txt', { kind: 'file', getFile: firstGetFile }]
				yield ['next.txt', { kind: 'file', getFile: nextGetFile }]
			},
		} as unknown as FileSystemDirectoryHandle
		const controller = new AbortController()

		const pending = collectFilesFromDirectoryHandle(handle, '', { signal: controller.signal })
		await vi.waitFor(() => expect(firstGetFile).toHaveBeenCalledTimes(1))
		controller.abort()
		resolveFirstFile(new File(['first'], 'first.txt'))

		await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
		expect(nextGetFile).not.toHaveBeenCalled()
	})
})
