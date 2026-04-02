import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ObjectsMenuPopover } from '../ObjectsMenuPopover'

describe('ObjectsMenuPopover', () => {
	it('hides an uncontrolled popover when the scope changes', () => {
		const { rerender } = render(
			<ObjectsMenuPopover
				scopeKey="token-a:profile-1"
				menu={{
					items: [
						{
							key: 'refresh',
							label: 'Refresh',
						},
					],
				}}
			>
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</ObjectsMenuPopover>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'More' }))
		expect(screen.getByText('Refresh')).toBeInTheDocument()

		rerender(
			<ObjectsMenuPopover
				scopeKey="token-b:profile-1"
				menu={{
					items: [
						{
							key: 'refresh',
							label: 'Refresh',
						},
					],
				}}
			>
				{({ toggle, open }) => (
					<button type="button" aria-expanded={open} onClick={toggle}>
						More
					</button>
				)}
			</ObjectsMenuPopover>,
		)

		expect(screen.queryByText('Refresh')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false')
	})
})
