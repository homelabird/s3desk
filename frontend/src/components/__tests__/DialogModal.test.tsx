import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

	it('restores focus to the correct opener as stacked dialogs close one layer at a time', async () => {
		function Example() {
			const [outerOpen, setOuterOpen] = useState(false)
			const [innerOpen, setInnerOpen] = useState(false)
			return (
				<>
					<button type="button" onClick={() => setOuterOpen(true)}>
						Open outer
					</button>
					<DialogModal open={outerOpen} onClose={() => setOuterOpen(false)} title="Outer dialog">
						<button type="button" onClick={() => setInnerOpen(true)}>
							Open inner
						</button>
						<button type="button">Outer action</button>
						<DialogModal open={innerOpen} onClose={() => setInnerOpen(false)} title="Inner dialog">
							<button type="button">Inner action</button>
						</DialogModal>
					</DialogModal>
				</>
			)
		}

		document.body.style.overflow = 'scroll'
		render(<Example />)

		const outerOpener = screen.getByRole('button', { name: 'Open outer' })
		outerOpener.focus()
		fireEvent.click(outerOpener)

		const innerOpener = await screen.findByRole('button', { name: 'Open inner' })
		innerOpener.focus()
		fireEvent.click(innerOpener)

		const innerDialog = await screen.findByText('Inner dialog')
		const innerDialogRoot = innerDialog.closest('[role="dialog"]')
		expect(innerDialogRoot).not.toBeNull()
		const innerCloseButton = within(innerDialogRoot as HTMLElement).getByRole('button', { name: 'Close' })
		await waitFor(() => {
			expect(innerCloseButton).toHaveFocus()
		})

		fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })

		await waitFor(() => {
			expect(screen.queryByText('Inner dialog')).not.toBeInTheDocument()
		})
		expect(screen.getByText('Outer dialog')).toBeInTheDocument()
		await waitFor(() => {
			expect(innerOpener).toHaveFocus()
		})
		expect(document.body.style.overflow).toBe('hidden')

		fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })

		await waitFor(() => {
			expect(screen.queryByText('Outer dialog')).not.toBeInTheDocument()
		})
		await waitFor(() => {
			expect(outerOpener).toHaveFocus()
		})
		await waitFor(() => {
			expect(document.body.style.overflow).toBe('scroll')
		})
	})

	it('closes on backdrop pointer down but ignores pointer down inside the panel', async () => {
		function Example() {
			const [open, setOpen] = useState(true)
			return (
				<DialogModal open={open} onClose={() => setOpen(false)} title="Preferences">
					<button type="button">Inner action</button>
				</DialogModal>
			)
		}

		render(<Example />)

		const dialog = screen.getByRole('dialog')
		fireEvent.mouseDown(dialog)
		expect(screen.getByRole('dialog')).toBeInTheDocument()

		const backdrop = dialog.parentElement
		expect(backdrop).not.toBeNull()
		fireEvent.mouseDown(backdrop as HTMLElement)

		await waitFor(() => {
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
		})
	})

	it('passes the width prop through the dialog CSS variable alongside subtitle and footer content', () => {
		const width = 560
		render(
			<DialogModal
				open
				onClose={() => {}}
				title="Preferences"
				subtitle="Manage upload defaults"
				footer={<button type="button">Save changes</button>}
				width={width}
				dataTestId="preferences-dialog"
			>
				<p>Dialog body</p>
			</DialogModal>,
		)

		const dialog = screen.getByTestId('preferences-dialog')
		expect(dialog).toHaveAttribute('role', 'dialog')
		expect(dialog.style.getPropertyValue('--dialog-width')).toBe(`${width}px`)
		expect(within(dialog).getByText('Preferences')).toBeInTheDocument()
		expect(within(dialog).getByText('Manage upload defaults')).toBeInTheDocument()
		expect(within(dialog).getByText('Dialog body')).toBeInTheDocument()
		expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
	})
})
