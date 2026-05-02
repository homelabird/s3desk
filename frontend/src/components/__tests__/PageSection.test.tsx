import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import styles from '../PageSection.module.css'
import { PageSection } from '../PageSection'

describe('PageSection', () => {
	it('renders title, description, actions, and children when header content is provided', () => {
		render(
			<PageSection
				title="Selection"
				description="Choose files or folders from this device."
				actions={<button type="button">Open picker</button>}
			>
				<div>Section body</div>
			</PageSection>,
		)

		expect(screen.getByRole('heading', { level: 4, name: 'Selection' })).toBeInTheDocument()
		expect(screen.getByText('Choose files or folders from this device.')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Open picker' })).toBeInTheDocument()
		expect(screen.getByText('Section body')).toBeInTheDocument()
	})

	it('omits the header and applies flush/className overrides when no header content is passed', () => {
		const { container } = render(
			<PageSection className="custom-section" bodyClassName="custom-body" flush>
				<div>Body only</div>
			</PageSection>,
		)

		const section = container.querySelector('section')
		const body = section?.lastElementChild

		expect(screen.queryByRole('heading')).not.toBeInTheDocument()
		expect(screen.getByText('Body only')).toBeInTheDocument()
		expect(section).toHaveClass(styles.section)
		expect(section).toHaveClass('custom-section')
		expect(body).toHaveClass(styles.body)
		expect(body).toHaveClass(styles.bodyFlush)
		expect(body).toHaveClass('custom-body')
	})
})
