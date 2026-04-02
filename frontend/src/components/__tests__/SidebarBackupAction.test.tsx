import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MetaResponse, ServerPortableImportResponse } from '../../api/types'
import { ensureDomShims } from '../../test/domShims'
import { createMockApiClient } from '../../test/mockApiClient'
import { SidebarBackupAction } from '../SidebarBackupAction'

vi.mock('../../lib/confirmDangerAction', () => ({
	confirmDangerAction: vi.fn(async ({ onConfirm }: { onConfirm: () => Promise<void> | void }) => {
		await onConfirm()
	}),
}))

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

function buildPortablePreview(overrides: Partial<ServerPortableImportResponse> = {}): ServerPortableImportResponse {
	return {
		manifest: {
			format: 's3desk-server-backup/v1',
			bundleKind: 'portable',
			createdAt: '2026-03-11T00:00:00Z',
			appVersion: 'test',
			dbBackend: 'sqlite',
			encryptionEnabled: true,
			warnings: [],
		},
		mode: 'dry_run',
		targetDbBackend: 'postgres',
		preflight: {
			schemaReady: true,
			encryptionReady: true,
			encryptionKeyHintVerified: true,
			spaceReady: true,
			blockers: [],
			warnings: [],
		},
		entities: [],
		verification: {
			entityChecksumsVerified: true,
			postImportHealthCheckPassed: true,
		},
		warnings: [],
		...overrides,
	}
}

function buildRestoreResponse() {
	return {
		manifest: {
			format: 's3desk-server-backup/v1',
			bundleKind: 'full',
			createdAt: '2026-03-11T00:00:00Z',
			appVersion: 'test',
			dbBackend: 'sqlite',
			encryptionEnabled: true,
			warnings: [],
		},
		validation: {},
		stagingDir: '/data/restores/test-restore',
		restartRequired: true,
		nextSteps: [],
		warnings: [],
	}
}

function createApi(serverOverrides: Record<string, unknown> = {}) {
	return createMockApiClient({
		server: {
			downloadServerBackup: vi.fn(),
			listServerRestores: vi.fn(() => Promise.resolve({ items: [] })),
			restoreServerBackup: vi.fn(),
			previewPortableImport: vi.fn(),
			importPortableBackup: vi.fn(),
			deleteServerRestore: vi.fn(),
			...serverOverrides,
		},
	})
}

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

