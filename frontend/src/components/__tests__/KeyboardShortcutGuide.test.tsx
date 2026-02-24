import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
		expect(screen.getByText('Go to Buckets')).toBeInTheDocument()
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

	it('calls onClose on Escape key', () => {
		const onClose = vi.fn()
		render(<KeyboardShortcutGuide open={true} onClose={onClose} />)
		fireEvent.keyDown(document, { key: 'Escape' })
		expect(onClose).toHaveBeenCalledTimes(1)
	})
})
