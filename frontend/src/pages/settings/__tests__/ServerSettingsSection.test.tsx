import { message } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { APIClient } from '../../../api/client'
import type { MetaResponse, ServerPortableImportResponse, ServerRestoreResponse } from '../../../api/types'
import { ensureDomShims } from '../../../test/domShims'
import { ServerSettingsSection } from '../ServerSettingsSection'

beforeAll(() => {
	ensureDomShims()
})

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
			confidentialityMode: 'encrypted',
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
			payloadSignaturePresent: true,
			payloadSignatureVerified: true,
			payloadEncryptionPresent: true,
			payloadEncryptionDecrypted: true,
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

function buildPortableResponse(overrides: Partial<ServerPortableImportResponse> = {}): ServerPortableImportResponse {
	const base: ServerPortableImportResponse = {
		manifest: {
			format: 's3desk-server-backup/v1',
			bundleKind: 'portable' as unknown as 'full',
			confidentialityMode: 'clear',
			formatVersion: 1,
			schemaVersion: 1,
			createdAt: '2026-03-08T00:00:00Z',
			appVersion: 'test',
			dbBackend: 'sqlite',
			encryptionEnabled: true,
			encryptionKeyHint: 'hint',
			entries: ['data/profiles.jsonl'],
			entities: {
				profiles: { count: 1, sha256: 'profiles-sha' },
			},
			assets: {},
			warnings: ['Portable import verified'],
		},
		mode: 'dry_run',
		targetDbBackend: 'sqlite',
		preflight: {
			schemaReady: true,
			encryptionReady: true,
			encryptionKeyHintVerified: true,
			spaceReady: true,
			blockers: [],
			warnings: [],
		},
		entities: [
			{
				name: 'profiles',
				exportedCount: 1,
				importedCount: 1,
				checksumVerified: true,
			},
		],
		verification: {
			entityChecksumsVerified: true,
			postImportHealthCheckPassed: true,
		},
		warnings: ['Portable import verified'],
		assetStagingDir: '',
	}
	return {
		...base,
		...overrides,
		manifest: {
			...base.manifest,
			...(overrides.manifest ?? {}),
		},
		preflight: {
			...base.preflight,
			...(overrides.preflight ?? {}),
		},
		entities: overrides.entities ?? base.entities,
		verification: {
			...base.verification,
			...(overrides.verification ?? {}),
		},
	}
}

