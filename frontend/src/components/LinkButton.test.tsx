import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { LinkButton } from './LinkButton'

describe('LinkButton', () => {
	it('renders a link when not disabled', () => {
		render(
			<MemoryRouter>
				<LinkButton to="/test">Click me</LinkButton>
			</MemoryRouter>,
		)
		const link = screen.getByText('Click me')
		expect(link.tagName).toBe('A')
		expect(link).not.toHaveAttribute('aria-disabled')
	})

	it('renders a span with role="link" and aria-disabled when disabled', () => {
		render(
			<MemoryRouter>
				<LinkButton to="/test" disabled>
					Disabled link
				</LinkButton>
			</MemoryRouter>,
		)
		const el = screen.getByText('Disabled link')
		expect(el.tagName).toBe('SPAN')
		expect(el).toHaveAttribute('role', 'link')
		expect(el).toHaveAttribute('aria-disabled', 'true')
	})
})
