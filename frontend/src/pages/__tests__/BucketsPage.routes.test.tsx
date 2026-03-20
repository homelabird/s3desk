import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient, APIError } from '../../api/client'
import { ensureDomShims } from '../../test/domShims'
import { BucketsPage } from '../BucketsPage'

const { confirmDangerActionMock } = vi.hoisted(() => ({
	confirmDangerActionMock: vi.fn((options: { onConfirm: () => Promise<void> | void }) => options.onConfirm()),
}))

vi.mock('../../lib/confirmDangerAction', () => ({
	confirmDangerAction: (options: { onConfirm: () => Promise<void> | void }) => confirmDangerActionMock(options),
}))

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	window.localStorage.clear()
	confirmDangerActionMock.mockClear()
	vi.restoreAllMocks()
})

function createClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	})
}

function LocationProbe() {
	const location = useLocation()
	return (
		<>
			<div data-testid="route-path">{location.pathname}</div>
			<pre data-testid="route-state">{JSON.stringify(location.state ?? null)}</pre>
		</>
	)
}

function mockBucketsPageBase() {
	const getMeta = vi.fn().mockResolvedValue({
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
		transferEngine: {
			name: 'rclone',
			available: true,
			compatible: true,
			minVersion: '1.52.0',
			path: '/usr/bin/rclone',
			version: 'v1.66.0',
		},
	} as never)
	const listProfiles = vi.fn().mockResolvedValue([
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
	const bucketsApi = {
		listBuckets: vi.fn().mockResolvedValue([
		{ name: 'primary-bucket', createdAt: '2024-01-01T00:00:00Z' },
	] as never),
		deleteBucket: vi.fn(),
	}

	vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({ getMeta } as never)
	vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({ listProfiles } as never)
	vi.spyOn(APIClient.prototype, 'buckets', 'get').mockReturnValue(bucketsApi as never)

	return bucketsApi
}

function renderBucketsPage() {
	render(
		<QueryClientProvider client={createClient()}>
			<MemoryRouter initialEntries={['/buckets']}>
				<Routes>
					<Route path="/buckets" element={<BucketsPage apiToken="token" profileId="profile-1" />} />
					<Route path="/objects" element={<LocationProbe />} />
					<Route path="/jobs" element={<LocationProbe />} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	)
}

describe('BucketsPage route side effects', () => {
	it('navigates to Objects with the expected route state for bucket_not_empty errors', async () => {
		const bucketsApi = mockBucketsPageBase()
		const deleteBucket = bucketsApi.deleteBucket.mockRejectedValue(
			new APIError({
				status: 409,
				code: 'bucket_not_empty',
				message: 'bucket is not empty',
			}),
		)

		renderBucketsPage()

		const bucketList = await screen.findByTestId('buckets-list-compact')
		fireEvent.click(await within(bucketList).findByRole('button', { name: /delete/i }))
		await waitFor(() => expect(deleteBucket).toHaveBeenCalledWith('profile-1', 'primary-bucket'))

		fireEvent.click(await screen.findByRole('button', { name: 'Open Objects' }))

		expect(await screen.findByTestId('route-path')).toHaveTextContent('/objects')
		expect(screen.getByTestId('route-state')).toHaveTextContent('"openBucket":true')
		expect(screen.getByTestId('route-state')).toHaveTextContent('"bucket":"primary-bucket"')
		expect(screen.getByTestId('route-state')).toHaveTextContent('"prefix":""')
	})

	it('navigates to Jobs with the expected route state for bucket_not_empty errors', async () => {
		const bucketsApi = mockBucketsPageBase()
		const deleteBucket = bucketsApi.deleteBucket.mockRejectedValue(
			new APIError({
				status: 409,
				code: 'bucket_not_empty',
				message: 'bucket is not empty',
			}),
		)

		renderBucketsPage()

		const bucketList = await screen.findByTestId('buckets-list-compact')
		fireEvent.click(await within(bucketList).findByRole('button', { name: /delete/i }))
		await waitFor(() => expect(deleteBucket).toHaveBeenCalledWith('profile-1', 'primary-bucket'))

		fireEvent.click(await screen.findByRole('button', { name: 'Delete all objects (job)' }))

		expect(await screen.findByTestId('route-path')).toHaveTextContent('/jobs')
		expect(screen.getByTestId('route-state')).toHaveTextContent('"openDeleteJob":true')
		expect(screen.getByTestId('route-state')).toHaveTextContent('"bucket":"primary-bucket"')
		expect(screen.getByTestId('route-state')).toHaveTextContent('"deleteAll":true')
	})
})