describe('ServerSettingsSection', () => {
	beforeEach(() => {
		vi.spyOn(message, 'info').mockImplementation(() => undefined as never)
		vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('uploads a restore bundle and shows the staged directory', async () => {
		const api = {
			downloadServerBackup: vi.fn(),
			restoreServerBackup: vi.fn().mockResolvedValue(buildRestoreResponse()),
			previewPortableImport: vi.fn(),
			importPortableBackup: vi.fn(),
			listServerRestores: vi.fn().mockImplementation(() => new Promise(() => {})),
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
		expect(screen.getByText(/sha256 abc123/i)).toBeInTheDocument()
		expect(screen.getByText('encrypted payload')).toBeInTheDocument()
		expect(screen.getByText('payload decrypted')).toBeInTheDocument()
	})

	it('keeps restore staging available for postgres-backed servers', () => {
		const api = {
			downloadServerBackup: vi.fn(),
			restoreServerBackup: vi.fn(),
			previewPortableImport: vi.fn(),
			importPortableBackup: vi.fn(),
			listServerRestores: vi.fn().mockImplementation(() => new Promise(() => {})),
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

		expect(screen.queryByRole('button', { name: 'Download Full backup' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Download Cache + metadata backup' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Download portable backup' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Download portable backup (encrypted)' })).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Preview portable import' })).toBeEnabled()
		expect(screen.getByRole('button', { name: 'Run portable import' })).toBeEnabled()
		expect(screen.getByRole('button', { name: 'Upload restore bundle' })).toBeEnabled()
		expect(screen.getByText(/not a Postgres backup or restore workflow/i)).toBeInTheDocument()
		expect(screen.getByText(/Use your normal database backup workflow/i)).toBeInTheDocument()
	})

	it('shows staged restore age and payload size more clearly', async () => {
		const api = {
			downloadServerBackup: vi.fn(),
			restoreServerBackup: vi.fn(),
			previewPortableImport: vi.fn(),
			importPortableBackup: vi.fn(),
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
		const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-10T00:00:00Z').valueOf())

		render(<ServerSettingsSection api={api} meta={buildMeta()} isFetching={false} errorMessage={null} />)

		expect(await screen.findByText(/1h ago/i)).toBeInTheDocument()
		expect(screen.getByText((content) => content.includes('2 files /'))).toBeInTheDocument()
		dateNowSpy.mockRestore()
	})

	it('deletes stale staged restores older than seven days', async () => {
		const deleteServerRestore = vi.fn().mockResolvedValue(undefined)
		const api = {
			downloadServerBackup: vi.fn(),
			restoreServerBackup: vi.fn(),
			previewPortableImport: vi.fn(),
			importPortableBackup: vi.fn(),
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
		const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-10T00:00:00Z').valueOf())

		render(<ServerSettingsSection api={api} meta={buildMeta()} isFetching={false} errorMessage={null} />)

		await screen.findByText('/data/restores/restore-stale')
		fireEvent.click(screen.getByRole('button', { name: 'Delete stale restores' }))

		await waitFor(() => expect(deleteServerRestore).toHaveBeenCalledWith('restore-stale'))
		expect(deleteServerRestore).not.toHaveBeenCalledWith('restore-fresh')
		dateNowSpy.mockRestore()
	})

	it('downloads portable backups in clear and encrypted modes', async () => {
		const downloadServerBackup = vi.fn().mockResolvedValue(undefined)
		const api = {
			downloadServerBackup,
			restoreServerBackup: vi.fn(),
			previewPortableImport: vi.fn(),
			importPortableBackup: vi.fn(),
			listServerRestores: vi.fn().mockImplementation(() => new Promise(() => {})),
			deleteServerRestore: vi.fn(),
		} as unknown as APIClient

		render(<ServerSettingsSection api={api} meta={buildMeta()} isFetching={false} errorMessage={null} />)

		fireEvent.click(screen.getByRole('button', { name: 'Download portable backup' }))
		fireEvent.click(screen.getByRole('button', { name: 'Download portable backup (encrypted)' }))

		await waitFor(() => expect(downloadServerBackup).toHaveBeenCalledWith('portable', 'clear'))
		await waitFor(() => expect(downloadServerBackup).toHaveBeenCalledWith('portable', 'encrypted'))
	})

	it('previews and imports portable bundles from the dedicated controls', async () => {
		const previewPortableImport = vi.fn().mockResolvedValue(
			buildPortableResponse({
				preflight: {
					schemaReady: true,
					encryptionReady: false,
					encryptionKeyHintVerified: false,
					spaceReady: true,
					blockers: ['Destination ENCRYPTION_KEY is required before import.'],
					warnings: ['Portable preview warning'],
				},
				warnings: ['Portable preview warning'],
			}),
		)
		const importPortableBackup = vi.fn().mockResolvedValue(
			buildPortableResponse({
				warnings: ['Portable import verified'],
			}),
		)
		const api = {
			downloadServerBackup: vi.fn(),
			restoreServerBackup: vi.fn(),
			previewPortableImport,
			importPortableBackup,
			listServerRestores: vi.fn().mockImplementation(() => new Promise(() => {})),
			deleteServerRestore: vi.fn(),
		} as unknown as APIClient

		const { container } = render(
			<ServerSettingsSection api={api} meta={buildMeta()} isFetching={false} errorMessage={null} />,
		)

		const inputs = container.querySelectorAll('input[type="file"]')
		if (inputs.length < 3) {
			throw new Error(`expected at least 3 file inputs, got ${inputs.length}`)
		}

		const previewFile = new File(['portable-preview'], 'portable-preview.tar.gz', { type: 'application/gzip' })
		fireEvent.change(inputs[1], { target: { files: [previewFile] } })

		await waitFor(() => expect(previewPortableImport).toHaveBeenCalledWith(previewFile))
		expect(await screen.findByText('Destination ENCRYPTION_KEY is required before import.')).toBeInTheDocument()
		expect(screen.getByText('Portable preview warning')).toBeInTheDocument()

		const importFile = new File(['portable-import'], 'portable-import.tar.gz', { type: 'application/gzip' })
		fireEvent.change(inputs[2], { target: { files: [importFile] } })

		await waitFor(() => expect(importPortableBackup).toHaveBeenCalledWith(importFile))
		expect(await screen.findAllByText('Portable import verified')).not.toHaveLength(0)
	})
})
