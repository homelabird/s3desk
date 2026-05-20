import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ObjectsMenuPopover } from '../ObjectsMenuPopover'

describe('ObjectsMenuPopover', () => {
	it('hides an uncontrolled popover when the scope changes', () => {
		const { rerender } = render(
			<ObjectsMenuPopover
				scopeKey="token-a:profile-1"
				menu={{
					items: [
						{
							key: 'refresh',
							label: 'Refresh',
						},
					],
				}}
			>
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</ObjectsMenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))
		expect(screen.getByText('Refresh')).toBeInTheDocument()

		rerender(
			<ObjectsMenuPopover
				scopeKey="token-b:profile-1"
				menu={{
					items: [
						{
							key: 'refresh',
							label: 'Refresh',
						},
					],
				}}
			>
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</ObjectsMenuPopover>,
		)

		expect(screen.queryByText('Refresh')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false')
	})

	it('supports Arrow, Home, and End keyboard focus movement', async () => {
		render(
			<ObjectsMenuPopover
				scopeKey="token-a:profile-1"
				menu={{
					items: [
						{ key: 'details', label: 'Details' },
						{ key: 'disabled', label: 'Disabled action', disabled: true },
						{ key: 'rename', label: 'Rename' },
						{ key: 'delete', label: 'Delete' },
					],
				}}
			>
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</ObjectsMenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))

		const details = await screen.findByRole('menuitem', { name: 'Details' })
		const rename = screen.getByRole('menuitem', { name: 'Rename' })
		const deleteItem = screen.getByRole('menuitem', { name: 'Delete' })
		await waitFor(() => expect(details).toHaveFocus())

		fireEvent.keyDown(details, { key: 'ArrowDown', bubbles: true })
		expect(rename).toHaveFocus()

		fireEvent.keyDown(rename, { key: 'End', bubbles: true })
		expect(deleteItem).toHaveFocus()

		fireEvent.keyDown(deleteItem, { key: 'ArrowDown', bubbles: true })
		expect(details).toHaveFocus()

		fireEvent.keyDown(details, { key: 'ArrowUp', bubbles: true })
		expect(deleteItem).toHaveFocus()

		fireEvent.keyDown(deleteItem, { key: 'Home', bubbles: true })
		expect(details).toHaveFocus()
	})

	it('exposes nested submenu semantics', async () => {
		render(
			<ObjectsMenuPopover
				scopeKey="token-a:profile-1"
				menu={{
					items: [
						{
							key: 'more-actions',
							label: 'More actions',
							children: [
								{ key: 'copy', label: 'Copy path' },
								{ key: 'download', label: 'Download' },
							],
						},
					],
				}}
			>
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</ObjectsMenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))

		const submenuTrigger = await screen.findByRole('menuitem', { name: /More actions/i })
		expect(submenuTrigger).toHaveAttribute('aria-haspopup', 'menu')
		expect(submenuTrigger).toHaveAttribute('aria-expanded', 'false')
		expect(screen.getAllByRole('menu')).toHaveLength(1)

		fireEvent.click(submenuTrigger)

		expect(submenuTrigger).toHaveAttribute('aria-expanded', 'true')
		expect(screen.getAllByRole('menu')).toHaveLength(2)
		expect(await screen.findByRole('menuitem', { name: 'Copy path' })).toBeInTheDocument()
	})
})
