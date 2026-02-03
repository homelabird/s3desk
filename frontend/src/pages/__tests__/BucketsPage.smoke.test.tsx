import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../api/client'
import { BucketsPage } from '../BucketsPage'
import { ensureDomShims } from '../../test/domShims'

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('BucketsPage', () => {
	it('renders without crashing', () => {
		vi.spyOn(APIClient.prototype, 'listProfiles').mockResolvedValue([])

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<BucketsPage apiToken="" profileId={null} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(screen.getByText('Select a profile to view buckets')).toBeInTheDocument()
	})
})
