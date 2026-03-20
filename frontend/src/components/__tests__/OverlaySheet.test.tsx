import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
