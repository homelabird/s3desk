import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MenuProps } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'

import { DialogModal } from '../DialogModal'
import { MenuPopover } from '../MenuPopover'

afterEach(() => {
	document.body.style.overflow = ''
})

describe('MenuPopover', () => {
	it('hides an uncontrolled popover when the scope changes', () => {
		const menu: MenuProps = {
			items: [{ key: 'refresh', label: 'Refresh' }],
		}
		const { rerender } = render(
			<MenuPopover menu={menu} scopeKey="token-a">
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</MenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))
		expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument()

		rerender(
			<MenuPopover menu={menu} scopeKey="token-b">
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</MenuPopover>,
		)

		expect(screen.queryByRole('menuitem', { name: 'Refresh' })).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false')
	})

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

	it('invokes item and menu click handlers and reports menu close source when selecting an item', async () => {
		const itemOnClick = vi.fn()
		const menuOnClick = vi.fn()
		const onOpenChange = vi.fn()
		const menu: MenuProps = {
			items: [{ key: 'refresh', label: 'Refresh', onClick: itemOnClick }],
			onClick: menuOnClick,
		}

		render(
			<MenuPopover menu={menu} scopeKey="token-a" onOpenChange={onOpenChange}>
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</MenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))

		const item = await screen.findByRole('menuitem', { name: 'Refresh' })
		fireEvent.click(item)

		expect(itemOnClick).toHaveBeenCalledTimes(1)
		expect(itemOnClick.mock.calls[0]?.[0]).toMatchObject({ key: 'refresh', keyPath: ['refresh'] })
		expect(menuOnClick).toHaveBeenCalledTimes(1)
		expect(menuOnClick.mock.calls[0]?.[0]).toMatchObject({ key: 'refresh', keyPath: ['refresh'] })

		await waitFor(() => {
			expect(screen.queryByRole('menuitem', { name: 'Refresh' })).not.toBeInTheDocument()
		})
		expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false')
		expect(onOpenChange.mock.calls).toEqual([
			[true, { source: 'trigger' }],
			[false, { source: 'menu' }],
		])
	})

	it('keeps disabled items inert and leaves the popover open', async () => {
		const itemOnClick = vi.fn()
		const menuOnClick = vi.fn()
		const onOpenChange = vi.fn()
		const menu: MenuProps = {
			items: [{ key: 'delete', label: 'Delete', disabled: true, onClick: itemOnClick }],
			onClick: menuOnClick,
		}

		render(
			<MenuPopover menu={menu} scopeKey="token-a" onOpenChange={onOpenChange}>
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</MenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))

		const item = await screen.findByRole('menuitem', { name: 'Delete' })
		expect(item).toBeDisabled()
		fireEvent.click(item)

		expect(itemOnClick).not.toHaveBeenCalled()
		expect(menuOnClick).not.toHaveBeenCalled()
		expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true')
		expect(onOpenChange.mock.calls).toEqual([[true, { source: 'trigger' }]])
	})

	it('closes on Tab from an open menu and restores focus to the trigger', async () => {
		const onOpenChange = vi.fn()
		const menu: MenuProps = {
			items: [
				{ key: 'refresh', label: 'Refresh' },
				{ key: 'download', label: 'Download' },
			],
		}

		render(
			<MenuPopover menu={menu} scopeKey="token-a" onOpenChange={onOpenChange}>
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</MenuPopover>,
		)

		const trigger = screen.getByRole('button', { name: 'More' })
		trigger.focus()
		fireEvent.click(trigger)

		const item = await screen.findByRole('menuitem', { name: 'Refresh' })
		await waitFor(() => expect(item).toHaveFocus())

		fireEvent.keyDown(item, { key: 'Tab', bubbles: true, cancelable: true })

		await waitFor(() => {
			expect(screen.queryByRole('menuitem', { name: 'Refresh' })).not.toBeInTheDocument()
		})
		await waitFor(() => {
			expect(trigger).toHaveFocus()
		})
		expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false')
		expect(onOpenChange.mock.calls).toEqual([
			[true, { source: 'trigger' }],
			[false, { source: 'outside' }],
		])
	})

	it('moves focus through enabled menu items with Arrow, Home, and End keys', async () => {
		const menu: MenuProps = {
			items: [
				{ key: 'rename', label: 'Rename' },
				{ key: 'delete', label: 'Delete', disabled: true },
				{ key: 'download', label: 'Download' },
				{ key: 'details', label: 'Details' },
			],
		}

		render(
			<MenuPopover menu={menu} scopeKey="token-a">
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</MenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))

		const rename = await screen.findByRole('menuitem', { name: 'Rename' })
		const download = screen.getByRole('menuitem', { name: 'Download' })
		const details = screen.getByRole('menuitem', { name: 'Details' })
		await waitFor(() => expect(rename).toHaveFocus())

		fireEvent.keyDown(rename, { key: 'ArrowDown', bubbles: true })
		expect(download).toHaveFocus()

		fireEvent.keyDown(download, { key: 'End', bubbles: true })
		expect(details).toHaveFocus()

		fireEvent.keyDown(details, { key: 'ArrowDown', bubbles: true })
		expect(rename).toHaveFocus()

		fireEvent.keyDown(rename, { key: 'ArrowUp', bubbles: true })
		expect(details).toHaveFocus()

		fireEvent.keyDown(details, { key: 'Home', bubbles: true })
		expect(rename).toHaveFocus()
	})

	it('moves focus with menu typeahead text', async () => {
		const menu: MenuProps = {
			items: [
				{ key: 'alpha', label: 'Alpha' },
				{ key: 'delta', label: 'Delta' },
				{ key: 'demo', label: 'Demo' },
				{ key: 'details', label: 'Details' },
			],
		}

		render(
			<MenuPopover menu={menu} scopeKey="token-a">
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</MenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))

		const alpha = await screen.findByRole('menuitem', { name: 'Alpha' })
		const delta = screen.getByRole('menuitem', { name: 'Delta' })
		const demo = screen.getByRole('menuitem', { name: 'Demo' })
		await waitFor(() => expect(alpha).toHaveFocus())

		fireEvent.keyDown(alpha, { key: 'd', bubbles: true })
		expect(delta).toHaveFocus()

		fireEvent.keyDown(delta, { key: 'e', bubbles: true })
		expect(demo).toHaveFocus()
	})

	it('toggles nested submenu visibility from the parent menu item', async () => {
		const menu: MenuProps = {
			items: [
				{
					key: 'more-actions',
					label: 'More actions',
					children: [
						{ key: 'archive', label: 'Archive' },
						{ key: 'delete', label: 'Delete' },
					],
				},
			],
		}

		render(
			<MenuPopover menu={menu} scopeKey="token-a">
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</MenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))

		const submenuTrigger = await screen.findByRole('menuitem', { name: /More actions/i })
		expect(submenuTrigger).toHaveAttribute('aria-expanded', 'false')
		expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument()

		fireEvent.click(submenuTrigger)
		expect(submenuTrigger).toHaveAttribute('aria-expanded', 'true')
		expect(await screen.findByRole('menuitem', { name: 'Archive' })).toBeInTheDocument()
		expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()

		fireEvent.click(submenuTrigger)
		await waitFor(() => {
			expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument()
		})
		expect(submenuTrigger).toHaveAttribute('aria-expanded', 'false')
	})

	it('invokes nested child menu items and closes the popover with menu source', async () => {
		const childOnClick = vi.fn()
		const menuOnClick = vi.fn()
		const onOpenChange = vi.fn()
		const menu: MenuProps = {
			items: [
				{
					key: 'more-actions',
					label: 'More actions',
					children: [{ key: 'delete', label: 'Delete', danger: true, onClick: childOnClick }],
				},
			],
			onClick: menuOnClick,
		}

		render(
			<MenuPopover menu={menu} scopeKey="token-a" onOpenChange={onOpenChange}>
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</MenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))

		const submenuTrigger = await screen.findByRole('menuitem', { name: /More actions/i })
		fireEvent.click(submenuTrigger)

		const childItem = await screen.findByRole('menuitem', { name: 'Delete' })
		fireEvent.click(childItem)

		expect(childOnClick).toHaveBeenCalledTimes(1)
		expect(childOnClick.mock.calls[0]?.[0]).toMatchObject({ key: 'delete', keyPath: ['delete'] })
		expect(menuOnClick).toHaveBeenCalledTimes(1)
		expect(menuOnClick.mock.calls[0]?.[0]).toMatchObject({ key: 'delete', keyPath: ['delete'] })

		await waitFor(() => {
			expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
		})
		expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false')
		expect(onOpenChange.mock.calls).toEqual([
			[true, { source: 'trigger' }],
			[false, { source: 'menu' }],
		])
	})
})
