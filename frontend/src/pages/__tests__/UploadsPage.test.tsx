import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../api/client'
import { TransfersContext } from '../../components/useTransfers'
import * as uploadUtils from '../../components/transfers/transfersUploadUtils'
import * as deviceFs from '../../lib/deviceFs'
import { ensureDomShims } from '../../test/domShims'
import { transfersStub } from '../../test/transfersStub'
import { UploadsPage } from '../UploadsPage'

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	window.localStorage.clear()
	vi.restoreAllMocks()
})

function createClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	})
}

function mockUploadsPageBase(args?: {
	buckets?: Array<{ name: string; createdAt?: string }>
	profile?: {
		id: string
		name: string
		provider: 'aws_s3' | 's3_compatible' | 'gcp_gcs' | 'azure_blob' | 'oci_object_storage'
		endpoint?: string
		region?: string
		forcePathStyle?: boolean
	}
}) {
	const profile = args?.profile ?? {
		id: 'profile-1',
		name: 'Primary Profile',
		provider: 's3_compatible' as const,
		endpoint: 'http://127.0.0.1:9000',
		region: 'us-east-1',
		forcePathStyle: false,
	}

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
			...profile,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
	] as never)
	const listBuckets = vi.fn().mockResolvedValue(
		(args?.buckets ?? [{ name: 'primary-bucket', createdAt: '2024-01-01T00:00:00Z' }]) as never,
	)

	vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({ getMeta } as never)
	vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({ listProfiles } as never)
	vi.spyOn(APIClient.prototype, 'buckets', 'get').mockReturnValue({ listBuckets } as never)

	return { getMeta, listProfiles, listBuckets }
}

function renderUploadsPage(
	props?: {
		apiToken?: string
		profileId?: string | null
	},
	transfersOverride?: Partial<typeof transfersStub>,
) {
	const transfersValue = { ...transfersStub, ...transfersOverride }
	const apiToken = props && 'apiToken' in props ? (props.apiToken ?? '') : 'token'
	const profileId = props && 'profileId' in props ? (props.profileId ?? null) : 'profile-1'

	render(
		<QueryClientProvider client={createClient()}>
			<TransfersContext.Provider value={transfersValue}>
				<MemoryRouter initialEntries={['/uploads']}>
					<Routes>
						<Route
							path="/uploads"
							element={<UploadsPage apiToken={apiToken} profileId={profileId} />}
						/>
						<Route path="/setup" element={<div>Setup Route</div>} />
						<Route path="/buckets" element={<div>Buckets Route</div>} />
					</Routes>
				</MemoryRouter>
			</TransfersContext.Provider>
		</QueryClientProvider>,
	)

	return transfersValue
}

