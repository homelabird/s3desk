import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

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

	it('renders a disabled anchor that is removed from tab order', () => {
		render(
			<MemoryRouter initialEntries={['/']}>
				<LinkButton to="/test" disabled data-testid="disabled-link" className="custom-link">
					Disabled link
				</LinkButton>
			</MemoryRouter>,
		)
		const link = screen.getByTestId('disabled-link')
		expect(link.tagName).toBe('A')
		expect(link).toHaveAttribute('href', '/test')
		expect(link).toHaveAttribute('aria-disabled', 'true')
		expect(link).toHaveAttribute('tabIndex', '-1')
		expect(link).toHaveClass('ant-btn-disabled')
		expect(link).toHaveClass('custom-link')
	})

	it('blocks pointer and keyboard activation when disabled', () => {
		const onClick = vi.fn()
		const onKeyDown = vi.fn()
		render(
			<MemoryRouter initialEntries={['/']}>
				<LinkButton to="/test" disabled onClick={onClick} onKeyDown={onKeyDown}>
					Disabled link
				</LinkButton>
				<Routes>
					<Route path="/" element={<p>Home</p>} />
					<Route path="/test" element={<p>Target</p>} />
				</Routes>
			</MemoryRouter>,
		)

		const link = screen.getByRole('link', { name: 'Disabled link' })
		fireEvent.click(link)
		fireEvent.keyDown(link, { key: 'Enter' })
		fireEvent.keyDown(link, { key: ' ' })

		expect(onClick).not.toHaveBeenCalled()
		expect(onKeyDown).not.toHaveBeenCalled()
		expect(screen.getByText('Home')).toBeInTheDocument()
		expect(screen.queryByText('Target')).not.toBeInTheDocument()
	})
})
