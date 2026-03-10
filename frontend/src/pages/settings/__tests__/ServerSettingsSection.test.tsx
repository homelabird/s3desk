import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { APIClient } from '../../../api/client'
import type { MetaResponse, ServerRestoreResponse } from '../../../api/types'
import { ensureDomShims } from '../../../test/domShims'
import { ServerSettingsSection } from '../ServerSettingsSection'

beforeAll(() => {
	ensureDomShims()
})

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

function buildMeta(overrides: Partial<MetaResponse> = {}): MetaResponse {
	return {
		version: 'test',
		serverAddr: '127.0.0.1:8080',
		dataDir: '/data',
		dbBackend: 'sqlite',
		staticDir: '/app/ui',
		apiTokenEnabled: false,
		encryptionEnabled: true,
		capabilities: {
			profileTls: { enabled: true, reason: '' },
			serverBackup: {
				export: { enabled: true, reason: '' },
				restoreStaging: { enabled: true, reason: '' },
			},
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
		...overrides,
	}
}

function buildRestoreResponse(overrides: Partial<ServerRestoreResponse> = {}): ServerRestoreResponse {
	return {
		manifest: {
			format: 's3desk-server-backup/v1',
			bundleKind: 'full',
			createdAt: '2026-03-08T00:00:00Z',
			appVersion: 'test',
			dbBackend: 'sqlite',
			encryptionEnabled: true,
			entries: ['s3desk.db', 'thumbnails'],
			payloadFileCount: 2,
			payloadBytes: 2048,
			payloadSha256: 'abc123',
			warnings: ['Use the same ENCRYPTION_KEY'],
		},
		validation: {
			preflightChecked: true,
			diskFreeBytesBefore: 10_000,
			payloadFileCount: 2,
			payloadBytes: 2048,
			payloadChecksumPresent: true,
			payloadChecksumVerified: true,
		},
		stagingDir: '/data/restores/01ARZ3NDEKTSV4RRFFQ69G5FAV',
		restartRequired: true,
		nextSteps: ['Review the staged restore before cutover.'],
		applyPlan: ['Stop the destination server before switching DATA_DIR.'],
		helperCommand: 'DATA_DIR="/data/restores/01ARZ3NDEKTSV4RRFFQ69G5FAV" DB_BACKEND="sqlite" <start-command>',
		warnings: ['Use the same ENCRYPTION_KEY'],
		...overrides,
	}
}

describe('ServerSettingsSection', () => {
	beforeEach(() => {
		URL.createObjectURL = vi.fn(() => 'blob:backup')
		URL.revokeObjectURL = vi.fn()
	})

	afterEach(() => {
		URL.createObjectURL = originalCreateObjectURL
		URL.revokeObjectURL = originalRevokeObjectURL
		vi.restoreAllMocks()
	})

	it('downloads a server backup bundle', async () => {
		const api = {
			downloadServerBackup: vi.fn(() => ({
				promise: Promise.resolve({
					blob: new Blob(['backup'], { type: 'application/gzip' }),
					contentDisposition: 'attachment; filename="migration.tar.gz"',
					contentType: 'application/gzip',
				}),
				abort: vi.fn(),
			})),
			restoreServerBackup: vi.fn(),
			listServerRestores: vi.fn().mockResolvedValue({ items: [] }),
			deleteServerRestore: vi.fn(),
		} as unknown as APIClient
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

		render(<ServerSettingsSection api={api} meta={buildMeta()} isFetching={false} errorMessage={null} />)

		fireEvent.click(screen.getByRole('button', { name: 'Download Full backup' }))

		await waitFor(() => expect((api.downloadServerBackup as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('full'))
		await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
		expect(clickSpy).toHaveBeenCalledTimes(1)
	})

	it('uploads a restore bundle and shows the staged directory', async () => {
		const api = {
			downloadServerBackup: vi.fn(),
			restoreServerBackup: vi.fn().mockResolvedValue(buildRestoreResponse()),
			listServerRestores: vi.fn().mockResolvedValue({ items: [] }),
			deleteServerRestore: vi.fn(),
		} as unknown as APIClient

		const { container } = render(
			<ServerSettingsSection api={api} meta={buildMeta()} isFetching={false} errorMessage={null} />,
		)

		const input = container.querySelector('input[type="file"]')
		if (!(input instanceof HTMLInputElement)) {
			throw new Error('restore input not found')
		}

		const file = new File(['bundle'], 'backup.tar.gz', { type: 'application/gzip' })
		fireEvent.change(input, { target: { files: [file] } })

		await waitFor(() => expect((api.restoreServerBackup as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(file))
		expect(await screen.findByText('Restore bundle staged')).toBeInTheDocument()
		expect(screen.getByText('/data/restores/01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBeInTheDocument()
		expect(screen.getByText('Stop the destination server before switching DATA_DIR.')).toBeInTheDocument()
		expect(screen.getByText('DATA_DIR="/data/restores/01ARZ3NDEKTSV4RRFFQ69G5FAV" DB_BACKEND="sqlite" <start-command>')).toBeInTheDocument()
		expect(screen.getByText('2 files / 2 KB / sha256 abc123')).toBeInTheDocument()
	})

	it('disables backup download for postgres-backed servers', () => {
		const api = {
			downloadServerBackup: vi.fn(),
			restoreServerBackup: vi.fn(),
			listServerRestores: vi.fn().mockResolvedValue({ items: [] }),
			deleteServerRestore: vi.fn(),
		} as unknown as APIClient

		render(
			<ServerSettingsSection
				api={api}
				meta={buildMeta({
					dbBackend: 'postgres',
					capabilities: {
						profileTls: { enabled: true, reason: '' },
						serverBackup: {
							export: {
								enabled: false,
								reason: 'In-product backup export currently supports only sqlite-backed servers.',
							},
							restoreStaging: {
								enabled: true,
								reason: 'Stages a sqlite DATA_DIR bundle only; this is not a Postgres backup or restore workflow.',
							},
						},
						providers: {},
					},
				})}
				isFetching={false}
				errorMessage={null}
			/>,
		)

		expect(screen.getByRole('button', { name: 'Download Full backup' })).toBeDisabled()
		expect(screen.getByRole('button', { name: 'Download Cache + metadata backup' })).toBeDisabled()
		expect(screen.getByRole('button', { name: 'Upload restore bundle' })).toBeEnabled()
		expect(screen.getByText(/Backup export currently supports sqlite-backed servers only/i)).toBeInTheDocument()
		expect(screen.getByText(/not a Postgres backup or restore workflow/i)).toBeInTheDocument()
	})

	it('shows staged restore age and payload size more clearly', async () => {
		const api = {
			downloadServerBackup: vi.fn(),
			restoreServerBackup: vi.fn(),
			listServerRestores: vi.fn().mockResolvedValue({
				items: [
					{
						id: 'restore-1',
						stagingDir: '/data/restores/restore-1',
						stagedAt: '2026-03-09T23:00:00Z',
						manifest: buildRestoreResponse().manifest,
					},
				],
			}),
			deleteServerRestore: vi.fn(),
		} as unknown as APIClient
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-03-10T00:00:00Z'))

		render(<ServerSettingsSection api={api} meta={buildMeta()} isFetching={false} errorMessage={null} />)

		expect(await screen.findByText(/1h ago/i)).toBeInTheDocument()
		expect(screen.getByText('2 KB')).toBeInTheDocument()
		vi.useRealTimers()
	})

	it('deletes stale staged restores older than seven days', async () => {
		const deleteServerRestore = vi.fn().mockResolvedValue(undefined)
		const api = {
			downloadServerBackup: vi.fn(),
			restoreServerBackup: vi.fn(),
			listServerRestores: vi.fn().mockResolvedValue({
				items: [
					{
						id: 'restore-stale',
						stagingDir: '/data/restores/restore-stale',
						stagedAt: '2026-03-01T00:00:00Z',
						manifest: buildRestoreResponse().manifest,
					},
					{
						id: 'restore-fresh',
						stagingDir: '/data/restores/restore-fresh',
						stagedAt: '2026-03-09T23:00:00Z',
						manifest: buildRestoreResponse().manifest,
					},
				],
			}),
			deleteServerRestore,
		} as unknown as APIClient
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-03-10T00:00:00Z'))

		render(<ServerSettingsSection api={api} meta={buildMeta()} isFetching={false} errorMessage={null} />)

		fireEvent.click(await screen.findByRole('button', { name: 'Delete stale restores' }))

		await waitFor(() => expect(deleteServerRestore).toHaveBeenCalledWith('restore-stale'))
		expect(deleteServerRestore).not.toHaveBeenCalledWith('restore-fresh')
		vi.useRealTimers()
	})
})
