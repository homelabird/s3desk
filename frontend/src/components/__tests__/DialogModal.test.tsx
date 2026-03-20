import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'

import { DialogModal } from '../DialogModal'

afterEach(() => {
	document.body.style.overflow = ''
})

describe('DialogModal', () => {
	it('keeps focus inside the dialog and restores focus to the opener when it closes', async () => {
		function Example() {
			const [open, setOpen] = useState(false)
			return (
				<>
					<button type="button" onClick={() => setOpen(true)}>
						Open dialog
					</button>
					<DialogModal open={open} onClose={() => setOpen(false)} title="Preferences">
						<button type="button">Secondary action</button>
					</DialogModal>
				</>
			)
		}

		render(<Example />)

		const opener = screen.getByRole('button', { name: 'Open dialog' })
		opener.focus()
		fireEvent.click(opener)

		const closeButton = await screen.findByRole('button', { name: 'Close' })
		expect(closeButton).toHaveFocus()

		const secondaryAction = screen.getByRole('button', { name: 'Secondary action' })

		secondaryAction.focus()
		fireEvent.keyDown(document, { key: 'Tab', bubbles: true, cancelable: true })
		expect(closeButton).toHaveFocus()

		closeButton.focus()
		fireEvent.keyDown(document, { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
		expect(secondaryAction).toHaveFocus()

		fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })

		await waitFor(() => {
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
		})
		await waitFor(() => {
			expect(opener).toHaveFocus()
		})
	})
})