describe('SidebarBackupAction', () => {
	let clickSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		URL.createObjectURL = vi.fn(() => 'blob:backup')
		URL.revokeObjectURL = vi.fn()
		clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
	})

	afterEach(() => {
		URL.createObjectURL = originalCreateObjectURL
		URL.revokeObjectURL = originalRevokeObjectURL
		vi.restoreAllMocks()
	})

	it('opens a drawer with export, restore, portable import, and staged restore sections', async () => {
		const downloadServerBackup = vi.fn(() => ({
			promise: Promise.resolve({
				blob: new Blob(['backup'], { type: 'application/gzip' }),
				contentDisposition: 'attachment; filename="migration.tar.gz"',
				contentType: 'application/gzip',
			}),
			abort: vi.fn(),
		}))
		const api = createApi({
			downloadServerBackup,
		})

		render(<SidebarBackupAction api={api} meta={buildMeta()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))

		expect(await screen.findByRole('dialog', { name: 'Backup and restore' })).toBeInTheDocument()
		expect(screen.getByText('Backup export')).toBeInTheDocument()
		expect(screen.getByText('Stage restore bundle')).toBeInTheDocument()
		expect(screen.getByText('Portable import')).toBeInTheDocument()
		expect(screen.getByText('Staged restores')).toBeInTheDocument()
	})

	it('closes the drawer when the scope key changes', async () => {
		const api = createApi()
		const { rerender } = render(
			<SidebarBackupAction api={api} meta={buildMeta()} scopeKey="token-a:profile-1" />,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))

		expect(await screen.findByRole('dialog', { name: 'Backup and restore' })).toBeInTheDocument()

		rerender(<SidebarBackupAction api={api} meta={buildMeta()} scopeKey="token-b:profile-1" />)

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Backup and restore' })).not.toBeInTheDocument()
		})
	})

	it('keeps portable import disabled until a clean preview exists', async () => {
		const previewPortableImport = vi.fn(() => Promise.resolve(buildPortablePreview()))
		const downloadServerBackup = vi.fn()
		const importPortableBackup = vi.fn(() => Promise.resolve(buildPortablePreview({ mode: 'replace' })))
		const api = createApi({
			downloadServerBackup,
			previewPortableImport,
			importPortableBackup,
		})

		render(<SidebarBackupAction api={api} meta={buildMeta()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))

		const importButton = await screen.findByRole('button', { name: 'Run portable import' })
		expect(importButton).toBeDisabled()

		const previewInput = screen.getByTestId('sidebar-portable-preview-input') as HTMLInputElement
		const file = new File(['portable'], 'portable-backup.tar.gz', { type: 'application/gzip' })
		fireEvent.change(previewInput, { target: { files: [file] } })

		await waitFor(() => expect(previewPortableImport).toHaveBeenCalledTimes(1))
		await waitFor(() => expect(screen.getByRole('button', { name: 'Run portable import' })).toBeEnabled())
	})

	it('downloads the selected backup bundle from the unified export workflow', async () => {
		const downloadServerBackup = vi.fn(() => ({
			promise: Promise.resolve({
				blob: new Blob(['backup'], { type: 'application/gzip' }),
				contentDisposition: 'attachment; filename="migration.tar.gz"',
				contentType: 'application/gzip',
			}),
			abort: vi.fn(),
		}))
		const api = createApi({
			downloadServerBackup,
		})

		render(<SidebarBackupAction api={api} meta={buildMeta()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))
		fireEvent.click(await screen.findByRole('button', { name: 'Download backup' }))

		await waitFor(() => expect(downloadServerBackup).toHaveBeenCalledWith('full', 'clear', { password: undefined }))
		await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
		expect(clickSpy).toHaveBeenCalledTimes(1)
	})

	it('passes password-protected export options to the API', async () => {
		const downloadServerBackup = vi.fn(() => ({
			promise: Promise.resolve({
				blob: new Blob(['backup'], { type: 'application/gzip' }),
				contentDisposition: 'attachment; filename="migration.tar.gz"',
				contentType: 'application/gzip',
			}),
			abort: vi.fn(),
		}))
		const api = createApi({
			downloadServerBackup,
		})

		render(<SidebarBackupAction api={api} meta={buildMeta()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))
		fireEvent.click(await screen.findByText('Protect with password'))
		fireEvent.change(screen.getByPlaceholderText('Backup password'), { target: { value: 'operator-secret' } })
		fireEvent.change(screen.getByPlaceholderText('Confirm backup password'), { target: { value: 'operator-secret' } })
		fireEvent.click(screen.getByRole('button', { name: 'Download backup' }))

		await waitFor(() => expect(downloadServerBackup).toHaveBeenCalledWith('full', 'encrypted', { password: 'operator-secret' }))
	})

	it('limits postgres-backed servers to portable export', async () => {
		const downloadServerBackup = vi.fn(() => ({
			promise: Promise.resolve({
				blob: new Blob(['backup'], { type: 'application/gzip' }),
				contentDisposition: 'attachment; filename="migration.tar.gz"',
				contentType: 'application/gzip',
			}),
			abort: vi.fn(),
		}))
		const api = createApi({
			downloadServerBackup,
		})

		render(
			<SidebarBackupAction
				api={api}
				meta={buildMeta({
					dbBackend: 'postgres',
					capabilities: {
						profileTls: { enabled: true, reason: '' },
						serverBackup: {
							export: { enabled: true, reason: 'Portable backup export is available. Full and Cache + metadata exports remain sqlite-only.' },
							restoreStaging: {
								enabled: true,
								reason: 'Stages a sqlite DATA_DIR bundle for manual cutover. It does not replace a Postgres backup or restore workflow.',
							},
						},
						providers: {},
					},
				})}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))
		await screen.findByRole('dialog', { name: 'Backup and restore' })

		expect(screen.getByText('Portable export')).toBeInTheDocument()
		expect(screen.getByRole('radio', { name: 'Full' })).toBeDisabled()
		expect(screen.getByRole('radio', { name: 'Cache + metadata' })).toBeDisabled()
		expect(screen.getByRole('radio', { name: 'Portable' })).toBeEnabled()

		fireEvent.click(screen.getByRole('button', { name: 'Download backup' }))
		await waitFor(() => expect(downloadServerBackup).toHaveBeenCalledWith('portable', 'clear', { password: undefined }))
	})

	it('passes restore and portable passwords to the API', async () => {
		const restoreServerBackup = vi.fn(() => Promise.resolve(buildRestoreResponse()))
		const previewPortableImport = vi.fn(() => Promise.resolve(buildPortablePreview()))
		const importPortableBackup = vi.fn(() => Promise.resolve(buildPortablePreview({ mode: 'replace' })))
		const downloadServerBackup = vi.fn()
		const api = createApi({
			downloadServerBackup,
			restoreServerBackup,
			previewPortableImport,
			importPortableBackup,
		})

		render(<SidebarBackupAction api={api} meta={buildMeta()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))

		const restoreFile = new File(['backup'], 'server-backup.tar.gz', { type: 'application/gzip' })
		fireEvent.change(screen.getByPlaceholderText('Bundle password (optional)'), { target: { value: 'restore-secret' } })
		fireEvent.change(screen.getByTestId('sidebar-restore-input'), { target: { files: [restoreFile] } })
		await waitFor(() => expect(restoreServerBackup).toHaveBeenCalledWith(restoreFile, 'restore-secret'))

		const portableFile = new File(['portable'], 'portable-backup.tar.gz', { type: 'application/gzip' })
		fireEvent.change(screen.getByPlaceholderText('Portable bundle password (optional)'), { target: { value: 'portable-secret' } })
		fireEvent.change(screen.getByTestId('sidebar-portable-preview-input'), { target: { files: [portableFile] } })
		await waitFor(() => expect(previewPortableImport).toHaveBeenCalledWith(portableFile, 'portable-secret'))
		await waitFor(() => expect(screen.getByRole('button', { name: 'Run portable import' })).toBeEnabled())

		fireEvent.click(screen.getByRole('button', { name: 'Run portable import' }))
		await waitFor(() => expect(importPortableBackup).toHaveBeenCalledWith(portableFile, 'portable-secret'))
	})

	it('ignores stale portable preview responses after selecting a newer file', async () => {
		const firstPreview = deferred<ServerPortableImportResponse>()
		const secondPreview = deferred<ServerPortableImportResponse>()
		const previewPortableImport = vi
			.fn()
			.mockImplementationOnce(() => firstPreview.promise)
			.mockImplementationOnce(() => secondPreview.promise)
		const api = createApi({
			previewPortableImport,
		})

		render(<SidebarBackupAction api={api} meta={buildMeta()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))

		const previewInput = await screen.findByTestId('sidebar-portable-preview-input')
		const firstFile = new File(['first'], 'first-portable.tar.gz', { type: 'application/gzip' })
		const secondFile = new File(['second'], 'second-portable.tar.gz', { type: 'application/gzip' })

		fireEvent.change(previewInput, { target: { files: [firstFile] } })
		await waitFor(() => expect(previewPortableImport).toHaveBeenCalledWith(firstFile, undefined))

		fireEvent.change(previewInput, { target: { files: [secondFile] } })
		await waitFor(() => expect(previewPortableImport).toHaveBeenLastCalledWith(secondFile, undefined))

		await act(async () => {
			secondPreview.resolve(buildPortablePreview({ targetDbBackend: 'sqlite' }))
			await Promise.resolve()
		})

		await waitFor(() => expect(screen.getByText('dry_run / target sqlite')).toBeInTheDocument())

		await act(async () => {
			firstPreview.resolve(buildPortablePreview({ targetDbBackend: 'postgres' }))
			await Promise.resolve()
		})

		expect(screen.getByText('dry_run / target sqlite')).toBeInTheDocument()
		expect(screen.queryByText('dry_run / target postgres')).not.toBeInTheDocument()
	})

	it('ignores stale portable import responses after the portable password changes', async () => {
		const previewPortableImport = vi.fn(() => Promise.resolve(buildPortablePreview()))
		const importRequest = deferred<ServerPortableImportResponse>()
		const importPortableBackup = vi.fn(() => importRequest.promise)
		const api = createApi({
			previewPortableImport,
			importPortableBackup,
		})

		render(<SidebarBackupAction api={api} meta={buildMeta()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))

		fireEvent.change(screen.getByPlaceholderText('Portable bundle password (optional)'), {
			target: { value: 'portable-secret' },
		})
		const previewInput = await screen.findByTestId('sidebar-portable-preview-input')
		const portableFile = new File(['portable'], 'portable-backup.tar.gz', { type: 'application/gzip' })
		fireEvent.change(previewInput, { target: { files: [portableFile] } })

		await waitFor(() => expect(previewPortableImport).toHaveBeenCalledWith(portableFile, 'portable-secret'))
		await waitFor(() => expect(screen.getByRole('button', { name: 'Run portable import' })).toBeEnabled())

		fireEvent.click(screen.getByRole('button', { name: 'Run portable import' }))
		await waitFor(() => expect(importPortableBackup).toHaveBeenCalledWith(portableFile, 'portable-secret'))

		fireEvent.change(screen.getByPlaceholderText('Portable bundle password (optional)'), {
			target: { value: 'new-secret' },
		})
		expect(screen.queryByText('Portable import result')).not.toBeInTheDocument()
		expect(screen.queryByText('Portable preview result')).not.toBeInTheDocument()

		await act(async () => {
			importRequest.resolve(buildPortablePreview({ mode: 'replace' }))
			await Promise.resolve()
		})

		expect(screen.queryByText('Portable import result')).not.toBeInTheDocument()
		expect(screen.queryByText('replace / target postgres')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Run portable import' })).toBeDisabled()
	})

	it('ignores stale staged restore inventory responses after closing and reopening the drawer', async () => {
		const firstInventory = deferred<{ items: Array<{ id: string; stagedAt: string; stagingDir: string }> }>()
		const secondInventory = deferred<{ items: Array<{ id: string; stagedAt: string; stagingDir: string }> }>()
		const listServerRestores = vi
			.fn()
			.mockImplementationOnce(() => firstInventory.promise)
			.mockImplementationOnce(() => secondInventory.promise)
		const api = createApi({
			listServerRestores,
		})

		render(<SidebarBackupAction api={api} meta={buildMeta()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))
		await screen.findByRole('dialog', { name: 'Backup and restore' })
		await waitFor(() => expect(listServerRestores).toHaveBeenCalledTimes(1))

		fireEvent.click(screen.getByRole('button', { name: 'Close' }))
		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Backup and restore' })).not.toBeInTheDocument()
		})

		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))
		await screen.findByRole('dialog', { name: 'Backup and restore' })
		await waitFor(() => expect(listServerRestores).toHaveBeenCalledTimes(2))

		await act(async () => {
			firstInventory.resolve({
				items: [
					{
						id: 'stale-restore',
						stagedAt: '2026-03-20T00:00:00Z',
						stagingDir: '/data/restores/stale-restore',
					},
				],
			})
			await Promise.resolve()
		})

		expect(screen.queryByText('stale-restore')).not.toBeInTheDocument()

		await act(async () => {
			secondInventory.resolve({ items: [] })
			await Promise.resolve()
		})

		await waitFor(() => expect(screen.getByText('No staged restores yet.')).toBeInTheDocument())
	})

	it('ignores stale restore upload responses after closing and reopening the drawer', async () => {
		const restoreRequest = deferred<ReturnType<typeof buildRestoreResponse>>()
		const restoreServerBackup = vi.fn(() => restoreRequest.promise)
		const listServerRestores = vi.fn(() => Promise.resolve({ items: [] }))
		const api = createApi({
			restoreServerBackup,
			listServerRestores,
		})

		render(<SidebarBackupAction api={api} meta={buildMeta()} />)
		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))
		await screen.findByRole('dialog', { name: 'Backup and restore' })

		const restoreFile = new File(['backup'], 'server-backup.tar.gz', { type: 'application/gzip' })
		fireEvent.change(screen.getByTestId('sidebar-restore-input'), { target: { files: [restoreFile] } })
		await waitFor(() => expect(restoreServerBackup).toHaveBeenCalledWith(restoreFile, undefined))

		fireEvent.click(screen.getByRole('button', { name: 'Close' }))
		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Backup and restore' })).not.toBeInTheDocument()
		})

		fireEvent.click(screen.getByRole('button', { name: 'Backup' }))
		await screen.findByRole('dialog', { name: 'Backup and restore' })

		await act(async () => {
			restoreRequest.resolve(buildRestoreResponse())
			await Promise.resolve()
		})

		expect(screen.queryByText('Latest staged restore')).not.toBeInTheDocument()
		expect(screen.queryByText('/data/restores/test-restore')).not.toBeInTheDocument()
	})
})
