import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, beforeAll } from 'vitest'

import { ObjectsPage } from '../../ObjectsPage'
import { TransfersContext } from '../../../components/useTransfers'

const transfersStub = {
	isOpen: false,
	tab: 'downloads',
	activeDownloadCount: 0,
	activeUploadCount: 0,
	activeTransferCount: 0,
	downloadTasks: [],
	uploadTasks: [],
	openTransfers: () => {},
	closeTransfers: () => {},
	queueDownloadObject: () => {},
	queueDownloadObjectsToDevice: () => {},
	queueDownloadJobArtifact: () => {},
	queueUploadFiles: () => {},
} as const

beforeAll(() => {
	if (!('ResizeObserver' in globalThis)) {
		class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
		// @ts-expect-error - shim for jsdom
		globalThis.ResizeObserver = ResizeObserver
	}
	if (!('scrollTo' in Element.prototype)) {
		// @ts-expect-error - shim for jsdom
		Element.prototype.scrollTo = () => {}
	}
})

describe('ObjectsPage', () => {
	it('renders without crashing', () => {
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
	})
})
