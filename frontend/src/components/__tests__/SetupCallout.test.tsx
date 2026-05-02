import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { SetupCallout } from '../SetupCallout'

describe('SetupCallout', () => {
	it('shows setup and settings actions when no profile is selected and api token is unset', () => {
		render(
			<MemoryRouter initialEntries={['/jobs?tab=active&settings=0']}>
				<SetupCallout apiToken="" profileId={null} message="Select a profile to view jobs" />
			</MemoryRouter>,
		)

		expect(screen.getByText('Select a profile to view jobs')).toBeInTheDocument()
		expect(screen.getByText('Profiles store your S3 endpoint and credentials.')).toBeInTheDocument()
		expect(screen.getByText('If your server uses API_TOKEN, set it in Settings.')).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute('href', '/profiles')
		expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
			'href',
			'/jobs?tab=active&settings=1',
		)
	})

	it('hides the settings action when the api token is already set', () => {
		render(
			<MemoryRouter initialEntries={['/uploads']}>
				<SetupCallout apiToken="token-a" profileId={null} />
			</MemoryRouter>,
		)

		expect(screen.getByText('Select a profile to continue')).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Setup' })).toBeInTheDocument()
		expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
		expect(screen.queryByText('If your server uses API_TOKEN, set it in Settings.')).not.toBeInTheDocument()
	})

	it('renders the provided description and nothing when a profile is already selected', () => {
		const { rerender } = render(
			<MemoryRouter initialEntries={['/buckets']}>
				<SetupCallout
					apiToken=""
					profileId={null}
					message="Select a profile to manage buckets"
					description="Custom setup description"
				/>
			</MemoryRouter>,
		)

		expect(screen.getByText('Custom setup description')).toBeInTheDocument()

		rerender(
			<MemoryRouter initialEntries={['/buckets']}>
				<SetupCallout apiToken="" profileId="profile-1" />
			</MemoryRouter>,
		)

		expect(screen.queryByText('Custom setup description')).not.toBeInTheDocument()
		expect(screen.queryByRole('link', { name: 'Setup' })).not.toBeInTheDocument()
	})
})
