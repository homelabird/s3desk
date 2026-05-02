import type { MetaResponse, ServerBackupScope } from '../api/types'

type BackupCapability = {
	enabled: boolean
	reason?: string
}

export type BackupScopeAvailability = Record<ServerBackupScope, { enabled: boolean; reason?: string }>

export type BackupCapabilitySummary = {
	dbBackend: string
	backupExportCapability: BackupCapability
	restoreStagingCapability: BackupCapability
	backupScopeAvailability: BackupScopeAvailability
	backupSupported: boolean
	backupTagLabel: string
	backupExportNotice: string | null
	triggerSubtitle: string
}

export function buildBackupCapabilitySummary(meta?: MetaResponse): BackupCapabilitySummary {
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
	const exportUnavailableReason = backupExportCapability.reason || 'This server does not currently support in-product backup export.'
	const backupScopeAvailability = buildBackupScopeAvailability({
		meta,
		dbBackend,
		backupExportCapability,
		exportUnavailableReason,
	})
	const backupSupported = Object.values(backupScopeAvailability).some((scope) => scope.enabled)
	const backupTagLabel = !backupSupported
		? dbBackend
		: dbBackend === 'postgres'
			? 'Portable export'
			: 'Snapshot + portable export'
	const backupExportNotice =
		meta && backupSupported && dbBackend === 'postgres'
			? 'This server can export Portable bundles only. Full and Cache + metadata remain sqlite-only snapshot workflows.'
			: null
	const triggerSubtitle = buildTriggerSubtitle({
		meta,
		backupSupported,
		backupExportCapability,
		restoreStagingCapability,
	})

	return {
		dbBackend,
		backupExportCapability,
		restoreStagingCapability,
		backupScopeAvailability,
		backupSupported,
		backupTagLabel,
		backupExportNotice,
		triggerSubtitle,
	}
}

function buildBackupScopeAvailability(args: {
	meta?: MetaResponse
	dbBackend: string
	backupExportCapability: BackupCapability
	exportUnavailableReason: string
}): BackupScopeAvailability {
	const { meta, dbBackend, backupExportCapability, exportUnavailableReason } = args
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
}

function buildTriggerSubtitle(args: {
	meta?: MetaResponse
	backupSupported: boolean
	backupExportCapability: BackupCapability
	restoreStagingCapability: BackupCapability
}): string {
	const { meta, backupSupported, backupExportCapability, restoreStagingCapability } = args
	if (!meta) return 'Loading backup and restore status'
	if (backupSupported) return 'Unified backup export, restore staging, and portable import'
	if (restoreStagingCapability.enabled) return 'Restore staging and portable import tools'
	return backupExportCapability.reason || 'Server backup tools unavailable'
}
