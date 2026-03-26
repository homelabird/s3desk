import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'

import { TransfersContext } from '../../../components/useTransfers'
import { ensureDomShims } from '../../../test/domShims'
import { transfersStub } from '../../../test/transfersStub'
import { ObjectsPage } from '../../ObjectsPage'

beforeAll(() => {
	ensureDomShims()
})

describe('ObjectsPage', () => {
	it('toggles sort direction from list header', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<TransfersContext.Provider value={transfersStub}>
					<MemoryRouter>
						<ObjectsPage apiToken="" profileId={null} />
					</MemoryRouter>
				</TransfersContext.Provider>
			</QueryClientProvider>,
		)

		expect(screen.getByText('Objects')).toBeInTheDocument()
		fireEvent.click(await screen.findByRole('button', { name: /Name/i }))
		expect(await screen.findByRole('button', { name: /Name/i })).toHaveAccessibleName(/Name caret-down/i)
	}, 15_000)
})
