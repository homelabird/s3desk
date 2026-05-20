import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HelpTooltip } from '../HelpTooltip'
import styles from '../HelpTooltip.module.css'

describe('HelpTooltip', () => {
	it('shows and hides tooltip content on hover', () => {
		render(<HelpTooltip text="Example help" />)
		expect(screen.queryByTestId('help-tooltip-content')).not.toBeInTheDocument()
		const host = screen.getByTestId('help-tooltip-trigger').parentElement!
		fireEvent.mouseEnter(host)
		expect(screen.getByTestId('help-tooltip-content')).toBeInTheDocument()
		expect(screen.getByTestId('help-tooltip-content')).toHaveTextContent('Example help')
		fireEvent.mouseLeave(host)
		expect(screen.queryByTestId('help-tooltip-content')).not.toBeInTheDocument()
	})

	it('shows and hides tooltip content on focus/blur', () => {
		render(<HelpTooltip text="Example help" />)
		const trigger = screen.getByRole('button', { name: 'Help' })
		fireEvent.focus(trigger)
		expect(screen.getByRole('tooltip')).toBeInTheDocument()
		fireEvent.blur(trigger)
		expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
	})

	it('opens from trigger focus even when custom host styling is present', () => {
		render(<HelpTooltip text="Styled help" style={{ marginLeft: 12, display: 'block' }} />)
		const trigger = screen.getByTestId('help-tooltip-trigger')
		const host = trigger.parentElement!
		expect(host).not.toBeNull()

		fireEvent.focus(trigger)
		expect(screen.getByRole('tooltip')).toHaveTextContent('Styled help')

		fireEvent.blur(trigger)
		expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
	})

	it('keeps an accessible trigger', () => {
		render(<HelpTooltip ariaLabel="Upload help" text="Example help" />)
		const trigger = screen.getByRole('button', { name: 'Upload help' })
		const glyph = screen.getByText('?')
		expect(trigger).toHaveTextContent('?')
		expect(trigger).toHaveAttribute('type', 'button')
		expect(trigger).toHaveClass(styles.trigger)
		expect(glyph).toHaveClass(styles.glyph)
	})

	it('links the focused trigger to the visible tooltip content', () => {
		render(<HelpTooltip ariaLabel="Download help" id="download-help-tooltip" text="Download help text" />)
		const trigger = screen.getByRole('button', { name: 'Download help' })

		fireEvent.focus(trigger)

		expect(screen.getByRole('tooltip')).toHaveAttribute('id', 'download-help-tooltip')
		expect(trigger).toHaveAttribute('aria-describedby', 'download-help-tooltip')
	})

	it('hides the tooltip with Escape while keeping focus on the trigger', () => {
		render(<HelpTooltip ariaLabel="Download help" id="download-help-tooltip" text="Download help text" />)
		const trigger = screen.getByRole('button', { name: 'Download help' })

		trigger.focus()
		fireEvent.focus(trigger)
		expect(screen.getByRole('tooltip')).toBeInTheDocument()

		fireEvent.keyDown(trigger, { key: 'Escape', bubbles: true, cancelable: true })

		expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
		expect(trigger).toHaveFocus()
	})
})
