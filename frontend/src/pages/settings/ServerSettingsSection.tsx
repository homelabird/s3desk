import { InfoCircleOutlined } from '@ant-design/icons'
import { Alert, Button, Collapse, Descriptions, Popconfirm, Space, Spin, Tag, Tooltip, Typography, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { APIClient } from '../../api/client'
import type { MetaResponse } from '../../api/types'
import type { ServerPortableImportResponse } from '../../api/types'
import type { ServerRestoreResponse } from '../../api/types'
import type { ServerStagedRestore } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { formatBytes } from '../../lib/transfer'
import styles from '../SettingsPage.module.css'

type ServerSettingsSectionProps = {
	api: APIClient
	meta: MetaResponse | undefined
	isFetching: boolean
	errorMessage: string | null
}

type ServerRestoreValidationView = {
	preflightChecked?: boolean
	diskFreeBytesBefore?: number
	payloadFileCount?: number
	payloadBytes?: number
	payloadChecksumPresent?: boolean
	payloadChecksumVerified?: boolean
	payloadSignaturePresent?: boolean
	payloadSignatureVerified?: boolean
	payloadEncryptionPresent?: boolean
	payloadEncryptionDecrypted?: boolean
}

export function ServerSettingsSection(props: ServerSettingsSectionProps) {
	const restoreInputRef = useRef<HTMLInputElement | null>(null)
	const portablePreviewInputRef = useRef<HTMLInputElement | null>(null)
	const portableImportInputRef = useRef<HTMLInputElement | null>(null)
	const isMountedRef = useRef(true)
	const [restoreLoading, setRestoreLoading] = useState(false)
	const [restoreError, setRestoreError] = useState<string | null>(null)
	const [restoreResult, setRestoreResult] = useState<ServerRestoreResponse | null>(null)
	const [portableDownloadLoading, setPortableDownloadLoading] = useState<'clear' | 'encrypted' | null>(null)
	const [portableLoading, setPortableLoading] = useState<'preview' | 'import' | null>(null)
	const [portableError, setPortableError] = useState<string | null>(null)
	const [portableResult, setPortableResult] = useState<ServerPortableImportResponse | null>(null)
	const [stagedRestores, setStagedRestores] = useState<ServerStagedRestore[]>([])
	const [stagedRestoresLoading, setStagedRestoresLoading] = useState(false)
	const [stagedRestoresError, setStagedRestoresError] = useState<string | null>(null)
	const [deleteRestoreId, setDeleteRestoreId] = useState<string | null>(null)
	const [cleanupRestoresLoading, setCleanupRestoresLoading] = useState(false)
	const tlsCapability = props.meta?.capabilities?.profileTls
	const tlsEnabled = tlsCapability?.enabled ?? false
	const tlsReason = tlsCapability?.reason ?? ''
	const dbBackend = props.meta?.dbBackend ?? 'sqlite'
	const serverBackupCapability = props.meta?.capabilities?.serverBackup
	const backupExportCapability = serverBackupCapability?.export ?? {
		enabled: dbBackend === 'sqlite',
		reason: dbBackend === 'sqlite' ? '' : 'In-product backup export currently supports only sqlite-backed servers.',
	}
	const restoreStagingCapability = serverBackupCapability?.restoreStaging ?? {
		enabled: true,
		reason:
			dbBackend === 'sqlite'
				? ''
				: 'Stages a sqlite DATA_DIR bundle only; this is not a Postgres backup or restore workflow.',
	}
	const mtlsLabel = (
		<Space size={4}>
			<span>mTLS (client cert)</span>
			<Tooltip title="Requires ENCRYPTION_KEY to store client certificates at rest.">
				<InfoCircleOutlined />
			</Tooltip>
		</Space>
	)

	useEffect(() => {
		return () => {
			isMountedRef.current = false
		}
	}, [])

	const refreshStagedRestores = useCallback(async () => {
		if (!isMountedRef.current) return
		setStagedRestoresLoading(true)
		setStagedRestoresError(null)
		try {
			const result = await props.api.listServerRestores()
			if (!isMountedRef.current) return
			setStagedRestores(result.items ?? [])
		} catch (err) {
			if (!isMountedRef.current) return
			setStagedRestoresError(formatErr(err))
		} finally {
			if (isMountedRef.current) {
				setStagedRestoresLoading(false)
			}
		}
	}, [props.api])

	useEffect(() => {
		if (!props.meta) return
		void refreshStagedRestores()
	}, [props.meta, refreshStagedRestores])

	const handleRestorePick = () => {
		restoreInputRef.current?.click()
	}

	const handlePortableDownload = async (confidentiality: 'clear' | 'encrypted') => {
		setPortableDownloadLoading(confidentiality)
		setPortableError(null)
		try {
			const { promise } = props.api.downloadServerBackup('portable', confidentiality)
			const result = await promise
			if (!isMountedRef.current) return
			const blobUrl = URL.createObjectURL(result.blob)
			const anchor = document.createElement('a')
			anchor.href = blobUrl
			anchor.download = confidentiality === 'encrypted' ? 's3desk-portable-backup-encrypted.tar.gz' : 's3desk-portable-backup.tar.gz'
			document.body.appendChild(anchor)
			anchor.click()
			anchor.remove()
			setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
		} catch (err) {
			if (!isMountedRef.current) return
			setPortableError(formatErr(err))
		} finally {
			if (isMountedRef.current) {
				setPortableDownloadLoading(null)
			}
		}
	}

	const handlePortablePreviewPick = () => {
		portablePreviewInputRef.current?.click()
	}

	const handlePortableImportPick = () => {
		portableImportInputRef.current?.click()
	}

	const staleRestoreCutoffMs = 7 * 24 * 60 * 60 * 1000
	const isRestoreStale = (stagedAt: string) => {
		const time = Date.parse(stagedAt)
		return Number.isFinite(time) && Date.now() - time >= staleRestoreCutoffMs
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

	const handleRestoreInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return

		setRestoreLoading(true)
		setRestoreError(null)
		setRestoreResult(null)
		try {
			const result = await props.api.restoreServerBackup(file)
			if (!isMountedRef.current) return
			setRestoreResult(result)
			void refreshStagedRestores()
		} catch (err) {
			if (!isMountedRef.current) return
			setRestoreError(formatErr(err))
		} finally {
			if (isMountedRef.current) {
				setRestoreLoading(false)
			}
		}
	}

	const handlePortableInputChange = async (mode: 'preview' | 'import', event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return

		setPortableLoading(mode)
		setPortableError(null)
		setPortableResult(null)
		try {
			const result =
				mode === 'preview'
					? await props.api.previewPortableImport(file)
					: await props.api.importPortableBackup(file)
			if (!isMountedRef.current) return
			setPortableResult(result)
		} catch (err) {
			if (!isMountedRef.current) return
			setPortableError(formatErr(err))
		} finally {
			if (isMountedRef.current) {
				setPortableLoading(null)
			}
		}
	}

	const handleDeleteRestore = async (restoreId: string) => {
		setDeleteRestoreId(restoreId)
		setStagedRestoresError(null)
		try {
			await props.api.deleteServerRestore(restoreId)
			if (!isMountedRef.current) return
			if (restoreResult?.stagingDir.endsWith(`/${restoreId}`)) {
				setRestoreResult(null)
			}
			void refreshStagedRestores()
		} catch (err) {
			if (!isMountedRef.current) return
			setStagedRestoresError(formatErr(err))
		} finally {
			if (isMountedRef.current) {
				setDeleteRestoreId(null)
			}
		}
	}

	const handleDeleteStaleRestores = async () => {
		const staleIds = stagedRestores.filter((item) => isRestoreStale(item.stagedAt)).map((item) => item.id)
		if (staleIds.length === 0) {
			if (!isMountedRef.current) return
			message.info('No staged restores are older than 7 days.')
			return
		}
		setCleanupRestoresLoading(true)
		setStagedRestoresError(null)
		try {
			await Promise.all(staleIds.map((restoreId) => props.api.deleteServerRestore(restoreId)))
			if (!isMountedRef.current) return
			await refreshStagedRestores()
			if (!isMountedRef.current) return
			message.success(`Deleted ${staleIds.length} stale staged restore(s).`)
		} catch (err) {
			if (!isMountedRef.current) return
			setStagedRestoresError(formatErr(err))
		} finally {
			if (isMountedRef.current) {
				setCleanupRestoresLoading(false)
			}
		}
	}

	const restoreValidation = (restoreResult as (ServerRestoreResponse & { validation?: ServerRestoreValidationView }) | null)?.validation

	return (
		<Space orientation="vertical" size="middle" className={styles.fullWidth}>
			{props.isFetching && !props.meta ? (
				<div className={styles.centerRow}>
					<Spin />
				</div>
			) : null}

			{props.errorMessage ? (
				<Alert type="error" showIcon title="Failed to load /meta" description={props.errorMessage} className={styles.marginBottom12} />
			) : null}

			{props.meta ? (
				<>
					<Alert
						type={restoreStagingCapability.enabled ? 'info' : 'warning'}
						showIcon
						title="Stage restore bundle"
						description={
							<Space orientation="vertical" size={8} className={styles.fullWidth}>
								<Space wrap>
									<Tag color="gold">Stage only</Tag>
									<Tag>Manual apply</Tag>
								</Space>
								<Typography.Text type="secondary">
									Upload a backup bundle to stage a restorable <Typography.Text code>DATA_DIR</Typography.Text> under <Typography.Text code>restores/</Typography.Text>. The live instance is not overwritten.
								</Typography.Text>
								{backupExportCapability.enabled ? (
									<Typography.Text type="secondary">
										Use the sidebar <Typography.Text code>Backup</Typography.Text> action to export a bundle, then upload it here for staging and validation.
									</Typography.Text>
								) : (
									<Typography.Text type="secondary">
										Current server DB backend: <Typography.Text code>{dbBackend}</Typography.Text>. Use your normal database backup workflow, then upload a compatible sqlite <Typography.Text code>DATA_DIR</Typography.Text> bundle here only when you need restore staging.
									</Typography.Text>
								)}
								<Space wrap>
									<Button loading={restoreLoading} disabled={!restoreStagingCapability.enabled} onClick={handleRestorePick}>
										Upload restore bundle
									</Button>
								</Space>
								{restoreStagingCapability.reason ? <Typography.Text type="secondary">{restoreStagingCapability.reason}</Typography.Text> : null}
								<Typography.Text type="secondary">
									After staging, review the bundle, then follow the generated apply plan and helper command for cutover.
								</Typography.Text>
								<input
									ref={restoreInputRef}
									type="file"
									accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
									onChange={(event) => void handleRestoreInputChange(event)}
									style={{ display: 'none' }}
								/>
							</Space>
						}
					/>

					{restoreError ? (
						<Alert type="error" showIcon title="Restore action failed" description={restoreError} className={styles.marginBottom12} />
					) : null}

					{restoreResult ? (
						<Alert
							type="success"
							showIcon
							title="Restore bundle staged"
							description={
								<Space orientation="vertical" size={8} className={styles.fullWidth}>
									<div>
										<Typography.Text type="secondary">Staging directory</Typography.Text>
										<div>
											<Typography.Text code className={styles.codeWrap}>
												{restoreResult.stagingDir}
											</Typography.Text>
										</div>
									</div>
									<div>
										<Typography.Text type="secondary">Bundle manifest</Typography.Text>
										<div>
									<Typography.Text code>{restoreResult.manifest.bundleKind}</Typography.Text>
									{restoreResult.manifest.confidentialityMode ? (
										<>
											<Typography.Text type="secondary"> / </Typography.Text>
											<Typography.Text code>{restoreResult.manifest.confidentialityMode === 'encrypted' ? 'encrypted payload' : 'clear payload'}</Typography.Text>
										</>
									) : null}
									<Typography.Text type="secondary"> / </Typography.Text>
									<Typography.Text code>
										{restoreResult.manifest.dbBackend}
											</Typography.Text>
											<Typography.Text type="secondary"> from </Typography.Text>
											<Typography.Text code>{restoreResult.manifest.createdAt}</Typography.Text>
										</div>
										{restoreResult.manifest.payloadSha256 ? (
											<div>
												<Typography.Text code className={styles.codeWrap}>
													{`${restoreResult.manifest.payloadFileCount ?? 0} files / ${formatBytes(restoreResult.manifest.payloadBytes ?? 0)} / sha256 ${restoreResult.manifest.payloadSha256}`}
												</Typography.Text>
											</div>
										) : null}
									</div>
									{restoreValidation ? (
										<div>
											<Typography.Text type="secondary">Restore validation</Typography.Text>
											<div>
												<Typography.Text code>
													{restoreValidation.preflightChecked ? 'preflight checked' : 'preflight skipped'}
												</Typography.Text>
												<Typography.Text type="secondary"> / </Typography.Text>
												<Typography.Text code>
													{restoreValidation.payloadChecksumPresent
														? restoreValidation.payloadChecksumVerified
															? 'checksum verified'
															: 'checksum not verified'
														: 'checksum absent'}
												</Typography.Text>
												<Typography.Text type="secondary"> / </Typography.Text>
												<Typography.Text code>
													{restoreValidation.payloadSignaturePresent
														? restoreValidation.payloadSignatureVerified
															? 'signature verified'
															: 'signature not verified'
														: 'signature absent'}
												</Typography.Text>
												<Typography.Text type="secondary"> / </Typography.Text>
												<Typography.Text code>
													{restoreValidation.payloadEncryptionPresent
														? restoreValidation.payloadEncryptionDecrypted
															? 'payload decrypted'
															: 'payload not decrypted'
														: 'payload clear'}
												</Typography.Text>
											</div>
											<div>
												<Typography.Text code className={styles.codeWrap}>
													{`${restoreValidation.payloadFileCount ?? 0} extracted / ${formatBytes(restoreValidation.payloadBytes ?? 0)} / free before staging ${formatBytes(restoreValidation.diskFreeBytesBefore ?? 0)}`}
												</Typography.Text>
											</div>
										</div>
									) : null}
									{restoreResult.nextSteps.length ? (
										<div>
											<Typography.Text strong>Next steps</Typography.Text>
											<ul className={styles.tightList}>
												{restoreResult.nextSteps.map((step) => (
													<li key={step}>{step}</li>
												))}
											</ul>
										</div>
									) : null}
									{restoreResult.applyPlan?.length ? (
										<div>
											<Typography.Text strong>Apply plan</Typography.Text>
											<ul className={styles.tightList}>
												{restoreResult.applyPlan.map((step) => (
													<li key={step}>{step}</li>
												))}
											</ul>
										</div>
									) : null}
									{restoreResult.helperCommand ? (
										<div>
											<Typography.Text strong>Helper command</Typography.Text>
											<div>
												<Typography.Text code className={styles.codeWrap}>
													{restoreResult.helperCommand}
												</Typography.Text>
											</div>
										</div>
									) : null}
									{restoreResult.warnings?.length ? (
										<div>
											<Typography.Text strong>Warnings</Typography.Text>
											<ul className={styles.tightList}>
												{restoreResult.warnings.map((warning) => (
													<li key={warning}>{warning}</li>
												))}
											</ul>
										</div>
									) : null}
								</Space>
							}
						/>
					) : null}

					<Alert
						type="info"
						showIcon
						title="Portable backup and import"
						description={
							<Space orientation="vertical" size={8} className={styles.fullWidth}>
								<Space wrap>
									<Tag color="geekblue">Cross-backend migration</Tag>
									<Tag>sqlite → postgres</Tag>
									<Tag>replace / dry run</Tag>
								</Space>
								<Typography.Text type="secondary">
									Portable bundles export logical application data instead of a raw <Typography.Text code>s3desk.db</Typography.Text> snapshot. Use them when you need to move state into a different database backend.
								</Typography.Text>
								{backupExportCapability.enabled ? (
									<Space wrap>
										<Button loading={portableDownloadLoading === 'clear'} onClick={() => void handlePortableDownload('clear')}>
											Download portable backup
										</Button>
										<Button
											loading={portableDownloadLoading === 'encrypted'}
											disabled={!props.meta.encryptionEnabled}
											onClick={() => void handlePortableDownload('encrypted')}
										>
											Download portable backup (encrypted)
										</Button>
									</Space>
								) : (
									<Typography.Text type="secondary">
										Portable export is currently intended for sqlite source servers in the first release cut.
									</Typography.Text>
								)}
								<Space wrap>
									<Button loading={portableLoading === 'preview'} onClick={handlePortablePreviewPick}>
										Preview portable import
									</Button>
									<Button type="primary" loading={portableLoading === 'import'} onClick={handlePortableImportPick}>
										Run portable import
									</Button>
								</Space>
								<Typography.Text type="secondary">
									Preview performs a dry run. Import replaces portable-scope data in the destination database and optionally restores thumbnail cache assets.
								</Typography.Text>
								<input
									ref={portablePreviewInputRef}
									type="file"
									accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
									onChange={(event) => void handlePortableInputChange('preview', event)}
									style={{ display: 'none' }}
								/>
								<input
									ref={portableImportInputRef}
									type="file"
									accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
									onChange={(event) => void handlePortableInputChange('import', event)}
									style={{ display: 'none' }}
								/>
							</Space>
						}
					/>

					{portableError ? (
						<Alert type="error" showIcon title="Portable import failed" description={portableError} className={styles.marginBottom12} />
					) : null}

					{portableResult ? (
						<Alert
							type={portableResult.mode === 'dry_run' ? 'info' : 'success'}
							showIcon
							title={portableResult.mode === 'dry_run' ? 'Portable import preview complete' : 'Portable import complete'}
							description={
								<Space orientation="vertical" size={8} className={styles.fullWidth}>
									<div>
										<Typography.Text type="secondary">Bundle manifest</Typography.Text>
										<div>
											<Typography.Text code>{portableResult.manifest.bundleKind}</Typography.Text>
											<Typography.Text type="secondary"> / </Typography.Text>
											<Typography.Text code>{portableResult.manifest.dbBackend}</Typography.Text>
											<Typography.Text type="secondary"> → </Typography.Text>
											<Typography.Text code>{portableResult.targetDbBackend}</Typography.Text>
										</div>
									</div>
									<div>
										<Typography.Text strong>Preflight</Typography.Text>
										<div>
											<Typography.Text code>{portableResult.preflight.schemaReady ? 'schema ready' : 'schema blocked'}</Typography.Text>
											<Typography.Text type="secondary"> / </Typography.Text>
											<Typography.Text code>{portableResult.preflight.encryptionReady ? 'encryption ready' : 'encryption blocked'}</Typography.Text>
											<Typography.Text type="secondary"> / </Typography.Text>
											<Typography.Text code>{portableResult.preflight.encryptionKeyHintVerified ? 'key hint verified' : 'key hint not verified'}</Typography.Text>
											<Typography.Text type="secondary"> / </Typography.Text>
											<Typography.Text code>{portableResult.preflight.spaceReady ? 'space ready' : 'space blocked'}</Typography.Text>
										</div>
										{portableResult.preflight.blockers?.length ? (
											<ul className={styles.tightList}>
												{portableResult.preflight.blockers.map((item) => (
													<li key={item}>{item}</li>
												))}
											</ul>
										) : null}
									</div>
									<div>
										<Typography.Text strong>Entities</Typography.Text>
										<ul className={styles.tightList}>
											{portableResult.entities.map((item) => (
												<li key={item.name}>
													<Typography.Text code>{item.name}</Typography.Text>
													<Typography.Text type="secondary">{` exported ${item.exportedCount}`}</Typography.Text>
													{typeof item.importedCount === 'number' ? (
														<Typography.Text type="secondary">{` / imported ${item.importedCount}`}</Typography.Text>
													) : null}
													<Typography.Text type="secondary">{item.checksumVerified ? ' / checksum verified' : ' / checksum mismatch'}</Typography.Text>
												</li>
											))}
										</ul>
									</div>
									<div>
										<Typography.Text strong>Verification</Typography.Text>
										<div>
											<Typography.Text code>{portableResult.verification.entityChecksumsVerified ? 'entity checksums verified' : 'entity checksums failed'}</Typography.Text>
											<Typography.Text type="secondary"> / </Typography.Text>
											<Typography.Text code>{portableResult.verification.postImportHealthCheckPassed ? 'post-import health passed' : 'post-import health pending'}</Typography.Text>
										</div>
									</div>
									{portableResult.assetStagingDir ? (
										<div>
											<Typography.Text strong>Assets</Typography.Text>
											<div>
												<Typography.Text code className={styles.codeWrap}>{portableResult.assetStagingDir}</Typography.Text>
											</div>
										</div>
									) : null}
									{portableResult.warnings?.length ? (
										<div>
											<Typography.Text strong>Warnings</Typography.Text>
											<ul className={styles.tightList}>
												{portableResult.warnings.map((item) => (
													<li key={item}>{item}</li>
												))}
											</ul>
										</div>
									) : null}
								</Space>
							}
						/>
					) : null}

					<Alert
						type="info"
						showIcon
						title="Staged restore bundles"
						description={
							<Space orientation="vertical" size={8} className={styles.fullWidth}>
								<Typography.Text type="secondary">
									Uploaded restore bundles stay under <Typography.Text code>{`${props.meta.dataDir}/restores`}</Typography.Text> until you delete them.
								</Typography.Text>
								<Typography.Text type="secondary">
									Keep only the staged restore you are validating and, at most, one rollback candidate. Delete stale bundles after cutover or failed drills.
								</Typography.Text>
								<Space wrap>
									<Button size="small" loading={stagedRestoresLoading} onClick={() => void refreshStagedRestores()}>
										Refresh staged restores
									</Button>
									<Button size="small" loading={cleanupRestoresLoading} onClick={() => void handleDeleteStaleRestores()}>
										Delete stale restores
									</Button>
								</Space>
								{stagedRestoresError ? <Typography.Text type="danger">{stagedRestoresError}</Typography.Text> : null}
								{stagedRestores.length ? (
									stagedRestores.map((item) => (
										<div key={item.id}>
											<Space wrap>
												<Tag color="blue">{item.manifest?.bundleKind ?? 'unknown'}</Tag>
												{isRestoreStale(item.stagedAt) ? <Tag color="orange">stale</Tag> : null}
												<Typography.Text code>{item.id}</Typography.Text>
												<Typography.Text type="secondary">{`${formatRestoreAge(item.stagedAt)} (${item.stagedAt})`}</Typography.Text>
												{typeof item.manifest?.payloadBytes === 'number' ? (
													<Tag>{formatBytes(item.manifest.payloadBytes)}</Tag>
												) : null}
												<Popconfirm
													title="Delete staged restore?"
													description="This removes only the staged restore directory under DATA_DIR/restores."
													okText="Delete"
													okButtonProps={{ danger: true, loading: deleteRestoreId === item.id }}
													onConfirm={() => void handleDeleteRestore(item.id)}
												>
													<Button size="small" danger disabled={deleteRestoreId !== null && deleteRestoreId !== item.id}>
														Delete
													</Button>
												</Popconfirm>
											</Space>
											<div>
												<Typography.Text code className={styles.codeWrap}>
													{item.stagingDir}
												</Typography.Text>
											</div>
											{item.manifest?.payloadSha256 ? (
												<div>
													<Typography.Text type="secondary">
														{`${item.manifest.payloadFileCount ?? 0} files / ${formatBytes(item.manifest.payloadBytes ?? 0)}`}
													</Typography.Text>
												</div>
											) : null}
										</div>
									))
								) : (
									<Typography.Text type="secondary">No staged restore bundles.</Typography.Text>
								)}
							</Space>
						}
					/>

					{props.meta.transferEngine.available && !props.meta.transferEngine.compatible ? (
						<Alert
							type="warning"
							showIcon
							title="Transfer engine is incompatible"
							description={`Requires rclone >= ${props.meta.transferEngine.minVersion}. Current: ${props.meta.transferEngine.version || 'unknown'}.`}
						/>
					) : null}

					<Collapse
						size="small"
						items={[
							{
								key: 'advanced',
								label: 'Advanced',
								children: (
									<Space orientation="vertical" size="middle" className={styles.fullWidth}>
										<Typography.Text type="secondary">Detailed server metadata and capability status.</Typography.Text>
										<Descriptions size="small" bordered column={1}>
											<Descriptions.Item label="Version">{props.meta.version}</Descriptions.Item>
											<Descriptions.Item label="Server Addr">
												<Typography.Text code>{props.meta.serverAddr}</Typography.Text>
											</Descriptions.Item>
											<Descriptions.Item label="Data Dir">
												<Typography.Text code>{props.meta.dataDir}</Typography.Text>
											</Descriptions.Item>
											<Descriptions.Item label="Static Dir">
												<Typography.Text code>{props.meta.staticDir}</Typography.Text>
											</Descriptions.Item>
											<Descriptions.Item label="API Token Required">
												<Tag color={props.meta.apiTokenEnabled ? 'warning' : 'default'}>
													{props.meta.apiTokenEnabled ? 'enabled' : 'disabled'}
												</Tag>
											</Descriptions.Item>
											<Descriptions.Item label="Encryption">
												<Tag color={props.meta.encryptionEnabled ? 'success' : 'default'}>
													{props.meta.encryptionEnabled ? 'enabled' : 'disabled'}
												</Tag>
											</Descriptions.Item>
											<Descriptions.Item label={mtlsLabel}>
												<Space orientation="vertical" size={0}>
													<Tag color={tlsEnabled ? 'success' : 'default'}>{tlsEnabled ? 'enabled' : 'disabled'}</Tag>
													{!tlsEnabled && tlsReason ? <Typography.Text type="secondary">{tlsReason}</Typography.Text> : null}
												</Space>
											</Descriptions.Item>
											<Descriptions.Item label="Allowed Local Dirs">
												<Space orientation="vertical" size={0}>
													{props.meta.allowedLocalDirs?.length ? (
														<Typography.Text code>{props.meta.allowedLocalDirs.join(', ')}</Typography.Text>
													) : (
														<Typography.Text type="secondary">(not configured)</Typography.Text>
													)}
													<Typography.Text type="secondary">
														Server-side local sync jobs are restricted to these roots.
													</Typography.Text>
												</Space>
											</Descriptions.Item>
											<Descriptions.Item label="Job Concurrency">{props.meta.jobConcurrency}</Descriptions.Item>
											<Descriptions.Item label="Job Log Max Bytes">
												{props.meta.jobLogMaxBytes ? (
													<Typography.Text code>{props.meta.jobLogMaxBytes}</Typography.Text>
												) : (
													<Typography.Text type="secondary">(unlimited)</Typography.Text>
												)}
											</Descriptions.Item>
											<Descriptions.Item label="Job Retention (seconds)">
												{props.meta.jobRetentionSeconds ? (
													<Typography.Text code>{props.meta.jobRetentionSeconds}</Typography.Text>
												) : (
													<Typography.Text type="secondary">(keep forever)</Typography.Text>
												)}
											</Descriptions.Item>
											<Descriptions.Item label="Job Log Retention (seconds)">
												{props.meta.jobLogRetentionSeconds ? (
													<Typography.Text code>{props.meta.jobLogRetentionSeconds}</Typography.Text>
												) : (
													<Typography.Text type="secondary">(keep forever)</Typography.Text>
												)}
											</Descriptions.Item>
											<Descriptions.Item label="Upload Session TTL (seconds)">
												{props.meta.uploadSessionTTLSeconds}
											</Descriptions.Item>
											<Descriptions.Item label="Upload Max Bytes">
												{props.meta.uploadMaxBytes ? (
													<Typography.Text code>{props.meta.uploadMaxBytes}</Typography.Text>
												) : (
													<Typography.Text type="secondary">(unlimited)</Typography.Text>
												)}
											</Descriptions.Item>
											<Descriptions.Item label="Transfer Engine">
												<Space>
													<Tag color={props.meta.transferEngine.available ? 'success' : 'default'}>
														{props.meta.transferEngine.available ? 'available' : 'missing'}
													</Tag>
													{props.meta.transferEngine.available ? (
														<Tag color={props.meta.transferEngine.compatible ? 'success' : 'error'}>
															{props.meta.transferEngine.compatible
																? 'compatible'
																: `incompatible (>= ${props.meta.transferEngine.minVersion})`}
														</Tag>
													) : null}
													<Typography.Text code>{props.meta.transferEngine.name}</Typography.Text>
													{props.meta.transferEngine.version ? (
														<Typography.Text code>{props.meta.transferEngine.version}</Typography.Text>
													) : null}
													{props.meta.transferEngine.path ? (
														<Typography.Text code>{props.meta.transferEngine.path}</Typography.Text>
													) : null}
												</Space>
											</Descriptions.Item>
										</Descriptions>
									</Space>
								),
							},
						]}
					/>
				</>
			) : null}
		</Space>
	)
}
