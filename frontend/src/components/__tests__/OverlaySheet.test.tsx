import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'

import { DialogModal } from '../DialogModal'
import { OverlaySheet } from '../OverlaySheet'

afterEach(() => {
	document.body.style.overflow = ''
})

describe('OverlaySheet', () => {
	it('keeps body scroll locked until the last modal closes and only the top layer handles Escape', async () => {
		function Example() {
			const [sheetOpen, setSheetOpen] = useState(true)
			const [dialogOpen, setDialogOpen] = useState(true)

			return (
				<>
					<OverlaySheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filters" placement="right">
						<button type="button">Sheet action</button>
					</OverlaySheet>
					<DialogModal open={dialogOpen} onClose={() => setDialogOpen(false)} title="Confirm changes">
						<button type="button">Dialog action</button>
					</DialogModal>
				</>
			)
		}

		document.body.style.overflow = 'scroll'
		render(<Example />)

		expect(document.body.style.overflow).toBe('hidden')

		fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })

		await waitFor(() => {
			expect(screen.queryByText('Confirm changes')).not.toBeInTheDocument()
		})
		expect(screen.getByText('Filters')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
		expect(document.body.style.overflow).toBe('hidden')

		fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })

		await waitFor(() => {
			expect(screen.queryByText('Filters')).not.toBeInTheDocument()
		})
		await waitFor(() => {
			expect(document.body.style.overflow).toBe('scroll')
		})
	})

	it('passes the side-placement width prop through the public sheet API', () => {
		const width = 420
		render(
			<OverlaySheet
				open
				onClose={() => {}}
				title="Filters"
				placement="right"
				width={width}
				dataTestId="filters-sheet"
				extra={<button type="button">Reset</button>}
				footer={<button type="button">Apply</button>}
				bodyClassName="custom-body"
				panelClassName="custom-panel"
			>
				<p>Sheet body</p>
			</OverlaySheet>,
		)

		const sheet = screen.getByTestId('filters-sheet')
		expect(sheet).toHaveAttribute('role', 'dialog')
		expect(sheet).toHaveClass('custom-panel')
		expect(sheet.style.width).toBe(`${width}px`)
		expect(within(sheet).getByText('Filters')).toBeInTheDocument()
		expect(within(sheet).getByRole('button', { name: 'Reset' })).toBeInTheDocument()
		expect(within(sheet).getByRole('button', { name: 'Apply' })).toBeInTheDocument()
		expect(within(sheet).getByText('Sheet body')).toBeInTheDocument()

		const body = sheet.querySelector('.custom-body')
		expect(body).not.toBeNull()
		expect(body).toHaveTextContent('Sheet body')
	})

	it('passes the bottom-placement height prop through the public sheet API', () => {
		const height = '70dvh'
		render(
			<OverlaySheet open onClose={() => {}} title="Queue" placement="bottom" height={height} dataTestId="queue-sheet">
				<p>Bottom sheet</p>
			</OverlaySheet>,
		)

		const sheet = screen.getByTestId('queue-sheet')
		expect(sheet.style.height).toBe(height)
		expect(within(sheet).getByText('Queue')).toBeInTheDocument()
		expect(within(sheet).getByText('Bottom sheet')).toBeInTheDocument()
	})
})
