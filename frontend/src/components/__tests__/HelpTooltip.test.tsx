import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HelpTooltip } from '../HelpTooltip'

describe('HelpTooltip', () => {
	it('renders the (?) trigger', () => {
		render(<HelpTooltip text="Example help" />)
		expect(screen.getByTestId('help-tooltip-trigger')).toBeInTheDocument()
		expect(screen.getByTestId('help-tooltip-trigger')).toHaveTextContent('?')
	})

	it('shows tooltip content on hover', () => {
		render(<HelpTooltip text="Example help" />)
		expect(screen.queryByTestId('help-tooltip-content')).not.toBeInTheDocument()
		fireEvent.mouseEnter(screen.getByTestId('help-tooltip-trigger').parentElement!)
		expect(screen.getByTestId('help-tooltip-content')).toBeInTheDocument()
		expect(screen.getByTestId('help-tooltip-content')).toHaveTextContent('Example help')
	})

	it('hides tooltip content on mouse leave', () => {
		render(<HelpTooltip text="Example help" />)
		fireEvent.mouseEnter(screen.getByTestId('help-tooltip-trigger').parentElement!)
		expect(screen.getByTestId('help-tooltip-content')).toBeInTheDocument()
		fireEvent.mouseLeave(screen.getByTestId('help-tooltip-trigger').parentElement!)
		expect(screen.queryByTestId('help-tooltip-content')).not.toBeInTheDocument()
	})

	it('has accessible role="tooltip" on content', () => {
		render(<HelpTooltip text="Example help" />)
		fireEvent.mouseEnter(screen.getByTestId('help-tooltip-trigger').parentElement!)
		expect(screen.getByRole('tooltip')).toBeInTheDocument()
	})
})
