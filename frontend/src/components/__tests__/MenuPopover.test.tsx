import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MenuProps } from 'antd'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'

import { DialogModal } from '../DialogModal'
import { MenuPopover } from '../MenuPopover'

afterEach(() => {
	document.body.style.overflow = ''
})

describe('MenuPopover', () => {
	it('focuses the first menu item, restores focus to the trigger, and leaves the parent dialog open on the first Escape', async () => {
		function Example() {
			const [dialogOpen, setDialogOpen] = useState(true)
			const [menuOpen, setMenuOpen] = useState(false)

			const menu: MenuProps = {
				items: [
					{ key: 'rename', label: 'Rename' },
					{ key: 'delete', label: 'Delete' },
				],
			}

			return (
				<DialogModal open={dialogOpen} onClose={() => setDialogOpen(false)} title="Actions">
					<MenuPopover menu={menu} open={menuOpen} onOpenChange={(next) => setMenuOpen(next)} align="end">
						{({ toggle }) => (
							<button type="button" onClick={toggle}>
								More
							</button>
						)}
					</MenuPopover>
				</DialogModal>
			)
		}

		render(<Example />)

		const trigger = screen.getByRole('button', { name: 'More' })
		trigger.focus()
		fireEvent.click(trigger)

		const firstMenuItem = await screen.findByRole('menuitem', { name: 'Rename' })
		await waitFor(() => {
			expect(firstMenuItem).toHaveFocus()
		})

		fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })

		await waitFor(() => {
			expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument()
		})
		expect(screen.getByText('Actions')).toBeInTheDocument()
		await waitFor(() => {
			expect(trigger).toHaveFocus()
		})

		fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })

		await waitFor(() => {
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
		})
	})
})
