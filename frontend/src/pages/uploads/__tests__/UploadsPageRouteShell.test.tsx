import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { UploadsPageRouteShell } from '../UploadsPageRouteShell'

describe('UploadsPageRouteShell', () => {
	it('renders the setup callout when no profile is selected', () => {
		render(
			<MemoryRouter>
				<UploadsPageRouteShell apiToken="" profileId={null}>
					<div data-testid="uploads-shell" />
				</UploadsPageRouteShell>
			</MemoryRouter>,
		)

		expect(screen.getByText('Select a profile to upload files')).toBeInTheDocument()
		expect(screen.queryByTestId('uploads-shell')).not.toBeInTheDocument()
	})

	it('renders the page shell when a profile is selected', () => {
		render(
			<MemoryRouter>
				<UploadsPageRouteShell apiToken="token-a" profileId="profile-1">
					<div data-testid="uploads-shell" />
				</UploadsPageRouteShell>
			</MemoryRouter>,
		)

		expect(screen.getByTestId('uploads-shell')).toBeInTheDocument()
	})
})
