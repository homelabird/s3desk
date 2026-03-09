import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../api/client'
import { ensureDomShims } from '../../test/domShims'
import { BucketsPage } from '../BucketsPage'

beforeAll(() => {
	ensureDomShims()
})

const originalMatchMedia = window.matchMedia

function mockViewportWidth(width: number) {
	window.matchMedia = vi.fn().mockImplementation((query: string): MediaQueryList => {
		const minMatch = query.match(/\(min-width:\s*(\d+)px\)/)
		const maxMatch = query.match(/\(max-width:\s*(\d+)px\)/)
		let matches = true
		if (minMatch) matches &&= width >= Number(minMatch[1])
		if (maxMatch) matches &&= width <= Number(maxMatch[1])
		return {
			matches,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}
	})
}

afterEach(() => {
	window.matchMedia = originalMatchMedia
	vi.restoreAllMocks()
})

describe('BucketsPage', () => {
	it('navigates to setup from setup callout', () => {
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
						<Route path="/setup" element={<div>Setup Route</div>} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(screen.getByText('Select a profile to view buckets')).toBeInTheDocument()
		fireEvent.click(screen.getByRole('link', { name: 'Setup' }))
		expect(screen.getByText('Setup Route')).toBeInTheDocument()
	})

	it('disables bucket operations for gcs profiles missing project number', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		vi.spyOn(APIClient.prototype, 'getMeta').mockResolvedValue({
			version: 'test',
			serverAddr: '127.0.0.1:8080',
			dataDir: '/data',
			staticDir: '/app/ui',
			apiTokenEnabled: true,
			encryptionEnabled: false,
			capabilities: {
				profileTls: { enabled: false, reason: 'test' },
				providers: {
					gcp_gcs: {
						bucketCrud: true,
						objectCrud: true,
						jobTransfer: true,
						bucketPolicy: false,
						gcsIamPolicy: true,
						azureContainerAccessPolicy: false,
						presignedUpload: false,
						presignedMultipartUpload: false,
						directUpload: false,
						reasons: {},
					},
				},
			},
			allowedLocalDirs: [],
			jobConcurrency: 1,
			uploadSessionTTLSeconds: 3600,
			uploadDirectStream: false,
			transferEngine: { name: 'rclone', available: true, compatible: true, minVersion: '1.52.0', path: '/usr/bin/rclone', version: 'v1.66.0' },
		} as never)
		vi.spyOn(APIClient.prototype, 'listProfiles').mockResolvedValue([
			{
				id: 'profile-1',
				name: 'GCS Profile',
				provider: 'gcp_gcs',
				anonymous: false,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
			},
		] as never)
		const listBuckets = vi.spyOn(APIClient.prototype, 'listBuckets').mockResolvedValue([] as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter initialEntries={['/buckets']}>
					<Routes>
						<Route path="/buckets" element={<BucketsPage apiToken="token" profileId="profile-1" />} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(await screen.findByText('Bucket operations unavailable')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'New Bucket' })).toBeDisabled()
		await waitFor(() => expect(listBuckets).not.toHaveBeenCalled())
	})

	it('renders compact bucket cards on tablet widths', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		mockViewportWidth(820)
		vi.spyOn(APIClient.prototype, 'getMeta').mockResolvedValue({
			version: 'test',
			serverAddr: '127.0.0.1:8080',
			dataDir: '/data',
			staticDir: '/app/ui',
			apiTokenEnabled: true,
			encryptionEnabled: false,
			capabilities: {
				profileTls: { enabled: false, reason: 'test' },
				providers: {},
			},
			allowedLocalDirs: [],
			jobConcurrency: 1,
			uploadSessionTTLSeconds: 3600,
			uploadDirectStream: false,
			transferEngine: { name: 'rclone', available: true, compatible: true, minVersion: '1.52.0', path: '/usr/bin/rclone', version: 'v1.66.0' },
		} as never)
		vi.spyOn(APIClient.prototype, 'listProfiles').mockResolvedValue([
			{
				id: 'profile-1',
				name: 'Primary Profile',
				provider: 's3_compatible',
				endpoint: 'http://127.0.0.1:9000',
				region: 'us-east-1',
				forcePathStyle: false,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
			},
		] as never)
		vi.spyOn(APIClient.prototype, 'listBuckets').mockResolvedValue([
			{ name: 'primary-bucket', createdAt: '2024-01-01T00:00:00Z' },
		] as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter initialEntries={['/buckets']}>
					<Routes>
						<Route path="/buckets" element={<BucketsPage apiToken="token" profileId="profile-1" />} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(await screen.findByTestId('buckets-list-compact')).toBeInTheDocument()
		expect(screen.queryByTestId('buckets-table-desktop')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Policy/ })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument()
	})

	it('renders the full bucket table on desktop widths', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		mockViewportWidth(1200)
		vi.spyOn(APIClient.prototype, 'getMeta').mockResolvedValue({
			version: 'test',
			serverAddr: '127.0.0.1:8080',
			dataDir: '/data',
			staticDir: '/app/ui',
			apiTokenEnabled: true,
			encryptionEnabled: false,
			capabilities: {
				profileTls: { enabled: false, reason: 'test' },
				providers: {},
			},
			allowedLocalDirs: [],
			jobConcurrency: 1,
			uploadSessionTTLSeconds: 3600,
			uploadDirectStream: false,
			transferEngine: { name: 'rclone', available: true, compatible: true, minVersion: '1.52.0', path: '/usr/bin/rclone', version: 'v1.66.0' },
		} as never)
		vi.spyOn(APIClient.prototype, 'listProfiles').mockResolvedValue([
			{
				id: 'profile-1',
				name: 'Primary Profile',
				provider: 's3_compatible',
				endpoint: 'http://127.0.0.1:9000',
				region: 'us-east-1',
				forcePathStyle: false,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
			},
		] as never)
		vi.spyOn(APIClient.prototype, 'listBuckets').mockResolvedValue([
			{ name: 'primary-bucket', createdAt: '2024-01-01T00:00:00Z' },
		] as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter initialEntries={['/buckets']}>
					<Routes>
						<Route path="/buckets" element={<BucketsPage apiToken="token" profileId="profile-1" />} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(await screen.findByTestId('buckets-table-desktop')).toBeInTheDocument()
		expect(screen.queryByTestId('buckets-list-compact')).not.toBeInTheDocument()
		expect(screen.getByText('primary-bucket')).toBeInTheDocument()
	})
})
