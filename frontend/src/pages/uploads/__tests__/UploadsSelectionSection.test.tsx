import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { addFilesOrFolderFirstSentenceHint, offlineUploadsDisabledHint } from '../../../lib/actionHints'
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
	it('keeps the empty selection focused on the picker action when uploads are allowed', () => {
		const onOpenPicker = vi.fn()

		render(
			<UploadsSelectionSection
				onOpenPicker={onOpenPicker}
				isOffline={false}
				uploadsSupported
				canOpenPicker
				queueDisabledReason={addFilesOrFolderFirstSentenceHint()}
				selectedFiles={[]}
				destinationLabel="s3://primary-bucket/"
				selectionKind="empty"
			/>,
		)

		expect(screen.queryByText('0 item(s)')).not.toBeInTheDocument()
		expect(screen.queryByText('0 B')).not.toBeInTheDocument()
		expect(screen.queryByText('Not selected')).not.toBeInTheDocument()
		expect(screen.getByText(addFilesOrFolderFirstSentenceHint())).toBeInTheDocument()
		expect(screen.getByText('No files or folders selected.')).toBeInTheDocument()
		expect(screen.getByText('Choose files or a folder to preview what will be uploaded.')).toBeInTheDocument()
		expect(screen.queryByRole('status')).not.toBeInTheDocument()

		const addButton = screen.getByRole('button', { name: /Add from device/i })
		expect(addButton.className).toContain('ant-btn-primary')
		fireEvent.click(addButton)
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
				canOpenPicker
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
		expect(screen.getByRole('status')).toHaveTextContent('7 item(s)')
		expect(screen.getByRole('status')).toHaveTextContent('7.00 KB')
		expect(screen.getByRole('status')).toHaveTextContent('s3://primary-bucket/photos')
		expect(screen.getByRole('status')).toHaveTextContent('Folder')
		expect(screen.getByRole('button', { name: /Add from device/i }).className).not.toContain('ant-btn-primary')
	})

	it('disables the picker when uploads are unavailable', () => {
		render(
			<UploadsSelectionSection
				onOpenPicker={vi.fn()}
				isOffline
				uploadsSupported={false}
				canOpenPicker={false}
				queueDisabledReason={offlineUploadsDisabledHint()}
				selectedFiles={[createFile('offline.txt', 512)]}
				destinationLabel="s3://primary-bucket/"
				selectionKind="files"
			/>,
		)

		expect(screen.getByRole('button', { name: /Add from device/i })).toBeDisabled()
		expect(screen.getByText(offlineUploadsDisabledHint())).toBeInTheDocument()
		expect(screen.getByText('Files')).toBeInTheDocument()
	})
})
