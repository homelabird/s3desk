import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../api/client'
import { TransfersContext } from '../../components/useTransfers'
import { ensureDomShims } from '../../test/domShims'
import { transfersStub } from '../../test/transfersStub'
import { JobsPage } from '../JobsPage'

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('JobsPage', () => {
	it('renders without crashing', () => {
		vi.spyOn(APIClient.prototype, 'listProfiles').mockResolvedValue([])

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<TransfersContext.Provider value={transfersStub}>
					<MemoryRouter>
						<JobsPage apiToken="" profileId={null} />
					</MemoryRouter>
				</TransfersContext.Provider>
			</QueryClientProvider>,
		)

		expect(screen.getByText('Select a profile to view jobs')).toBeInTheDocument()
	})
})
