import { Alert, Button, Input, Typography } from 'antd'
import { useRef } from 'react'

import styles from './SidebarBackupAction.module.css'

type RestoreValidationView = {
	payloadChecksumPresent?: boolean
	payloadChecksumVerified?: boolean
	payloadSignaturePresent?: boolean
	payloadSignatureVerified?: boolean
	payloadEncryptionPresent?: boolean
	payloadEncryptionDecrypted?: boolean
}

type RestoreResultView = {
	stagingDir: string
	manifest: {
		bundleKind: string
		dbBackend: string
		confidentialityMode?: string | null
	}
	helperCommand?: string | null
	applyPlan?: string[] | null
}

type SidebarRestoreBundleSectionProps = {
	restorePassword: string
	setRestorePassword: (value: string) => void
	restoreLoading: boolean
	restoreStagingCapabilityEnabled: boolean
	restoreStagingCapabilityReason: string
	restoreError: string | null
	restoreResult: RestoreResultView | null
	restoreValidation: RestoreValidationView | null | undefined
	onRestoreFileSelect: (file: File | null) => void
	onCopy: (label: string, text: string) => Promise<void>
}

export function SidebarRestoreBundleSection(props: SidebarRestoreBundleSectionProps) {
	const restoreResult = props.restoreResult
	const restoreValidation = props.restoreValidation
	const inputRef = useRef<HTMLInputElement | null>(null)

	return (
		<div className={styles.section}>
			<Typography.Text strong>Stage restore bundle</Typography.Text>
			<Typography.Text type="secondary">
				Upload a backup bundle to stage a restorable <Typography.Text code>DATA_DIR</Typography.Text>. If the bundle used password protection, enter the same password here.
			</Typography.Text>
			<Input.Password
				placeholder="Bundle password (optional)"
				value={props.restorePassword}
				onChange={(event) => props.setRestorePassword(event.target.value)}
			/>
			<div className={styles.actions}>
				<Button
					loading={props.restoreLoading}
					disabled={!props.restoreStagingCapabilityEnabled}
					onClick={() => inputRef.current?.click()}
				>
					Upload restore bundle
				</Button>
			</div>
			{props.restoreStagingCapabilityReason ? <Typography.Text type="secondary">{props.restoreStagingCapabilityReason}</Typography.Text> : null}
			{props.restoreError ? <Alert type="error" showIcon title="Restore action failed" description={props.restoreError} /> : null}
			{restoreResult ? (
				<div className={styles.resultCard}>
					<Typography.Text strong>Latest staged restore</Typography.Text>
					<Typography.Text code className={styles.codeWrap}>
						{restoreResult.stagingDir}
					</Typography.Text>
					<Typography.Text type="secondary">
						{restoreResult.manifest.bundleKind} / {restoreResult.manifest.dbBackend}
						{restoreResult.manifest.confidentialityMode ? ` / ${restoreResult.manifest.confidentialityMode}` : ''}
					</Typography.Text>
					{restoreValidation ? (
						<Typography.Text type="secondary">
							{restoreValidation.payloadChecksumPresent ? (restoreValidation.payloadChecksumVerified ? 'checksum verified' : 'checksum not verified') : 'checksum absent'} /{' '}
							{restoreValidation.payloadSignaturePresent ? (restoreValidation.payloadSignatureVerified ? 'signature verified' : 'signature not verified') : 'signature absent'} /{' '}
							{restoreValidation.payloadEncryptionPresent ? (restoreValidation.payloadEncryptionDecrypted ? 'payload decrypted' : 'payload not decrypted') : 'payload clear'}
						</Typography.Text>
					) : null}
					<div className={styles.inlineActions}>
						<Button size="small" onClick={() => void props.onCopy('Staging path', restoreResult.stagingDir)}>
							Copy staging path
						</Button>
						{restoreResult.helperCommand ? (
							<Button size="small" onClick={() => void props.onCopy('Helper command', restoreResult.helperCommand ?? '')}>
								Copy helper command
							</Button>
						) : null}
						{restoreResult.applyPlan?.length ? (
							<Button size="small" onClick={() => void props.onCopy('Apply plan', restoreResult.applyPlan?.join('\n') ?? '')}>
								Copy apply plan
							</Button>
						) : null}
					</div>
				</div>
			) : null}
			<input
				ref={inputRef}
				data-testid="sidebar-restore-input"
				type="file"
				accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
				onChange={(event) => {
					const file = event.target.files?.[0] ?? null
					event.target.value = ''
					props.onRestoreFileSelect(file)
				}}
				style={{ display: 'none' }}
			/>
		</div>
	)
}
