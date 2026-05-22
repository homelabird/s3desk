import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ProfilesOnboardingCard } from '../ProfilesOnboardingCard'

type Props = ComponentProps<typeof ProfilesOnboardingCard>

function renderOnboardingCard(overrides: Partial<Props> = {}) {
	const props: Props = {
		visible: true,
		backendConnected: true,
		transferEngine: { available: true, compatible: true, minVersion: 'v1.66.0' },
		apiTokenEnabled: true,
		apiToken: 'token',
		profilesCount: 1,
		profileId: 'profile-1',
		onCreateProfile: vi.fn(),
		onDismiss: vi.fn(),
		...overrides,
	}

	return render(
		<MemoryRouter>
			<ProfilesOnboardingCard {...props} />
		</MemoryRouter>,
	)
}

describe('ProfilesOnboardingCard', () => {
	it('keeps the visible setup checklist focused on profile creation and selection', () => {
		renderOnboardingCard()

		expect(screen.getByText('Create a storage profile')).toBeInTheDocument()
		expect(screen.getByText('Choose the active profile')).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Open buckets' })).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Open objects' })).toBeInTheDocument()
		const diagnostics = screen.getByText('Connection checks').closest('details')
		expect(diagnostics).not.toHaveAttribute('open')
	})

	it('opens connection checks when an environment prerequisite needs attention', () => {
		renderOnboardingCard({
			transferEngine: { available: false, compatible: false, minVersion: 'v1.66.0' },
		})

		const diagnostics = screen.getByText('Connection checks need attention').closest('details')
		expect(diagnostics).toHaveAttribute('open')
		expect(screen.getByText('File transfer helper is available')).toBeInTheDocument()
		expect(screen.getAllByText('Needs setup')).toHaveLength(2)
	})

	it('keeps next navigation out of the action row until a profile is selected', () => {
		renderOnboardingCard({
			profilesCount: 0,
			profileId: null,
		})

		expect(screen.getByRole('button', { name: 'Create profile' })).toBeInTheDocument()
		expect(screen.getByText('Create a profile to open buckets and objects.')).toBeInTheDocument()
		expect(screen.queryByRole('link', { name: 'Open buckets' })).not.toBeInTheDocument()
		expect(screen.queryByRole('link', { name: 'Open objects' })).not.toBeInTheDocument()
	})
})
