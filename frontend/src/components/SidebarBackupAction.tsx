import { CloudDownloadOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Popconfirm, Radio, Spin, Tag, Typography, message } from 'antd'
import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { APIClient, ServerBackupConfidentialityMode, ServerBackupScope } from '../api/client'
import type { MetaResponse, ServerPortableImportResponse, ServerRestoreResponse, ServerStagedRestore } from '../api/types'
import { clipboardFailureHint, copyToClipboard } from '../lib/clipboard'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { formatBytes } from '../lib/transfer'
import { OverlaySheet } from './OverlaySheet'
import styles from './SidebarBackupAction.module.css'

type SidebarBackupActionProps = {
	api: APIClient
	meta?: MetaResponse
	onActionComplete?: () => void
}

type ServerRestoreValidationView = {
	payloadChecksumPresent?: boolean
	payloadChecksumVerified?: boolean
	payloadSignaturePresent?: boolean
	payloadSignatureVerified?: boolean
	payloadEncryptionPresent?: boolean
	payloadEncryptionDecrypted?: boolean
}

type BackupProtectionMode = 'clear' | 'server_key' | 'password'

type ExportSummary = {
	title: string
	includes: string[]
	notes: string[]
}

type BackupScopeAvailability = Record<ServerBackupScope, { enabled: boolean; reason?: string }>

