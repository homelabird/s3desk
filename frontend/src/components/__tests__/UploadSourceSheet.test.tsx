import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
	directorySelectionUnavailableHint,
	folderSelectionPreservesNestedPathsHint,
	folderSelectionUnavailableTitle,
	uploadFromDeviceTitle,
} from '../../lib/secureContext'

const { screensRef } = vi.hoisted(() => ({
	screensRef: { current: { md: true } as Record<string, boolean> },
}))

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		Grid: {
			useBreakpoint: () => screensRef.current,
		},
	}
})

vi.mock('../OverlaySheet', () => ({
	OverlaySheet: (props: {
		open: boolean
		onClose: () => void
		title: ReactNode
		placement: 'left' | 'right' | 'bottom'
		width?: number | string
		height?: number | string
		children: ReactNode
	}) =>
		props.open ? (
			<div
				data-testid="overlay-sheet"
				data-placement={props.placement}
				data-width={props.width == null ? '' : String(props.width)}
				data-height={props.height == null ? '' : String(props.height)}
			>
				<div>{props.title}</div>
				<button type="button" onClick={props.onClose}>
					Mock close
				</button>
				{props.children}
			</div>
		) : null,
}))

import { UploadSourceSheet } from '../UploadSourceSheet'

afterEach(() => {
	screensRef.current = { md: true }
})

describe('UploadSourceSheet', () => {
	it('uses the desktop sheet placement and enables both actions when folder selection is supported', () => {
		const onClose = vi.fn()
		const onSelectFiles = vi.fn()
		const onSelectFolder = vi.fn()

		render(
			<UploadSourceSheet
				open
				title="Add upload source"
				destinationLabel="s3://primary-bucket/photos"
				folderSelectionSupported
				busy={false}
				onClose={onClose}
				onSelectFiles={onSelectFiles}
				onSelectFolder={onSelectFolder}
			/>,
		)

		expect(screen.getByTestId('overlay-sheet')).toHaveAttribute('data-placement', 'right')
		expect(screen.getByTestId('overlay-sheet')).toHaveAttribute('data-width', '420')
		expect(screen.getByTestId('overlay-sheet')).toHaveAttribute('data-height', '')
		expect(screen.getByText('Add upload source')).toBeInTheDocument()
		expect(screen.getByText('s3://primary-bucket/photos')).toBeInTheDocument()
		expect(screen.getByText(folderSelectionPreservesNestedPathsHint())).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: /Choose files/i }))
		fireEvent.click(screen.getByRole('button', { name: /Choose folder/i }))
		fireEvent.click(screen.getByRole('button', { name: 'Mock close' }))

		expect(onSelectFiles).toHaveBeenCalledTimes(1)
		expect(onSelectFolder).toHaveBeenCalledTimes(1)
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it('uses the mobile sheet placement and shows the folder support warning when unsupported', () => {
		screensRef.current = { md: false }

		render(
			<UploadSourceSheet
				open
				folderSelectionSupported={false}
				folderSelectionReason="This browser disables directory handles."
				onClose={vi.fn()}
				onSelectFiles={vi.fn()}
				onSelectFolder={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('overlay-sheet')).toHaveAttribute('data-placement', 'bottom')
		expect(screen.getByTestId('overlay-sheet')).toHaveAttribute('data-width', '')
		expect(screen.getByTestId('overlay-sheet')).toHaveAttribute('data-height', 'auto')
		expect(screen.getByText(uploadFromDeviceTitle())).toBeInTheDocument()
		expect(screen.getByText(folderSelectionUnavailableTitle())).toBeInTheDocument()
		expect(screen.getByText('This browser disables directory handles.')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Choose folder/i })).toBeDisabled()
	})

	it('uses the shared directory-selection fallback hint when no explicit reason is provided', () => {
		render(
			<UploadSourceSheet
				open
				folderSelectionSupported={false}
				onClose={vi.fn()}
				onSelectFiles={vi.fn()}
				onSelectFolder={vi.fn()}
			/>,
		)

		expect(screen.getByText(directorySelectionUnavailableHint())).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Choose folder/i })).toBeDisabled()
	})

	it('disables both actions while the sheet is busy', () => {
		const onSelectFiles = vi.fn()
		const onSelectFolder = vi.fn()

		render(
			<UploadSourceSheet
				open
				folderSelectionSupported
				busy
				onClose={vi.fn()}
				onSelectFiles={onSelectFiles}
				onSelectFolder={onSelectFolder}
			/>,
		)

		const chooseFiles = screen.getByRole('button', { name: /Choose files/i })
		const chooseFolder = screen.getByRole('button', { name: /Choose folder/i })
		expect(chooseFiles).toBeDisabled()
		expect(chooseFolder).toBeDisabled()

		fireEvent.click(chooseFiles)
		fireEvent.click(chooseFolder)

		expect(onSelectFiles).not.toHaveBeenCalled()
		expect(onSelectFolder).not.toHaveBeenCalled()
	})
})