describe('UploadsPage', () => {
	it('navigates to setup from the setup callout', () => {
		renderUploadsPage({ apiToken: '', profileId: null })

		expect(screen.getByText('Select a profile to upload files')).toBeInTheDocument()
		fireEvent.click(screen.getByRole('link', { name: 'Setup' }))
		expect(screen.getByText('Setup Route')).toBeInTheDocument()
	})

	it('shows the empty-bucket state and links to the buckets page', async () => {
		mockUploadsPageBase({ buckets: [] })

		renderUploadsPage()

		expect(await screen.findByText('No buckets available')).toBeInTheDocument()
		fireEvent.click(screen.getByRole('link', { name: 'Go to Buckets' }))
		expect(screen.getByText('Buckets Route')).toBeInTheDocument()
	})

	it('queues selected files and clears the staged selection', async () => {
		const files = [new File(['hello'], 'demo.txt', { type: 'text/plain' })]
		const queueUploadFiles = vi.fn()
		mockUploadsPageBase()
		vi.spyOn(deviceFs, 'getDirectorySelectionSupport').mockReturnValue({ ok: true })
		vi.spyOn(uploadUtils, 'promptForFiles').mockResolvedValue(files)

		renderUploadsPage(undefined, { queueUploadFiles })

		await waitFor(() => expect(screen.getByLabelText('Bucket')).not.toBeDisabled())
		fireEvent.change(screen.getByLabelText('Bucket'), {
			target: { value: 'primary-bucket' },
		})
		fireEvent.change(screen.getByLabelText('Upload prefix (optional)'), {
			target: { value: 'photos/2024' },
		})
		fireEvent.click(screen.getByRole('button', { name: /Add from device/i }))
		fireEvent.click(await screen.findByRole('button', { name: /Choose files/i }))

		expect(await screen.findByText('demo.txt')).toBeInTheDocument()
		await waitFor(() => expect(screen.getByRole('button', { name: 'Queue upload (1)' })).not.toBeDisabled())

		fireEvent.click(screen.getByRole('button', { name: 'Queue upload (1)' }))

		await waitFor(() => {
			expect(queueUploadFiles).toHaveBeenCalledWith({
				profileId: 'profile-1',
				bucket: 'primary-bucket',
				prefix: 'photos/2024',
				files,
			})
		})
		expect(screen.getByText('No files or folders selected.')).toBeInTheDocument()
	})

	it('reads bucket and prefix from the active profile scope', async () => {
		mockUploadsPageBase({
			profile: {
				id: 'profile-1',
				name: 'Primary Profile',
				provider: 's3_compatible',
				endpoint: 'http://127.0.0.1:9000',
				region: 'us-east-1',
				forcePathStyle: false,
			},
		})
		window.localStorage.setItem('uploads:profile-1:bucket', JSON.stringify('alpha-bucket'))
		window.localStorage.setItem('uploads:profile-1:prefix', JSON.stringify('alpha/'))
		window.localStorage.setItem('uploads:profile-2:bucket', JSON.stringify('beta-bucket'))
		window.localStorage.setItem('uploads:profile-2:prefix', JSON.stringify('beta/'))

		const transfersValue = { ...transfersStub }
		const client = createClient()
		const view = render(
			<QueryClientProvider client={client}>
				<TransfersContext.Provider value={transfersValue}>
					<MemoryRouter initialEntries={['/uploads']}>
						<Routes>
							<Route path="/uploads" element={<UploadsPage apiToken="token" profileId="profile-1" />} />
						</Routes>
					</MemoryRouter>
				</TransfersContext.Provider>
			</QueryClientProvider>,
		)

		await waitFor(() => expect(screen.getByLabelText('Bucket')).toHaveValue('alpha-bucket'))
		expect(screen.getByLabelText('Upload prefix (optional)')).toHaveValue('alpha/')

		view.rerender(
			<QueryClientProvider client={client}>
				<TransfersContext.Provider value={transfersValue}>
					<MemoryRouter initialEntries={['/uploads']}>
						<Routes>
							<Route path="/uploads" element={<UploadsPage apiToken="token" profileId="profile-2" />} />
						</Routes>
					</MemoryRouter>
				</TransfersContext.Provider>
			</QueryClientProvider>,
		)

		await waitFor(() => expect(screen.getByLabelText('Bucket')).toHaveValue('beta-bucket'))
		expect(screen.getByLabelText('Upload prefix (optional)')).toHaveValue('beta/')
	})

	it('shows the provider-disabled state and disables upload actions', async () => {
		const { listProfiles, listBuckets } = mockUploadsPageBase()
		const getMeta = vi.fn().mockResolvedValue({
			version: 'test',
			serverAddr: '127.0.0.1:8080',
			dataDir: '/data',
			staticDir: '/app/ui',
			apiTokenEnabled: true,
			encryptionEnabled: false,
			capabilities: {
				profileTls: { enabled: false, reason: 'test' },
				providers: {
					s3_compatible: {
						bucketCrud: true,
						objectCrud: false,
						jobTransfer: false,
						bucketPolicy: true,
						gcsIamPolicy: false,
						azureContainerAccessPolicy: false,
						presignedUpload: true,
						presignedMultipartUpload: true,
						directUpload: false,
						reasons: {
							objectCrud: 'Uploads are disabled by backend policy.',
							jobTransfer: 'Transfer jobs are disabled by backend policy.',
						},
					},
				},
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
		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({ getMeta } as never)
		vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({ listProfiles } as never)
		vi.spyOn(APIClient.prototype, 'buckets', 'get').mockReturnValue({ listBuckets } as never)

		renderUploadsPage()

		expect(await screen.findByText('Uploads are not available for this provider')).toBeInTheDocument()
		expect(screen.getAllByText('Uploads are disabled by backend policy.')).toHaveLength(2)
		expect(screen.getByRole('button', { name: 'Queue upload' })).toBeDisabled()
		expect(screen.getByRole('button', { name: /Add from device/i })).toBeDisabled()
	})
})
