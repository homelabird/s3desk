import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../test/domShims'
import { BucketsPage } from '../BucketsPage'

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('BucketsPage', () => {
	it('navigates to profiles from setup callout', () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter initialEntries={['/buckets']}>
					<Routes>
						<Route path="/buckets" element={<BucketsPage apiToken="" profileId={null} />} />
						<Route path="/profiles" element={<div>Profiles Route</div>} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(screen.getByText('Select a profile to view buckets')).toBeInTheDocument()
		fireEvent.click(screen.getByRole('link', { name: 'Profiles' }))
		expect(screen.getByText('Profiles Route')).toBeInTheDocument()
	})
})
