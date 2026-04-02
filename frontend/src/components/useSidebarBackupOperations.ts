import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { APIClient, ServerBackupConfidentialityMode, ServerBackupScope } from '../api/client'
import type { MetaResponse, ServerPortableImportResponse, ServerRestoreResponse } from '../api/types'
import { formatErrorWithHint as formatErr } from '../lib/errors'

type BackupProtectionMode = 'clear' | 'server_key' | 'password'

type ServerRestoreValidationView = {
	payloadChecksumPresent?: boolean
	payloadChecksumVerified?: boolean
	payloadSignaturePresent?: boolean
	payloadSignatureVerified?: boolean
	payloadEncryptionPresent?: boolean
	payloadEncryptionDecrypted?: boolean
}

type ExportSummary = {
	title: string
	includes: string[]
	notes: string[]
}

type BackupScopeAvailability = Record<ServerBackupScope, { enabled: boolean; reason?: string }>

type UseSidebarBackupOperationsArgs = {
	api: APIClient
	meta?: MetaResponse
	onActionComplete?: () => void
	refreshStagedRestores: () => Promise<void>
}

export function useSidebarBackupOperations(args: UseSidebarBackupOperationsArgs) {
	const { api, meta, onActionComplete, refreshStagedRestores } = args
	const [backupScope, setBackupScope] = useState<ServerBackupScope>('full')
	const [backupProtection, setBackupProtection] = useState<BackupProtectionMode>('clear')
	const [backupPassword, setBackupPassword] = useState('')
	const [backupPasswordConfirm, setBackupPasswordConfirm] = useState('')
	const [loadingScope, setLoadingScope] = useState<ServerBackupScope | null>(null)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [restoreLoading, setRestoreLoading] = useState(false)
	const [restoreError, setRestoreError] = useState<string | null>(null)
	const [restorePassword, setRestorePassword] = useState('')
	const [restoreResult, setRestoreResult] = useState<ServerRestoreResponse | null>(null)
	const [portableLoading, setPortableLoading] = useState<'preview' | 'import' | null>(null)
	const [portableError, setPortableError] = useState<string | null>(null)
	const [portablePassword, setPortablePassword] = useState('')
	const [portableDraftFile, setPortableDraftFile] = useState<File | null>(null)
	const [portablePreview, setPortablePreview] = useState<ServerPortableImportResponse | null>(null)
	const [portableImportResult, setPortableImportResult] = useState<ServerPortableImportResponse | null>(null)
	const portableRequestTokenRef = useRef(0)
	const restoreRequestTokenRef = useRef(0)

	const dbBackend = meta?.dbBackend ?? 'sqlite'
	const serverBackupCapability = meta?.capabilities?.serverBackup
	const backupExportCapability = serverBackupCapability?.export ?? {
		enabled: !!meta && (dbBackend === 'sqlite' || dbBackend === 'postgres'),
		reason: meta
			? dbBackend === 'sqlite'
				? 'Full, Cache + metadata, and Portable export are available on sqlite-backed servers.'
				: 'Portable backup export is available. Full and Cache + metadata exports remain sqlite-only.'
			: 'Loading server capabilities.',
	}
	const restoreStagingCapability = serverBackupCapability?.restoreStaging ?? {
		enabled: true,
		reason:
			dbBackend === 'sqlite'
				? ''
				: 'Stages a sqlite DATA_DIR bundle only; this is not a Postgres backup or restore workflow.',
	}
	const backupEncryptionAvailable = meta?.encryptionEnabled ?? false
	const backupConfidentiality: ServerBackupConfidentialityMode = backupProtection === 'clear' ? 'clear' : 'encrypted'
	const backupScopeAvailability = useMemo<BackupScopeAvailability>(() => {
		const exportUnavailableReason = backupExportCapability.reason || 'This server does not currently support in-product backup export.'
		if (!meta || !backupExportCapability.enabled) {
			return {
				full: { enabled: false, reason: exportUnavailableReason },
				cache_metadata: { enabled: false, reason: exportUnavailableReason },
				portable: { enabled: false, reason: exportUnavailableReason },
			}
		}
		if (dbBackend === 'postgres') {
			const sqliteSnapshotReason = 'Full and Cache + metadata exports are sqlite-only snapshots. Use Portable backup for postgres-source migration.'
			return {
				full: { enabled: false, reason: sqliteSnapshotReason },
				cache_metadata: { enabled: false, reason: sqliteSnapshotReason },
				portable: { enabled: true },
			}
		}
		return {
			full: { enabled: true },
			cache_metadata: { enabled: true },
			portable: { enabled: true },
		}
	}, [backupExportCapability.enabled, backupExportCapability.reason, dbBackend, meta])
	const backupSupported = Object.values(backupScopeAvailability).some((scope) => scope.enabled)
	const backupTagLabel = !backupSupported
		? dbBackend
		: dbBackend === 'postgres'
			? 'Portable export'
			: 'Snapshot + portable export'
	const backupExportNotice = useMemo(() => {
		if (!meta || !backupSupported) return null
		if (dbBackend === 'postgres') {
			return 'This server can export Portable bundles only. Full and Cache + metadata remain sqlite-only snapshot workflows.'
		}
		return null
	}, [backupSupported, dbBackend, meta])

	useEffect(() => {
		if (backupProtection === 'server_key' && !backupEncryptionAvailable) {
			setBackupProtection('clear')
		}
	}, [backupEncryptionAvailable, backupProtection])

	useEffect(() => {
		if (backupScopeAvailability[backupScope].enabled) return
		const nextScope = (['portable', 'full', 'cache_metadata'] as const).find((scope) => backupScopeAvailability[scope].enabled)
		if (nextScope) {
			setBackupScope(nextScope)
		}
	}, [backupScope, backupScopeAvailability])

	const triggerSubtitle = useMemo(() => {
		if (!meta) return 'Loading backup and restore status'
		if (backupSupported) return 'Unified backup export, restore staging, and portable import'
		if (restoreStagingCapability.enabled) return 'Restore staging and portable import tools'
		return backupExportCapability.reason || 'Server backup tools unavailable'
	}, [backupExportCapability.reason, backupSupported, meta, restoreStagingCapability.enabled])

	const exportSummary = useMemo<ExportSummary>(() => {
		switch (backupScope) {
			case 'cache_metadata':
				return {
					title: 'Cache + metadata backup',
					includes: ['SQLite database snapshot', 'Thumbnail cache under data/thumbnails'],
					notes: ['Logs, artifacts, and staged restore directories are excluded.', 'This snapshot-style bundle is available only on sqlite-backed source servers.'],
				}
			case 'portable':
				return {
					title: 'Portable backup',
					includes: ['Logical JSONL export for profiles, jobs, uploads, object index, and favorites', 'Thumbnail assets under assets/thumbnails'],
					notes: ['Portable bundles are intended for cross-backend migration such as sqlite -> postgres and postgres -> sqlite.', 'Logs, artifacts, and staged restore directories are excluded.'],
				}
			default:
				return {
					title: 'Full backup',
					includes: ['SQLite database snapshot', 'Thumbnail cache', 'Logs', 'Artifacts', 'Staging directories'],
					notes: ['Use this for same-backend host recovery or full sqlite DATA_DIR migration.', 'This snapshot-style bundle is available only on sqlite-backed source servers.'],
				}
		}
	}, [backupScope])

	const protectionSummary = useMemo(() => {
		if (backupProtection === 'password') {
			return 'The archive will keep manifest.json visible, but the payload contents are encrypted into payload.enc and require the same password during restore or portable import.'
		}
		if (backupProtection === 'server_key') {
			return 'The payload will be encrypted into payload.enc and can be restored only on a server that has the same ENCRYPTION_KEY.'
		}
		return 'The backup archive remains readable as a clear tar.gz bundle.'
	}, [backupProtection])

	const handleDownload = useCallback(async () => {
		if (!backupSupported || !backupScopeAvailability[backupScope].enabled) return
		if (backupProtection === 'password') {
			if (!backupPassword) {
				setErrorMessage('Enter a backup password before exporting a password-protected bundle.')
				return
			}
			if (backupPassword !== backupPasswordConfirm) {
				setErrorMessage('Backup password confirmation does not match.')
				return
			}
		}
		setLoadingScope(backupScope)
		setErrorMessage(null)
		try {
			const { promise } = api.server.downloadServerBackup(backupScope, backupConfidentiality, {
				password: backupProtection === 'password' ? backupPassword : undefined,
			})
			const result = await promise
			const filename = filenameFromContentDisposition(result.contentDisposition) ?? buildBackupFilenameFallback(backupScope, backupConfidentiality)
			saveBlob(result.blob, filename)
			onActionComplete?.()
		} catch (err) {
			setErrorMessage(formatErr(err))
		} finally {
			setLoadingScope(null)
		}
	}, [api, backupConfidentiality, backupPassword, backupPasswordConfirm, backupProtection, backupScope, backupScopeAvailability, backupSupported, onActionComplete])

	const handleRestoreFileSelect = useCallback(async (file: File | null) => {
		if (!file) return
		const requestToken = restoreRequestTokenRef.current + 1
		restoreRequestTokenRef.current = requestToken
		setRestoreLoading(true)
		setRestoreError(null)
		setRestoreResult(null)
		try {
			const result = await api.server.restoreServerBackup(file, restorePassword || undefined)
			if (restoreRequestTokenRef.current !== requestToken) return
			setRestoreResult(result)
			await refreshStagedRestores()
		} catch (err) {
			if (restoreRequestTokenRef.current !== requestToken) return
			setRestoreError(formatErr(err))
		} finally {
			if (restoreRequestTokenRef.current === requestToken) {
				setRestoreLoading(false)
			}
		}
	}, [api, refreshStagedRestores, restorePassword])

	const handlePortablePasswordChange = useCallback((value: string) => {
		portableRequestTokenRef.current += 1
		setPortableLoading(null)
		setPortablePassword(value)
		setPortableError(null)
		setPortableDraftFile(null)
		setPortablePreview(null)
		setPortableImportResult(null)
	}, [])

	const handlePortablePreviewFileSelect = useCallback(async (file: File | null) => {
		if (!file) return
		const requestToken = portableRequestTokenRef.current + 1
		portableRequestTokenRef.current = requestToken
		setPortableLoading('preview')
		setPortableError(null)
		setPortableDraftFile(null)
		setPortablePreview(null)
		setPortableImportResult(null)
		try {
			const result = await api.server.previewPortableImport(file, portablePassword || undefined)
			if (portableRequestTokenRef.current !== requestToken) return
			setPortableDraftFile(file)
			setPortablePreview(result)
		} catch (err) {
			if (portableRequestTokenRef.current !== requestToken) return
			setPortableError(formatErr(err))
			setPortableDraftFile(null)
		} finally {
			if (portableRequestTokenRef.current === requestToken) {
				setPortableLoading(null)
			}
		}
	}, [api, portablePassword])

	const handlePortableImport = useCallback(async () => {
		if (!portableDraftFile) return
		const requestToken = portableRequestTokenRef.current + 1
		portableRequestTokenRef.current = requestToken
		const currentFile = portableDraftFile
		const currentPassword = portablePassword || undefined
		setPortableLoading('import')
		setPortableError(null)
		setPortableImportResult(null)
		try {
			const result = await api.server.importPortableBackup(currentFile, currentPassword)
			if (portableRequestTokenRef.current !== requestToken) return
			setPortableImportResult(result)
		} catch (err) {
			if (portableRequestTokenRef.current !== requestToken) return
			setPortableError(formatErr(err))
		} finally {
			if (portableRequestTokenRef.current === requestToken) {
				setPortableLoading(null)
			}
		}
	}, [api, portableDraftFile, portablePassword])

	const resetAsyncState = useCallback(() => {
		portableRequestTokenRef.current += 1
		restoreRequestTokenRef.current += 1
		setPortableLoading(null)
		setRestoreLoading(false)
	}, [])

	const restoreValidation = (restoreResult as (ServerRestoreResponse & { validation?: ServerRestoreValidationView }) | null)?.validation
	const portableSummary = portableImportResult ?? portablePreview
	const portablePreviewReady = Boolean(
		portableDraftFile
			&& portablePreview
			&& portablePreview.mode === 'dry_run'
			&& !(portablePreview.preflight.blockers?.length),
	)

	return {
		backupScope,
		setBackupScope,
		backupProtection,
		setBackupProtection,
		backupPassword,
		setBackupPassword,
		backupPasswordConfirm,
		setBackupPasswordConfirm,
		backupScopeAvailability,
		backupSupported,
		backupTagLabel,
		backupExportNotice,
		triggerSubtitle,
		exportSummary,
		protectionSummary,
		backupEncryptionAvailable,
		backupConfidentiality,
		backupExportCapability,
		restoreStagingCapability,
		loadingScope,
		errorMessage,
		handleDownload,
		restoreLoading,
		restoreError,
		restorePassword,
		setRestorePassword,
		restoreResult,
		setRestoreResult,
		restoreValidation,
		handleRestoreFileSelect,
		portableLoading,
		portableError,
		portablePassword,
		handlePortablePasswordChange,
		portableDraftFile,
		portablePreview,
		portableImportResult,
		portableSummary,
		portablePreviewReady,
		handlePortablePreviewFileSelect,
		handlePortableImport,
		resetAsyncState,
	}
}

function filenameFromContentDisposition(header: string | null): string | null {
	if (!header) return null
	const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i)
	if (utf8Match?.[1]) {
		try {
			return decodeURIComponent(utf8Match[1])
		} catch {
			return utf8Match[1]
		}
	}
	const quotedMatch = header.match(/filename="([^"]+)"/i)
	if (quotedMatch?.[1]) return quotedMatch[1]
	const plainMatch = header.match(/filename=([^;]+)/i)
	return plainMatch?.[1]?.trim() ?? null
}

function buildBackupFilenameFallback(scope: ServerBackupScope, confidentiality: ServerBackupConfidentialityMode): string {
	const suffix = confidentiality === 'encrypted' ? '-encrypted' : ''
	switch (scope) {
		case 'cache_metadata':
			return `s3desk-cache-metadata-backup${suffix}.tar.gz`
		case 'portable':
			return `s3desk-portable-backup${suffix}.tar.gz`
		default:
			return `s3desk-full-backup${suffix}.tar.gz`
	}
}

function saveBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	setTimeout(() => URL.revokeObjectURL(url), 0)
}