export function SidebarBackupAction(props: SidebarBackupActionProps) {
	const [open, setOpen] = useState(false)
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
	const [stagedRestores, setStagedRestores] = useState<ServerStagedRestore[]>([])
	const [stagedRestoresLoading, setStagedRestoresLoading] = useState(false)
	const [stagedRestoresError, setStagedRestoresError] = useState<string | null>(null)
	const [deleteRestoreId, setDeleteRestoreId] = useState<string | null>(null)
	const [cleanupRestoresLoading, setCleanupRestoresLoading] = useState(false)
	const restoreInputRef = useRef<HTMLInputElement | null>(null)
	const portablePreviewInputRef = useRef<HTMLInputElement | null>(null)

	const dbBackend = props.meta?.dbBackend ?? 'sqlite'
	const serverBackupCapability = props.meta?.capabilities?.serverBackup
	const backupExportCapability = serverBackupCapability?.export ?? {
		enabled: props.meta ? dbBackend === 'sqlite' || dbBackend === 'postgres' : false,
		reason: props.meta
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
	const backupEncryptionAvailable = props.meta?.encryptionEnabled ?? false
	const backupConfidentiality: ServerBackupConfidentialityMode = backupProtection === 'clear' ? 'clear' : 'encrypted'
	const backupScopeAvailability = useMemo<BackupScopeAvailability>(() => {
		const exportUnavailableReason = backupExportCapability.reason || 'This server does not currently support in-product backup export.'
		if (!props.meta || !backupExportCapability.enabled) {
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
	}, [backupExportCapability.enabled, backupExportCapability.reason, dbBackend, props.meta])
	const backupSupported = Object.values(backupScopeAvailability).some((scope) => scope.enabled)
	const backupTagLabel = !backupSupported
		? dbBackend
		: dbBackend === 'postgres'
			? 'Portable export'
			: 'Snapshot + portable export'
	const backupExportNotice = useMemo(() => {
		if (!props.meta || !backupSupported) return null
		if (dbBackend === 'postgres') {
			return 'This server can export Portable bundles only. Full and Cache + metadata remain sqlite-only snapshot workflows.'
		}
		return null
	}, [backupSupported, dbBackend, props.meta])

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

	const refreshStagedRestores = useCallback(async () => {
		setStagedRestoresLoading(true)
		setStagedRestoresError(null)
		try {
			const result = await props.api.listServerRestores()
			setStagedRestores(result.items ?? [])
		} catch (err) {
			setStagedRestoresError(formatErr(err))
		} finally {
			setStagedRestoresLoading(false)
		}
	}, [props.api])

	useEffect(() => {
		if (!open || !props.meta) return
		void refreshStagedRestores()
	}, [open, props.meta, refreshStagedRestores])

	const triggerSubtitle = useMemo(() => {
		if (!props.meta) return 'Loading backup and restore status'
		if (backupSupported) return 'Unified backup export, restore staging, and portable import'
		if (restoreStagingCapability.enabled) return 'Restore staging and portable import tools'
		return backupExportCapability.reason || 'Server backup tools unavailable'
	}, [backupExportCapability.reason, backupSupported, props.meta, restoreStagingCapability.enabled])

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

	const handleDownload = async () => {
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
			const { promise } = props.api.downloadServerBackup(backupScope, backupConfidentiality, {
				password: backupProtection === 'password' ? backupPassword : undefined,
			})
			const result = await promise
			const filename = filenameFromContentDisposition(result.contentDisposition) ?? buildBackupFilenameFallback(backupScope, backupConfidentiality)
			saveBlob(result.blob, filename)
			props.onActionComplete?.()
		} catch (err) {
			setErrorMessage(formatErr(err))
		} finally {
			setLoadingScope(null)
		}
	}

	const handleRestoreInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return
		setRestoreLoading(true)
		setRestoreError(null)
		setRestoreResult(null)
		try {
			const result = await props.api.restoreServerBackup(file, restorePassword || undefined)
			setRestoreResult(result)
			await refreshStagedRestores()
		} catch (err) {
			setRestoreError(formatErr(err))
		} finally {
			setRestoreLoading(false)
		}
	}

	const handlePortablePasswordChange = (value: string) => {
		setPortablePassword(value)
		setPortablePreview(null)
		setPortableImportResult(null)
	}

	const handlePortablePreviewInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return
		setPortableLoading('preview')
		setPortableError(null)
		setPortablePreview(null)
		setPortableImportResult(null)
		try {
			const result = await props.api.previewPortableImport(file, portablePassword || undefined)
			setPortableDraftFile(file)
			setPortablePreview(result)
		} catch (err) {
			setPortableError(formatErr(err))
			setPortableDraftFile(null)
		} finally {
			setPortableLoading(null)
		}
	}

	const handlePortableImport = async () => {
		if (!portableDraftFile) return
		setPortableLoading('import')
		setPortableError(null)
		try {
			const result = await props.api.importPortableBackup(portableDraftFile, portablePassword || undefined)
			setPortableImportResult(result)
		} catch (err) {
			setPortableError(formatErr(err))
		} finally {
			setPortableLoading(null)
		}
	}

	const handleDeleteRestore = async (restoreId: string) => {
		setDeleteRestoreId(restoreId)
		setStagedRestoresError(null)
		try {
			await props.api.deleteServerRestore(restoreId)
			setRestoreResult((current) => (current?.stagingDir.endsWith(`/${restoreId}`) ? null : current))
			await refreshStagedRestores()
		} catch (err) {
			setStagedRestoresError(formatErr(err))
		} finally {
			setDeleteRestoreId(null)
		}
	}

	const staleRestoreCutoffMs = 7 * 24 * 60 * 60 * 1000
	const isRestoreStale = (stagedAt: string) => {
		const time = Date.parse(stagedAt)
		return Number.isFinite(time) && Date.now() - time >= staleRestoreCutoffMs
	}

	const handleDeleteStaleRestores = async () => {
		const staleIds = stagedRestores.filter((item) => isRestoreStale(item.stagedAt)).map((item) => item.id)
		if (staleIds.length === 0) return
		setCleanupRestoresLoading(true)
		setStagedRestoresError(null)
		try {
			await Promise.all(staleIds.map((restoreId) => props.api.deleteServerRestore(restoreId)))
			await refreshStagedRestores()
		} catch (err) {
			setStagedRestoresError(formatErr(err))
		} finally {
			setCleanupRestoresLoading(false)
		}
	}

	const formatRestoreAge = (stagedAt: string) => {
		const time = Date.parse(stagedAt)
		if (!Number.isFinite(time)) return stagedAt
		const deltaMs = Date.now() - time
		if (deltaMs < 60_000) return 'just now'
		const deltaMinutes = Math.floor(deltaMs / 60_000)
		if (deltaMinutes < 60) return `${deltaMinutes}m ago`
		const deltaHours = Math.floor(deltaMinutes / 60)
		if (deltaHours < 48) return `${deltaHours}h ago`
		return `${Math.floor(deltaHours / 24)}d ago`
	}

	const handleCopy = async (label: string, text: string) => {
		try {
			await copyToClipboard(text)
			message.success(`${label} copied.`)
		} catch (err) {
			void err
			message.error(clipboardFailureHint())
		}
	}

	const restoreValidation = (restoreResult as (ServerRestoreResponse & { validation?: ServerRestoreValidationView }) | null)?.validation
	const portableSummary = portableImportResult ?? portablePreview
	const portablePreviewReady = Boolean(
		portableDraftFile
			&& portablePreview
			&& portablePreview.mode === 'dry_run'
			&& !(portablePreview.preflight.blockers?.length),
	)
	const staleRestoreCount = stagedRestores.filter((item) => isRestoreStale(item.stagedAt)).length

	return (
		<>
			<button
				type="button"
				className={styles.trigger}
				onClick={() => setOpen(true)}
				aria-label="Backup"
				aria-expanded={open}
				aria-haspopup="dialog"
			>
				<span className={styles.triggerIcon} aria-hidden="true">
					<CloudDownloadOutlined />
				</span>
				<span className={styles.triggerCopy}>
					<span className={styles.triggerTitle}>Backup</span>
					<span className={styles.triggerSubtitle}>{triggerSubtitle}</span>
				</span>
			</button>
			<OverlaySheet
				open={open}
				onClose={() => setOpen(false)}
				title="Backup and restore"
				placement="right"
				width="min(92vw, 560px)"
				extra={
					<div className={styles.statusRow}>
						{backupSupported ? <Tag color="blue">{backupTagLabel}</Tag> : <Tag color="warning">{backupTagLabel}</Tag>}
						{staleRestoreCount > 0 ? <Tag color="warning">{staleRestoreCount} stale</Tag> : null}
					</div>
				}
			>
				<div className={styles.panel}>
					<div className={styles.panelHeader}>
						<Typography.Text type="secondary">
							Use this drawer for backup export, restore staging, portable migration, and staged restore cleanup.
						</Typography.Text>
					</div>

					<div className={styles.section}>
						<Typography.Text strong>Backup export</Typography.Text>
						<Typography.Text type="secondary">
							Choose one bundle type, then download it with optional payload protection.
						</Typography.Text>
						<div>
							<Radio.Group value={backupScope} onChange={(event) => setBackupScope(event.target.value as ServerBackupScope)}>
								<Radio.Button value="full" disabled={!backupScopeAvailability.full.enabled}>Full</Radio.Button>
								<Radio.Button value="cache_metadata" disabled={!backupScopeAvailability.cache_metadata.enabled}>Cache + metadata</Radio.Button>
								<Radio.Button value="portable" disabled={!backupScopeAvailability.portable.enabled}>Portable</Radio.Button>
							</Radio.Group>
						</div>
						{backupExportNotice ? <Typography.Text type="secondary">{backupExportNotice}</Typography.Text> : null}
						<Alert
							type="info"
							showIcon
							title={exportSummary.title}
							description={
								<div>
									<ul>
										{exportSummary.includes.map((item) => <li key={item}>{item}</li>)}
									</ul>
									{exportSummary.notes.length ? (
										<ul>
											{exportSummary.notes.map((item) => <li key={item}>{item}</li>)}
										</ul>
									) : null}
								</div>
							}
						/>
						<div>
							<Radio.Group value={backupProtection} onChange={(event) => setBackupProtection(event.target.value as BackupProtectionMode)}>
								<Radio value="clear">Clear archive</Radio>
								{backupEncryptionAvailable ? <Radio value="server_key">Use server ENCRYPTION_KEY</Radio> : null}
								<Radio value="password">Protect with password</Radio>
							</Radio.Group>
						</div>
						{backupProtection === 'password' ? (
							<div className={styles.actions}>
								<Input.Password placeholder="Backup password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} />
								<Input.Password placeholder="Confirm backup password" value={backupPasswordConfirm} onChange={(event) => setBackupPasswordConfirm(event.target.value)} />
							</div>
						) : null}
						<Alert type={backupProtection === 'clear' ? 'warning' : 'info'} showIcon title="Payload protection" description={protectionSummary} />
						<div className={styles.actions}>
							<Button type="primary" loading={loadingScope === backupScope} disabled={!backupSupported || !backupScopeAvailability[backupScope].enabled || loadingScope !== null} onClick={() => void handleDownload()}>
								Download backup
							</Button>
						</div>
						{!backupSupported ? <Alert type="warning" showIcon title="Backup export unavailable" description={backupExportCapability.reason || 'This server does not currently support in-product backup export.'} /> : null}
						{errorMessage ? <Alert type="error" showIcon title="Backup download failed" description={errorMessage} /> : null}
					</div>

					<div className={styles.section}>
						<Typography.Text strong>Stage restore bundle</Typography.Text>
						<Typography.Text type="secondary">
							Upload a backup bundle to stage a restorable <Typography.Text code>DATA_DIR</Typography.Text>. If the bundle used password protection, enter the same password here.
						</Typography.Text>
						<Input.Password placeholder="Bundle password (optional)" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} />
						<div className={styles.actions}>
							<Button loading={restoreLoading} disabled={!restoreStagingCapability.enabled} onClick={() => restoreInputRef.current?.click()}>
								Upload restore bundle
							</Button>
						</div>
						{restoreStagingCapability.reason ? <Typography.Text type="secondary">{restoreStagingCapability.reason}</Typography.Text> : null}
						{restoreError ? <Alert type="error" showIcon title="Restore action failed" description={restoreError} /> : null}
						{restoreResult ? (
							<div className={styles.resultCard}>
								<Typography.Text strong>Latest staged restore</Typography.Text>
								<Typography.Text code className={styles.codeWrap}>{restoreResult.stagingDir}</Typography.Text>
								<Typography.Text type="secondary">
									{restoreResult.manifest.bundleKind} / {restoreResult.manifest.dbBackend}
									{restoreResult.manifest.confidentialityMode ? ` / ${restoreResult.manifest.confidentialityMode}` : ''}
								</Typography.Text>
								{restoreValidation ? <Typography.Text type="secondary">{restoreValidation.payloadChecksumPresent ? (restoreValidation.payloadChecksumVerified ? 'checksum verified' : 'checksum not verified') : 'checksum absent'} / {restoreValidation.payloadSignaturePresent ? (restoreValidation.payloadSignatureVerified ? 'signature verified' : 'signature not verified') : 'signature absent'} / {restoreValidation.payloadEncryptionPresent ? (restoreValidation.payloadEncryptionDecrypted ? 'payload decrypted' : 'payload not decrypted') : 'payload clear'}</Typography.Text> : null}
								<div className={styles.inlineActions}>
									<Button size="small" onClick={() => void handleCopy('Staging path', restoreResult.stagingDir)}>Copy staging path</Button>
									{restoreResult.helperCommand ? <Button size="small" onClick={() => void handleCopy('Helper command', restoreResult.helperCommand ?? '')}>Copy helper command</Button> : null}
									{restoreResult.applyPlan?.length ? <Button size="small" onClick={() => void handleCopy('Apply plan', restoreResult.applyPlan?.join('\n') ?? '')}>Copy apply plan</Button> : null}
								</div>
							</div>
						) : null}
						<input ref={restoreInputRef} data-testid="sidebar-restore-input" type="file" accept=".tar.gz,.tgz,application/gzip,application/x-gzip" onChange={(event) => void handleRestoreInputChange(event)} style={{ display: 'none' }} />
					</div>

					<div className={styles.section}>
						<Typography.Text strong>Portable import</Typography.Text>
						<Typography.Text type="secondary">
							Preview first, then confirm import. If the portable bundle used password protection, supply the same password before previewing.
						</Typography.Text>
						<Input.Password placeholder="Portable bundle password (optional)" value={portablePassword} onChange={(event) => handlePortablePasswordChange(event.target.value)} />
						<div className={styles.actions}>
							<Button loading={portableLoading === 'preview'} onClick={() => portablePreviewInputRef.current?.click()}>
								Preview portable import
							</Button>
								<Button
								type="primary"
								disabled={!portablePreviewReady || portableLoading !== null}
								loading={portableLoading === 'import'}
								onClick={() => {
									void confirmDangerAction({
										title: 'Run portable import?',
										description: 'This replaces portable entities in the destination database with the contents of the uploaded bundle.',
										okText: 'Run import',
										confirmText: 'IMPORT',
										confirmHint: 'Type "IMPORT" to confirm',
										onConfirm: () => handlePortableImport(),
									})
								}}
							>
								Run portable import
							</Button>
						</div>
						<Typography.Text type="secondary">Portable export always includes logical entities. Thumbnail assets are included under <Typography.Text code>assets/thumbnails</Typography.Text> in clear bundles and inside <Typography.Text code>payload.enc</Typography.Text> when protected.</Typography.Text>
						{portableError ? <Alert type="error" showIcon title="Portable migration failed" description={portableError} /> : null}
						{portableSummary ? (
							<div className={styles.resultCard}>
								<Typography.Text strong>{portableImportResult ? 'Portable import result' : 'Portable preview result'}</Typography.Text>
								<Typography.Text type="secondary">
									{portableSummary.mode} / target {portableSummary.targetDbBackend}
								</Typography.Text>
								<Typography.Text type="secondary">
									preflight: schema {portableSummary.preflight.schemaReady ? 'ready' : 'blocked'}, encryption {portableSummary.preflight.encryptionReady ? 'ready' : 'blocked'}, space {portableSummary.preflight.spaceReady ? 'ready' : 'blocked'}
								</Typography.Text>
								{portableSummary.preflight.blockers?.length ? (
									<Alert type="warning" showIcon title="Import blockers" description={<ul>{portableSummary.preflight.blockers.map((item) => <li key={item}>{item}</li>)}</ul>} />
								) : null}
								{portableSummary.warnings?.length ? (
									<Alert type="info" showIcon title="Warnings" description={<ul>{portableSummary.warnings.map((item) => <li key={item}>{item}</li>)}</ul>} />
								) : null}
								<div className={styles.inlineActions}>
									{portableSummary.preflight.blockers?.length ? <Button size="small" onClick={() => void handleCopy('Blockers', portableSummary.preflight.blockers?.join('\n') ?? '')}>Copy blockers</Button> : null}
									{portableSummary.warnings?.length ? <Button size="small" onClick={() => void handleCopy('Warnings', portableSummary.warnings?.join('\n') ?? '')}>Copy warnings</Button> : null}
								</div>
							</div>
						) : null}
						<input ref={portablePreviewInputRef} data-testid="sidebar-portable-preview-input" type="file" accept=".tar.gz,.tgz,application/gzip,application/x-gzip" onChange={(event) => void handlePortablePreviewInputChange(event)} style={{ display: 'none' }} />
					</div>

					<div className={styles.section}>
						<div className={styles.inventoryHeader}>
							<div>
								<Typography.Text strong>Staged restores</Typography.Text>
								<Typography.Text type="secondary">Keep the active validation bundle and at most one rollback candidate.</Typography.Text>
							</div>
							<div className={styles.inlineActions}>
								<Button size="small" onClick={() => void refreshStagedRestores()} disabled={stagedRestoresLoading}>Refresh</Button>
								<Popconfirm title="Delete stale staged restores?" description="This removes restores older than 7 days from the staged inventory." okText="Delete stale" okButtonProps={{ danger: true, loading: cleanupRestoresLoading }} onConfirm={() => void handleDeleteStaleRestores()} disabled={staleRestoreCount === 0}>
									<Button size="small" danger disabled={staleRestoreCount === 0}>
										Delete stale
									</Button>
								</Popconfirm>
							</div>
						</div>
						{stagedRestoresError ? <Alert type="error" showIcon title="Failed to load staged restores" description={stagedRestoresError} /> : null}
						{stagedRestoresLoading ? <div className={styles.loadingRow}><Spin size="small" /> <Typography.Text type="secondary">Loading staged restores…</Typography.Text></div> : null}
						{!stagedRestoresLoading && stagedRestores.length === 0 ? <Typography.Text type="secondary">No staged restores yet.</Typography.Text> : null}
						{stagedRestores.map((item) => {
							const stale = isRestoreStale(item.stagedAt)
							const manifest = item.manifest
							const payloadSizeLabel = manifest?.payloadBytes != null ? formatBytes(manifest.payloadBytes) : 'size unknown'
							return (
								<div key={item.id} className={styles.inventoryItem}>
									<div className={styles.inventoryHeader}>
										<div className={styles.inventoryTitle}>
											<Typography.Text strong>{item.id}</Typography.Text>
											<div className={styles.statusRow}>
												{manifest ? <Tag>{manifest.bundleKind}</Tag> : null}
												{manifest ? <Tag>{manifest.dbBackend}</Tag> : null}
												{manifest?.confidentialityMode ? <Tag color="processing">{manifest.confidentialityMode}</Tag> : null}
												{stale ? <Tag color="warning">stale</Tag> : null}
											</div>
										</div>
										<div className={styles.inlineActions}>
											<Button size="small" onClick={() => void handleCopy('Staging path', item.stagingDir)}>Copy path</Button>
											<Popconfirm title="Delete staged restore?" description="This removes only the staged directory. It does not touch the running server." okText="Delete" okButtonProps={{ danger: true, loading: deleteRestoreId === item.id }} onConfirm={() => void handleDeleteRestore(item.id)}>
												<Button size="small" danger loading={deleteRestoreId === item.id}>Delete</Button>
											</Popconfirm>
										</div>
									</div>
									<Typography.Text type="secondary">{formatRestoreAge(item.stagedAt)} · {payloadSizeLabel} · {item.stagingDir}</Typography.Text>
								</div>
							)
						})}
					</div>
				</div>
			</OverlaySheet>
		</>
	)
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
