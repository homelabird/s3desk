import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Input, InputNumber, Radio, Select, Typography } from 'antd'
import { useMemo, useState } from 'react'

import type { APIClientShape, ServerBackupConfidentialityMode, ServerBackupScope, ServerBackupTransferLocation } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { ServerRestoreResponse } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { formatErrorWithHint } from '../lib/errors'
import { FormField } from './FormField'
import styles from './SidebarBackupAction.module.css'

type Protocol = ServerBackupTransferLocation['protocol']

type Props = {
	api: APIClientShape
	backupScope: ServerBackupScope
	confidentiality: ServerBackupConfidentialityMode
	backupPassword?: string
	exportBlockedReason?: string
	onRestoreStaged: (result: ServerRestoreResponse) => Promise<void>
}

export function SidebarBackupRemoteSection(props: Props) {
	const { apiToken } = useAuth()
	const [operation, setOperation] = useState<'export' | 'restore'>('export')
	const [protocol, setProtocol] = useState<Protocol>('object_storage')
	const [profileId, setProfileId] = useState('')
	const [bucket, setBucket] = useState('')
	const [path, setPath] = useState('backups/')
	const [host, setHost] = useState('')
	const [port, setPort] = useState(21)
	const [username, setUsername] = useState('')
	const [ftpPassword, setFTPPassword] = useState('')
	const [restorePassword, setRestorePassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [result, setResult] = useState<string | null>(null)

	const profilesQuery = useQuery({
		queryKey: queryKeys.profiles.list(apiToken),
		queryFn: () => props.api.profiles.listProfiles(),
		enabled: !!apiToken,
		retry: false,
	})
	const profiles = profilesQuery.data ?? []
	const selectedProfileId = profileId || profiles[0]?.id || ''

	const location = useMemo<ServerBackupTransferLocation>(() => ({
		protocol,
		path,
		port,
		...(protocol === 'object_storage' ? { profileId: selectedProfileId, bucket } : {}),
		...(protocol === 'ftp' ? { host, username, password: ftpPassword } : {}),
	}), [bucket, ftpPassword, host, path, port, protocol, selectedProfileId, username])

	const run = async () => {
		if (operation === 'export' && props.exportBlockedReason) {
			setError(props.exportBlockedReason)
			return
		}
		const requiredFieldError = !path.trim()
			? 'Enter a backup path.'
			: protocol === 'object_storage' && !selectedProfileId
				? 'Select an object storage profile.'
				: protocol === 'object_storage' && !bucket.trim()
					? 'Enter a bucket or container.'
					: protocol === 'ftp' && !host.trim()
						? 'Enter an FTP host.'
						: protocol === 'ftp' && !username.trim()
							? 'Enter an FTP username.'
							: null
		if (requiredFieldError) {
			setError(requiredFieldError)
			return
		}
		setLoading(true)
		setError(null)
		setResult(null)
		try {
			if (operation === 'export') {
				const response = await props.api.server.transferServerBackup({
					scope: props.backupScope,
					confidentiality: props.confidentiality,
					backupPassword: props.backupPassword,
					location,
				})
				setResult(`Stored ${response.filename} (${response.sizeBytes.toLocaleString()} bytes) at ${response.location}`)
			} else {
				const response = await props.api.server.transferServerRestore({
					backupPassword: restorePassword || undefined,
					location,
				})
				await props.onRestoreStaged(response)
				setResult(`Restore staged at ${response.stagingDir}`)
			}
		} catch (err) {
			setError(formatErrorWithHint(err))
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className={styles.section}>
			<Typography.Text strong>Remote backup storage</Typography.Text>
			<Typography.Text type="secondary">
				Store or fetch one existing backup format. NFS means a path already mounted on this server and allowed by <Typography.Text code>ALLOWED_LOCAL_DIRS</Typography.Text>.
			</Typography.Text>
			<Radio.Group value={operation} onChange={(event) => setOperation(event.target.value)}>
				<Radio.Button value="export">Store backup</Radio.Button>
				<Radio.Button value="restore">Fetch and stage restore</Radio.Button>
			</Radio.Group>
			<Radio.Group value={protocol} onChange={(event) => setProtocol(event.target.value)}>
				<Radio value="object_storage">Object storage</Radio>
				<Radio value="ftp">FTP</Radio>
				<Radio value="nfs">Mounted NFS</Radio>
			</Radio.Group>
			{protocol === 'object_storage' ? (
				<>
					<FormField label="Object storage profile" required htmlFor="remote-backup-profile">
						<Select
							id="remote-backup-profile"
							placeholder="Object storage profile"
							value={selectedProfileId || undefined}
							onChange={setProfileId}
							options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
						/>
					</FormField>
					<FormField label="Bucket or container" required htmlFor="remote-backup-bucket">
						<Input id="remote-backup-bucket" value={bucket} onChange={(event) => setBucket(event.target.value)} />
					</FormField>
				</>
			) : null}
			{protocol === 'ftp' ? (
				<>
					<FormField label="FTP host" required htmlFor="remote-backup-ftp-host">
						<Input id="remote-backup-ftp-host" value={host} onChange={(event) => setHost(event.target.value)} />
					</FormField>
					<FormField label="FTP port" required htmlFor="remote-backup-ftp-port">
						<InputNumber id="remote-backup-ftp-port" min={1} max={65535} value={port} onChange={(value) => setPort(value ?? 21)} />
					</FormField>
					<FormField label="FTP username" required htmlFor="remote-backup-ftp-username">
						<Input id="remote-backup-ftp-username" value={username} onChange={(event) => setUsername(event.target.value)} />
					</FormField>
					<FormField label="FTP password" htmlFor="remote-backup-ftp-password">
						<Input.Password id="remote-backup-ftp-password" value={ftpPassword} onChange={(event) => setFTPPassword(event.target.value)} />
					</FormField>
					<Alert type="warning" showIcon title="Plain FTP" description="FTP credentials and traffic are not transport-encrypted. Protect the backup payload or use a trusted private network." />
				</>
			) : null}
			<FormField label={protocol === 'nfs' ? 'Mounted backup path' : 'Backup path or object key'} required htmlFor="remote-backup-path">
				<Input
					id="remote-backup-path"
					placeholder={protocol === 'nfs' ? '/mounted/backups/' : 'backups/'}
					value={path}
					onChange={(event) => setPath(event.target.value)}
				/>
			</FormField>
			{operation === 'restore' ? (
				<FormField label="Backup password (optional)" htmlFor="remote-backup-restore-password">
					<Input.Password id="remote-backup-restore-password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} />
				</FormField>
			) : null}
			<Typography.Text type="secondary">
				{operation === 'export' ? 'A trailing slash appends the generated backup filename.' : 'Enter the exact backup file path or object key.'}
			</Typography.Text>
			{operation === 'export' && props.exportBlockedReason ? <Alert type="warning" showIcon title="Backup protection needs attention" description={props.exportBlockedReason} /> : null}
			<Button type="primary" loading={loading} disabled={operation === 'export' && !!props.exportBlockedReason} onClick={() => void run()}>
				{operation === 'export' ? 'Store backup' : 'Fetch and stage restore'}
			</Button>
			{result ? <Alert type="success" showIcon title="Remote backup action complete" description={result} /> : null}
			{error ? <Alert type="error" showIcon title="Remote backup action failed" description={error} /> : null}
		</div>
	)
}
