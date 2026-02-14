import { Alert, AutoComplete, Button, Checkbox, Drawer, Grid, Input, Space, Switch, message } from 'antd'
import { useState } from 'react'

export function DeletePrefixJobModal(props: {
	open: boolean
	onCancel: () => void
	onSubmit: (payload: {
		bucket: string
		prefix: string
		deleteAll: boolean
		allowUnsafePrefix: boolean
		include: string[]
		exclude: string[]
		dryRun: boolean
	}) => void
	loading: boolean
	isOffline: boolean
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
	prefill?: { prefix: string; deleteAll: boolean } | null
}) {

	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const [bucket, setBucket] = useState(props.bucket)
	const [prefix, setPrefix] = useState(props.prefill?.prefix ?? '')
	const [deleteAll, setDeleteAll] = useState(props.prefill?.deleteAll ?? false)
	const [confirm, setConfirm] = useState('')
	const [unsafePrefixOk, setUnsafePrefixOk] = useState(false)
	const [include, setInclude] = useState('')
	const [exclude, setExclude] = useState('')
	const [dryRun, setDryRun] = useState(false)

	const normalizedPrefix = prefix.trim().replace(/^\/+/, '')
	const unsafePrefix = !deleteAll && normalizedPrefix !== '' && !normalizedPrefix.endsWith('/')

	const handleSubmit = () => {
		const trimmedBucket = bucket.trim()
		if (!trimmedBucket) {
			message.error('Bucket is required')
			return
		}
		if (props.isOffline) return

		if (!deleteAll) {
			if (!normalizedPrefix) {
				message.error('Prefix is required unless deleteAll is enabled')
				return
			}
			if (normalizedPrefix.includes('*')) {
				message.error('Wildcards are not allowed in prefix')
				return
			}
			if (unsafePrefix && !unsafePrefixOk) {
				message.error('Acknowledge unsafe prefix to proceed')
				return
			}
		} else {
			if (confirm !== 'DELETE') {
				message.error('Type DELETE to proceed')
				return
			}
		}

		props.setBucket(trimmedBucket)
		props.onSubmit({
			bucket: trimmedBucket,
			prefix: deleteAll ? '' : normalizedPrefix,
			deleteAll,
			allowUnsafePrefix: unsafePrefix,
			include: splitLines(include),
			exclude: splitLines(exclude),
			dryRun,
		})
	}

	return (
		<Drawer
			open={props.open}
			onClose={props.onCancel}
			title="Create delete job (S3)"
			width={drawerWidth}
			extra={
				<Space>
					<Button onClick={props.onCancel}>Close</Button>
					<Button type="primary" danger loading={props.loading} onClick={handleSubmit} disabled={props.isOffline}>
						Create
					</Button>
				</Space>
			}
		>
			<Alert
				type="warning"
				showIcon
				title="Dangerous operation"
				description="This job deletes remote objects via the transfer engine. It cannot be undone."
				style={{ marginBottom: 12 }}
			/>

			<div style={{ marginBottom: 12 }}>
				<div style={{ fontWeight: 700, marginBottom: 6 }}>Bucket</div>
				<AutoComplete
					value={bucket}
					options={props.bucketOptions}
					onChange={(value) => setBucket(String(value))}
					filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
				>
					<Input placeholder="my-bucket…" />
				</AutoComplete>
			</div>

			<div style={{ marginBottom: 12 }}>
				<div style={{ fontWeight: 700, marginBottom: 6 }}>Delete ALL objects in bucket</div>
				<Switch checked={deleteAll} onChange={(checked) => setDeleteAll(checked)} />
			</div>

			<div style={{ marginBottom: 12 }}>
				<div style={{ fontWeight: 700, marginBottom: 6 }}>Prefix</div>
				<Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="path/…" disabled={deleteAll} />
				<div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
					Required unless deleteAll is enabled. Use trailing '/' to avoid accidental matches.
				</div>
			</div>

			{unsafePrefix ? (
				<>
					<Alert
						type="warning"
						showIcon
						title="Prefix does not end with '/'"
						description={
							"Without a trailing '/', delete will match keys with the prefix (e.g., 'abc' also matches 'abcd'). Prefer using a trailing '/'. To proceed anyway, acknowledge below."
						}
						style={{ marginBottom: 12 }}
					/>
					<div style={{ marginBottom: 12 }}>
						<Checkbox checked={unsafePrefixOk} onChange={(e) => setUnsafePrefixOk(e.target.checked)}>
							I understand and want to proceed
						</Checkbox>
					</div>
				</>
			) : null}

			{deleteAll ? (
				<div style={{ marginBottom: 12 }}>
					<div style={{ fontWeight: 700, marginBottom: 6 }}>Type &quot;DELETE&quot; to confirm</div>
					<Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE…" />
				</div>
			) : null}

			<div style={{ marginBottom: 12 }}>
				<div style={{ fontWeight: 700, marginBottom: 6 }}>Dry run (no changes)</div>
				<Switch checked={dryRun} onChange={setDryRun} />
			</div>

			<div style={{ marginBottom: 12 }}>
				<div style={{ fontWeight: 700, marginBottom: 6 }}>Include patterns (one per line)</div>
				<Input.TextArea value={include} onChange={(e) => setInclude(e.target.value)} rows={4} placeholder="*.log…" />
			</div>
			<div style={{ marginBottom: 12 }}>
				<div style={{ fontWeight: 700, marginBottom: 6 }}>Exclude patterns (one per line)</div>
				<Input.TextArea value={exclude} onChange={(e) => setExclude(e.target.value)} rows={4} placeholder="tmp_*…" />
			</div>
		</Drawer>
	)
}

function splitLines(v: string): string[] {
	return v
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
}
