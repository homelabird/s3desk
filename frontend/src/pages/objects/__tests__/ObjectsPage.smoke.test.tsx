import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, beforeAll } from 'vitest'

import { ObjectsPage } from '../../ObjectsPage'
import type { DownloadTask, TransfersContextValue, UploadTask } from '../../../components/Transfers'
import { TransfersContext } from '../../../components/useTransfers'

const transfersStub: TransfersContextValue = {
	isOpen: false,
	tab: 'downloads',
	activeDownloadCount: 0,
	activeUploadCount: 0,
	activeTransferCount: 0,
	downloadTasks: [] as DownloadTask[],
	uploadTasks: [] as UploadTask[],
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
		globalThis.ResizeObserver = ResizeObserver
	}
	if (!('scrollTo' in Element.prototype)) {
		Object.defineProperty(Element.prototype, 'scrollTo', {
			value: () => {},
			writable: true,
		})
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
