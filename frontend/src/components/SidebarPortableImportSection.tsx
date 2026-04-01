import { Alert, Button, Input, Typography } from 'antd'
import { useRef } from 'react'

import { confirmDangerAction } from '../lib/confirmDangerAction'
import styles from './SidebarBackupAction.module.css'

type PortableSummaryView = {
	mode: string
	targetDbBackend: string
	preflight: {
		schemaReady: boolean
		encryptionReady: boolean
		spaceReady: boolean
		blockers?: string[] | null
	}
	warnings?: string[] | null
}

type SidebarPortableImportSectionProps = {
	portablePassword: string
	onPortablePasswordChange: (value: string) => void
	portableLoading: 'preview' | 'import' | null
	portablePreviewReady: boolean
	portableError: string | null
	portableSummary: PortableSummaryView | null
	portableImportResultPresent: boolean
	onPortablePreviewFileSelect: (file: File | null) => void
	onPortableImport: () => void
	onCopy: (label: string, text: string) => Promise<void>
}

export function SidebarPortableImportSection(props: SidebarPortableImportSectionProps) {
	const inputRef = useRef<HTMLInputElement | null>(null)

	return (
		<div className={styles.section}>
			<Typography.Text strong>Portable import</Typography.Text>
			<Typography.Text type="secondary">
				Preview first, then confirm import. If the portable bundle used password protection, supply the same password before previewing.
			</Typography.Text>
			<Input.Password
				placeholder="Portable bundle password (optional)"
				value={props.portablePassword}
				onChange={(event) => props.onPortablePasswordChange(event.target.value)}
			/>
			<div className={styles.actions}>
				<Button loading={props.portableLoading === 'preview'} onClick={() => inputRef.current?.click()}>
					Preview portable import
				</Button>
				<Button
					type="primary"
					disabled={!props.portablePreviewReady || props.portableLoading !== null}
					loading={props.portableLoading === 'import'}
					onClick={() => {
						void confirmDangerAction({
							title: 'Run portable import?',
							description: 'This replaces portable entities in the destination database with the contents of the uploaded bundle.',
							okText: 'Run import',
							confirmText: 'IMPORT',
							confirmHint: 'Type "IMPORT" to confirm',
							onConfirm: () => props.onPortableImport(),
						})
					}}
				>
					Run portable import
				</Button>
			</div>
			<Typography.Text type="secondary">
				Portable export always includes logical entities. Thumbnail assets are included under <Typography.Text code>assets/thumbnails</Typography.Text> in clear bundles and inside <Typography.Text code>payload.enc</Typography.Text> when protected.
			</Typography.Text>
			{props.portableError ? <Alert type="error" showIcon title="Portable migration failed" description={props.portableError} /> : null}
			{props.portableSummary ? (
				<div className={styles.resultCard}>
					<Typography.Text strong>
						{props.portableImportResultPresent ? 'Portable import result' : 'Portable preview result'}
					</Typography.Text>
					<Typography.Text type="secondary">
						{props.portableSummary.mode} / target {props.portableSummary.targetDbBackend}
					</Typography.Text>
					<Typography.Text type="secondary">
						preflight: schema {props.portableSummary.preflight.schemaReady ? 'ready' : 'blocked'}, encryption {props.portableSummary.preflight.encryptionReady ? 'ready' : 'blocked'}, space {props.portableSummary.preflight.spaceReady ? 'ready' : 'blocked'}
					</Typography.Text>
					{props.portableSummary.preflight.blockers?.length ? (
						<Alert
							type="warning"
							showIcon
							title="Import blockers"
							description={<ul>{props.portableSummary.preflight.blockers.map((item) => <li key={item}>{item}</li>)}</ul>}
						/>
					) : null}
					{props.portableSummary.warnings?.length ? (
						<Alert
							type="info"
							showIcon
							title="Warnings"
							description={<ul>{props.portableSummary.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
						/>
					) : null}
					<div className={styles.inlineActions}>
						{props.portableSummary.preflight.blockers?.length ? (
							<Button size="small" onClick={() => void props.onCopy('Blockers', props.portableSummary?.preflight.blockers?.join('\n') ?? '')}>
								Copy blockers
							</Button>
						) : null}
						{props.portableSummary.warnings?.length ? (
							<Button size="small" onClick={() => void props.onCopy('Warnings', props.portableSummary?.warnings?.join('\n') ?? '')}>
								Copy warnings
							</Button>
						) : null}
					</div>
				</div>
			) : null}
			<input
				ref={inputRef}
				data-testid="sidebar-portable-preview-input"
				type="file"
				accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
				onChange={(event) => {
					const file = event.target.files?.[0] ?? null
					event.target.value = ''
					props.onPortablePreviewFileSelect(file)
				}}
				style={{ display: 'none' }}
			/>
		</div>
	)
}
