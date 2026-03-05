import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../test/domShims'
import { ProfilesPage } from '../ProfilesPage'

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('ProfilesPage', () => {
	it('dismisses onboarding callout', () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(screen.getByText('Getting started')).toBeInTheDocument()
		fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
		expect(screen.queryByText('Getting started')).not.toBeInTheDocument()
	}, 20_000)
})
