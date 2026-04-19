import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { UploadsSelectionSection } from '../UploadsSelectionSection'

beforeAll(() => {
	ensureDomShims()
})

function createFile(name: string, size: number, relativePath?: string) {
	const file = new File(['x'.repeat(Math.max(1, Math.min(size, 8)))], name, { type: 'text/plain' })
	Object.defineProperty(file, 'size', {
		value: size,
		configurable: true,
	})
	if (relativePath) {
		Object.defineProperty(file, 'webkitRelativePath', {
			value: relativePath,
			configurable: true,
		})
	}
	return file
}

describe('UploadsSelectionSection', () => {
	it('renders the empty-state summary and enables picker actions when uploads are allowed', () => {
		const onOpenPicker = vi.fn()

		render(
			<UploadsSelectionSection
				onOpenPicker={onOpenPicker}
				isOffline={false}
				uploadsSupported
				queueDisabledReason="Select a bucket first."
				selectedFiles={[]}
				destinationLabel="s3://primary-bucket/"
				selectionKind="empty"
			/>,
		)

		expect(screen.getByText('0 item(s)')).toBeInTheDocument()
		expect(screen.getByText('0 B')).toBeInTheDocument()
		expect(screen.getByText('s3://primary-bucket/')).toBeInTheDocument()
		expect(screen.getByText('Not selected')).toBeInTheDocument()
		expect(screen.getByText('Select a bucket first.')).toBeInTheDocument()
		expect(screen.getByText('No files or folders selected.')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: /Add from device/i }))
		expect(onOpenPicker).toHaveBeenCalledTimes(1)
	})

	it('renders preview items, total size, and remaining count for larger folder selections', () => {
		const selectedFiles = [
			createFile('a.txt', 1024, 'photos/a.txt'),
			createFile('b.txt', 1024, 'photos/b.txt'),
			createFile('c.txt', 1024, 'photos/c.txt'),
			createFile('d.txt', 1024, 'photos/d.txt'),
			createFile('e.txt', 1024, 'photos/e.txt'),
			createFile('f.txt', 1024, 'photos/f.txt'),
			createFile('g.txt', 1024, 'photos/g.txt'),
		]

		render(
			<UploadsSelectionSection
				onOpenPicker={vi.fn()}
				isOffline={false}
				uploadsSupported
				queueDisabledReason={null}
				selectedFiles={selectedFiles}
				destinationLabel="s3://primary-bucket/photos"
				selectionKind="folder"
			/>,
		)

		expect(screen.getByText('7 item(s)')).toBeInTheDocument()
		expect(screen.getByText('7.00 KB')).toBeInTheDocument()
		expect(screen.getByText('Folder')).toBeInTheDocument()
		expect(screen.getByText('Ready to queue this selection.')).toBeInTheDocument()
		expect(screen.getByText('photos/a.txt')).toBeInTheDocument()
		expect(screen.getByText('photos/f.txt')).toBeInTheDocument()
		expect(screen.queryByText('photos/g.txt')).not.toBeInTheDocument()
		expect(screen.getByText('+ 1 more item(s) selected')).toBeInTheDocument()
	})

	it('disables the picker when uploads are unavailable', () => {
		render(
			<UploadsSelectionSection
				onOpenPicker={vi.fn()}
				isOffline
				uploadsSupported={false}
				queueDisabledReason="Offline: uploads are disabled."
				selectedFiles={[createFile('offline.txt', 512)]}
				destinationLabel="s3://primary-bucket/"
				selectionKind="files"
			/>,
		)

		expect(screen.getByRole('button', { name: /Add from device/i })).toBeDisabled()
		expect(screen.getByText('Offline: uploads are disabled.')).toBeInTheDocument()
		expect(screen.getByText('Files')).toBeInTheDocument()
	})
})
