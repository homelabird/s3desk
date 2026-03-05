import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HelpTooltip } from '../HelpTooltip'

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
		const host = screen.getByTestId('help-tooltip-trigger').parentElement!
		fireEvent.focus(host)
		expect(screen.getByRole('tooltip')).toBeInTheDocument()
		fireEvent.blur(host)
		expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
	})

	it('keeps an accessible trigger', () => {
		render(<HelpTooltip text="Example help" />)
		const trigger = screen.getByLabelText('Help')
		expect(trigger).toHaveTextContent('?')
		expect(trigger).toHaveAttribute('tabIndex', '0')
	})
})
