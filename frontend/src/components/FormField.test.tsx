import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FormField } from './FormField'

describe('FormField', () => {
	it('renders a label associated with htmlFor', () => {
		render(
			<FormField label="Email" htmlFor="email-input">
				<input id="email-input" />
			</FormField>,
		)
		expect(screen.getByLabelText('Email')).toBeInTheDocument()
	})

	it('renders error with an id derived from htmlFor', () => {
		const { container } = render(
			<FormField label="Email" htmlFor="email-input" error="Required field">
				<input id="email-input" />
			</FormField>,
		)
		const alert = screen.getByRole('alert')
		expect(alert).toHaveTextContent('Required field')
		expect(alert).toHaveAttribute('id', 'email-input-error')
		expect(container.querySelector('#email-input-error')).toBeTruthy()
	})

	it('renders error with a custom errorId', () => {
		render(
			<FormField label="Name" htmlFor="name" errorId="custom-err" error="Too short">
				<input id="name" />
			</FormField>,
		)
		expect(screen.getByRole('alert')).toHaveAttribute('id', 'custom-err')
	})

	it('does not render error element when no error is provided', () => {
		render(
			<FormField label="Name" htmlFor="name">
				<input id="name" />
			</FormField>,
		)
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	it('renders required asterisk as aria-hidden', () => {
		const { container } = render(
			<FormField label="Email" htmlFor="email" required>
				<input id="email" />
			</FormField>,
		)
		const asterisk = container.querySelector('[aria-hidden="true"]')
		expect(asterisk).toHaveTextContent('*')
	})

	it('adds role=group and aria-describedby when error is present with errorId', () => {
		const { container } = render(
			<FormField label="Email" htmlFor="email-input" error="Required field">
				<input id="email-input" />
			</FormField>,
		)
		const group = screen.getByRole('group')
		expect(group).toHaveAttribute('aria-describedby', 'email-input-error')
		expect(container.querySelector('[role="group"]')).toBeTruthy()
	})

	it('does not add role=group when no error is present', () => {
		render(
			<FormField label="Email" htmlFor="email-input">
				<input id="email-input" />
			</FormField>,
		)
		expect(screen.queryByRole('group')).not.toBeInTheDocument()
	})
})
