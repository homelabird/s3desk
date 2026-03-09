import { InfoCircleOutlined } from '@ant-design/icons'
import { Alert, Button, Collapse, Descriptions, Space, Spin, Tag, Tooltip, Typography } from 'antd'
import { useRef, useState } from 'react'

import type { APIClient } from '../../api/client'
import type { MetaResponse } from '../../api/types'
import type { ServerRestoreResponse } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import styles from '../SettingsPage.module.css'

type ServerSettingsSectionProps = {
	api: APIClient
	meta: MetaResponse | undefined
	isFetching: boolean
	errorMessage: string | null
}

export function ServerSettingsSection(props: ServerSettingsSectionProps) {
	const restoreInputRef = useRef<HTMLInputElement | null>(null)
	const [backupLoading, setBackupLoading] = useState(false)
	const [restoreLoading, setRestoreLoading] = useState(false)
	const [migrationError, setMigrationError] = useState<string | null>(null)
	const [restoreResult, setRestoreResult] = useState<ServerRestoreResponse | null>(null)
	const tlsCapability = props.meta?.capabilities?.profileTls
	const tlsEnabled = tlsCapability?.enabled ?? false
	const tlsReason = tlsCapability?.reason ?? ''
	const dbBackend = props.meta?.dbBackend ?? 'sqlite'
	const backupSupported = dbBackend === 'sqlite'

	const mtlsLabel = (
		<Space size={4}>
			<span>mTLS (client cert)</span>
			<Tooltip title="Requires ENCRYPTION_KEY to store client certificates at rest.">
				<InfoCircleOutlined />
			</Tooltip>
		</Space>
	)

	const runBackupDownload = async () => {
		setBackupLoading(true)
		setMigrationError(null)
		try {
			const { promise } = props.api.downloadServerBackup()
			const result = await promise
			const filename = filenameFromContentDisposition(result.contentDisposition) ?? 's3desk-backup.tar.gz'
			saveBlob(result.blob, filename)
		} catch (err) {
			setMigrationError(formatErr(err))
		} finally {
			setBackupLoading(false)
		}
	}

	const handleRestorePick = () => {
		restoreInputRef.current?.click()
	}

	const handleRestoreInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return

		setRestoreLoading(true)
		setMigrationError(null)
		setRestoreResult(null)
		try {
			const result = await props.api.restoreServerBackup(file)
			setRestoreResult(result)
		} catch (err) {
			setMigrationError(formatErr(err))
		} finally {
			setRestoreLoading(false)
		}
	}

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
						type={backupSupported ? 'info' : 'warning'}
						showIcon
						title="Migration backup & restore"
						description={
							<Space orientation="vertical" size={8} className={styles.fullWidth}>
								<Typography.Text type="secondary">
									Download a migration bundle for another server, or upload a previous bundle to stage a restorable DATA_DIR on this machine.
								</Typography.Text>
								<Space wrap>
									<Button type="primary" loading={backupLoading} disabled={!backupSupported || restoreLoading} onClick={() => void runBackupDownload()}>
										Download backup
									</Button>
									<Button loading={restoreLoading} disabled={backupLoading} onClick={handleRestorePick}>
										Upload restore bundle
									</Button>
								</Space>
								{!backupSupported ? (
									<Typography.Text type="secondary">
										Current server DB backend: <Typography.Text code>{dbBackend}</Typography.Text>. Backup export currently supports sqlite-backed servers only.
									</Typography.Text>
								) : null}
								<Typography.Text type="secondary">
									The bundle contains DATA_DIR state such as <Typography.Text code>s3desk.db</Typography.Text>, thumbnails, logs, artifacts, and staging data.
									Environment config outside DATA_DIR is not included.
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

					{migrationError ? (
						<Alert type="error" showIcon title="Migration action failed" description={migrationError} className={styles.marginBottom12} />
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
											<Typography.Text code>
												{restoreResult.manifest.dbBackend}
											</Typography.Text>
											<Typography.Text type="secondary"> from </Typography.Text>
											<Typography.Text code>{restoreResult.manifest.createdAt}</Typography.Text>
										</div>
									</div>
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

function filenameFromContentDisposition(header: string | null): string | null {
	if (!header) return null

	const star = /filename\*=([^']*)''([^;]+)/i.exec(header)
	if (star) {
		try {
			return decodeURIComponent(star[2] ?? '')
		} catch {
			return star[2] ?? null
		}
	}

	const plain = /filename="?([^";]+)"?/i.exec(header)
	return plain?.[1] ?? null
}

function saveBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.rel = 'noopener'
	anchor.style.display = 'none'
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
