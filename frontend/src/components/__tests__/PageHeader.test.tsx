import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PageHeader } from '../PageHeader'

describe('PageHeader', () => {
	it('renders eyebrow, subtitle, and actions with the default heading level', () => {
		render(
			<PageHeader
				eyebrow="Transfer"
				title="Uploads"
				subtitle="Queue selected files from this device."
				actions={<button type="button">Open Transfers</button>}
			/>,
		)

		expect(screen.getByText('Transfer')).toBeInTheDocument()
		expect(screen.getByRole('heading', { level: 2, name: 'Uploads' })).toBeInTheDocument()
		expect(screen.getByText('Queue selected files from this device.')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Open Transfers' })).toBeInTheDocument()
	})

	it('uses the provided title level and omits optional regions when they are not passed', () => {
		render(<PageHeader title="Buckets" titleLevel={3} />)

		expect(screen.getByRole('heading', { level: 3, name: 'Buckets' })).toBeInTheDocument()
		expect(screen.queryByRole('button')).not.toBeInTheDocument()
		expect(screen.queryByText('Transfer')).not.toBeInTheDocument()
		expect(screen.queryByText('Queue selected files from this device.')).not.toBeInTheDocument()
	})
})
