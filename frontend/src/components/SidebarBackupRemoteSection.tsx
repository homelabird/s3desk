import { Alert, Button, Input, InputNumber, Radio, Select, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import type { APIClientShape, ServerBackupConfidentialityMode, ServerBackupScope, ServerBackupTransferLocation } from '../api/client'
import type { Profile, ServerRestoreResponse } from '../api/types'
import { formatErrorWithHint } from '../lib/errors'
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
	const [operation, setOperation] = useState<'export' | 'restore'>('export')
	const [protocol, setProtocol] = useState<Protocol>('object_storage')
	const [profiles, setProfiles] = useState<Profile[]>([])
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

	useEffect(() => {
		let active = true
		void props.api.profiles.listProfiles().then((items) => {
			if (!active) return
			setProfiles(items)
			setProfileId((current) => current || items[0]?.id || '')
		}).catch(() => undefined)
		return () => { active = false }
	}, [props.api])

	const location = useMemo<ServerBackupTransferLocation>(() => ({
		protocol,
		path,
		port,
		...(protocol === 'object_storage' ? { profileId, bucket } : {}),
		...(protocol === 'ftp' ? { host, username, password: ftpPassword } : {}),
	}), [bucket, ftpPassword, host, path, port, profileId, protocol, username])

	const run = async () => {
		if (operation === 'export' && props.exportBlockedReason) {
			setError(props.exportBlockedReason)
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
					<Select
						aria-label="Object storage profile"
						placeholder="Object storage profile"
						value={profileId || undefined}
						onChange={setProfileId}
						options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
					/>
					<Input placeholder="Bucket or container" value={bucket} onChange={(event) => setBucket(event.target.value)} />
				</>
			) : null}
			{protocol === 'ftp' ? (
				<>
					<Input placeholder="FTP host" value={host} onChange={(event) => setHost(event.target.value)} />
					<InputNumber aria-label="FTP port" min={1} max={65535} value={port} onChange={(value) => setPort(value ?? 21)} />
					<Input placeholder="FTP username" value={username} onChange={(event) => setUsername(event.target.value)} />
					<Input.Password placeholder="FTP password" value={ftpPassword} onChange={(event) => setFTPPassword(event.target.value)} />
					<Alert type="warning" showIcon title="Plain FTP" description="FTP credentials and traffic are not transport-encrypted. Protect the backup payload or use a trusted private network." />
				</>
			) : null}
			<Input
				placeholder={protocol === 'nfs' ? '/mounted/backups/' : 'backups/'}
				value={path}
				onChange={(event) => setPath(event.target.value)}
			/>
			{operation === 'restore' ? (
				<Input.Password placeholder="Backup password (optional)" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} />
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
