import { Alert, Button, Input, Radio, Typography } from 'antd'

import type { ServerBackupScope } from '../api/client'
import styles from './SidebarBackupAction.module.css'

type BackupProtectionMode = 'clear' | 'server_key' | 'password'

type BackupScopeAvailability = Record<ServerBackupScope, { enabled: boolean; reason?: string }>

type ExportSummary = {
	title: string
	includes: string[]
	notes: string[]
}

type SidebarBackupExportSectionProps = {
	backupScope: ServerBackupScope
	setBackupScope: (scope: ServerBackupScope) => void
	backupScopeAvailability: BackupScopeAvailability
	backupExportNotice: string | null
	exportSummary: ExportSummary
	backupProtection: BackupProtectionMode
	setBackupProtection: (mode: BackupProtectionMode) => void
	backupEncryptionAvailable: boolean
	backupPassword: string
	setBackupPassword: (value: string) => void
	backupPasswordConfirm: string
	setBackupPasswordConfirm: (value: string) => void
	protectionSummary: string
	loadingScope: ServerBackupScope | null
	backupSupported: boolean
	backupExportCapabilityReason: string | undefined
	errorMessage: string | null
	onDownload: () => void
}

export function SidebarBackupExportSection(props: SidebarBackupExportSectionProps) {
	return (
		<div className={styles.section}>
			<Typography.Text strong>Backup export</Typography.Text>
			<Typography.Text type="secondary">
				Choose one bundle type, then download it with optional payload protection.
			</Typography.Text>
			<div>
				<Radio.Group value={props.backupScope} onChange={(event) => props.setBackupScope(event.target.value as ServerBackupScope)}>
					<Radio.Button value="full" disabled={!props.backupScopeAvailability.full.enabled}>
						Full
					</Radio.Button>
					<Radio.Button value="cache_metadata" disabled={!props.backupScopeAvailability.cache_metadata.enabled}>
						Cache + metadata
					</Radio.Button>
					<Radio.Button value="portable" disabled={!props.backupScopeAvailability.portable.enabled}>
						Portable
					</Radio.Button>
				</Radio.Group>
			</div>
			{props.backupExportNotice ? <Typography.Text type="secondary">{props.backupExportNotice}</Typography.Text> : null}
			<Alert
				type="info"
				showIcon
				title={props.exportSummary.title}
				description={
					<div>
						<ul>
							{props.exportSummary.includes.map((item) => <li key={item}>{item}</li>)}
						</ul>
						{props.exportSummary.notes.length ? (
							<ul>
								{props.exportSummary.notes.map((item) => <li key={item}>{item}</li>)}
							</ul>
						) : null}
					</div>
				}
			/>
			<div>
				<Radio.Group
					value={props.backupProtection}
					onChange={(event) => props.setBackupProtection(event.target.value as BackupProtectionMode)}
				>
					<Radio value="clear">Clear archive</Radio>
					{props.backupEncryptionAvailable ? <Radio value="server_key">Use server ENCRYPTION_KEY</Radio> : null}
					<Radio value="password">Protect with password</Radio>
				</Radio.Group>
			</div>
			{props.backupProtection === 'password' ? (
				<div className={styles.actions}>
					<Input.Password
						placeholder="Backup password"
						value={props.backupPassword}
						onChange={(event) => props.setBackupPassword(event.target.value)}
					/>
					<Input.Password
						placeholder="Confirm backup password"
						value={props.backupPasswordConfirm}
						onChange={(event) => props.setBackupPasswordConfirm(event.target.value)}
					/>
				</div>
			) : null}
			<Alert type={props.backupProtection === 'clear' ? 'warning' : 'info'} showIcon title="Payload protection" description={props.protectionSummary} />
			<div className={styles.actions}>
				<Button
					type="primary"
					loading={props.loadingScope === props.backupScope}
					disabled={!props.backupSupported || !props.backupScopeAvailability[props.backupScope].enabled || props.loadingScope !== null}
					onClick={() => void props.onDownload()}
				>
					Download backup
				</Button>
			</div>
			{!props.backupSupported ? (
				<Alert
					type="warning"
					showIcon
					title="Backup export unavailable"
					description={props.backupExportCapabilityReason || 'This server does not currently support in-product backup export.'}
				/>
			) : null}
			{props.errorMessage ? <Alert type="error" showIcon title="Backup download failed" description={props.errorMessage} /> : null}
		</div>
	)
}
