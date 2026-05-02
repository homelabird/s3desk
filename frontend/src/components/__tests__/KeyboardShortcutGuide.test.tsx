import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { goToBucketsLabel } from '../../lib/actionHints'
import { KeyboardShortcutGuide } from '../KeyboardShortcutGuide'

describe('KeyboardShortcutGuide', () => {
	it('renders nothing when closed', () => {
		render(<KeyboardShortcutGuide open={false} onClose={vi.fn()} />)
		expect(screen.queryByTestId('keyboard-shortcut-guide')).not.toBeInTheDocument()
	})

	it('renders the guide when open', () => {
		render(<KeyboardShortcutGuide open={true} onClose={vi.fn()} />)
		expect(screen.getByTestId('keyboard-shortcut-guide')).toBeInTheDocument()
		expect(screen.getByRole('dialog')).toBeInTheDocument()
	})

	it('shows navigation shortcuts', () => {
		render(<KeyboardShortcutGuide open={true} onClose={vi.fn()} />)
		expect(screen.getByText('Go to Profiles')).toBeInTheDocument()
		expect(screen.getByText(goToBucketsLabel())).toBeInTheDocument()
		expect(screen.getByText('Go to Objects')).toBeInTheDocument()
		expect(screen.getByText('Go to Uploads')).toBeInTheDocument()
		expect(screen.getByText('Go to Jobs')).toBeInTheDocument()
	})

	it('calls onClose when close button is clicked', () => {
		const onClose = vi.fn()
		render(<KeyboardShortcutGuide open={true} onClose={onClose} />)
		fireEvent.click(screen.getByLabelText('Close'))
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it('focuses the close button when it opens', () => {
		render(<KeyboardShortcutGuide open={true} onClose={vi.fn()} />)
		expect(screen.getByLabelText('Close')).toHaveFocus()
	})

	it('calls onClose on Escape key', () => {
		const onClose = vi.fn()
		render(<KeyboardShortcutGuide open={true} onClose={onClose} />)
		fireEvent.keyDown(document, { key: 'Escape' })
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it('dialog has aria-modal attribute', () => {
		render(<KeyboardShortcutGuide open={true} onClose={vi.fn()} />)
		expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
	})

	it('uses a semantic heading for the title', () => {
		render(<KeyboardShortcutGuide open={true} onClose={vi.fn()} />)
		expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Keyboard shortcuts')
	})

	it('keeps the guide content and close action accessible when open', () => {
		render(<KeyboardShortcutGuide open={true} onClose={vi.fn()} />)
		expect(screen.getByRole('dialog')).toContainElement(screen.getByLabelText('Close'))
		expect(screen.getByText('Go to Jobs')).toBeInTheDocument()
	})

	it('closes on backdrop click but not when the dialog panel itself is clicked', () => {
		const onClose = vi.fn()
		render(<KeyboardShortcutGuide open={true} onClose={onClose} />)

		fireEvent.click(screen.getByRole('dialog'))
		expect(onClose).not.toHaveBeenCalled()

		fireEvent.click(screen.getByTestId('keyboard-shortcut-guide'))
		expect(onClose).toHaveBeenCalledTimes(1)
	})
})
