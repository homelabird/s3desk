import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ObjectsCommandPaletteModal, type ObjectsCommandPaletteModalProps } from '../ObjectsCommandPaletteModal'

vi.mock('../../../components/DialogModal', () => ({
	DialogModal: ({
		children,
		footer,
		open,
		title,
	}: {
		children: ReactNode
		footer: ReactNode
		open: boolean
		title: string
	}) => (open ? (
		<div role="dialog" aria-label={title}>
			{children}
			{footer}
		</div>
	) : null),
}))

function buildProps(overrides: Partial<ObjectsCommandPaletteModalProps> = {}): ObjectsCommandPaletteModalProps {
	return {
		open: true,
		query: '',
		commands: [
			{ id: 'rename', label: 'Rename', enabled: true, icon: null, run: vi.fn() },
			{ id: 'delete', label: 'Delete', enabled: false, icon: null, run: vi.fn() },
		],
		activeIndex: 0,
		onQueryChange: vi.fn(),
		onActiveIndexChange: vi.fn(),
		onRunCommand: vi.fn(),
		onCancel: vi.fn(),
		onKeyDown: vi.fn(),
		...overrides,
	}
}

describe('ObjectsCommandPaletteModal', () => {
	it('exposes combobox and listbox option relationships for the active command', () => {
		render(<ObjectsCommandPaletteModal {...buildProps({ activeIndex: 1 })} />)

		const input = screen.getByRole('combobox', { name: 'Command search' })
		const listbox = screen.getByRole('listbox', { name: 'Available commands' })
		const options = screen.getAllByRole('option')

		expect(input).toHaveAttribute('aria-controls', listbox.id)
		expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
		expect(options[0]).toHaveAttribute('aria-selected', 'false')
		expect(options[1]).toHaveAttribute('aria-selected', 'true')
		expect(options[1]).toHaveAttribute('aria-disabled', 'true')
	})

	it('does not run disabled commands from pointer activation', () => {
		const onRunCommand = vi.fn()
		render(<ObjectsCommandPaletteModal {...buildProps({ onRunCommand })} />)

		fireEvent.click(screen.getByRole('option', { name: 'Delete' }))

		expect(onRunCommand).not.toHaveBeenCalled()
	})
})
