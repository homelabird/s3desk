import { Alert, Button, Checkbox, Grid, Input, message } from 'antd'
import { useState } from 'react'

import { DatalistInput } from '../../components/DatalistInput'
import { FormField } from '../../components/FormField'
import { OverlaySheet } from '../../components/OverlaySheet'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import styles from './JobsShared.module.css'

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
	bucketLookupErrorDescription?: string | null
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
	prefill?: { prefix: string; deleteAll: boolean } | null
}) {

	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const mobileSheetHeight = 'calc(100dvh - env(safe-area-inset-top))'
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
		<OverlaySheet
			open={props.open}
			onClose={props.onCancel}
			title="Create delete job (S3)"
			placement={screens.md ? 'right' : 'bottom'}
			width={screens.md ? drawerWidth : undefined}
			height={!screens.md ? mobileSheetHeight : undefined}
			extra={
				<div className={styles.drawerExtra}>
					<Button onClick={props.onCancel}>Close</Button>
					<Button type="primary" danger loading={props.loading} onClick={handleSubmit} disabled={props.isOffline}>
						Create
					</Button>
				</div>
			}
		>
			<div className={styles.alertStack}>
				{props.bucketLookupErrorDescription ? (
					<Alert
						type="warning"
						showIcon
						title="Bucket lookup unavailable"
						description={`${props.bucketLookupErrorDescription} You can still type a bucket name manually.`}
					/>
				) : null}
				<Alert
					type="warning"
					showIcon
					title="Dangerous operation"
					description="This job deletes remote objects via the transfer engine. It cannot be undone."
				/>
				{unsafePrefix ? (
					<Alert
						type="warning"
						showIcon
						title="Prefix does not end with '/'"
						description={
							"Without a trailing '/', delete will match keys with the prefix (e.g., 'abc' also matches 'abcd'). Prefer using a trailing '/'. To proceed anyway, acknowledge below."
						}
					/>
				) : null}
			</div>

			<form
				className={styles.form}
				onSubmit={(event) => {
					event.preventDefault()
					handleSubmit()
				}}
			>
				<FormField label="Bucket">
					<DatalistInput
						value={bucket}
						onChange={setBucket}
						placeholder="my-bucket…"
						ariaLabel="Bucket"
						allowClear
						options={props.bucketOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
					/>
				</FormField>

				<FormField label="Delete ALL objects in bucket">
					<ToggleSwitch checked={deleteAll} onChange={(checked) => setDeleteAll(checked)} ariaLabel="Delete ALL objects in bucket" />
				</FormField>

				<FormField
					label="Prefix"
					extra="Required unless deleteAll is enabled. Use trailing '/' to avoid accidental matches."
				>
					<Input
						value={prefix}
						onChange={(e) => setPrefix(e.target.value)}
						placeholder="path/…"
						disabled={deleteAll}
						aria-label="Prefix"
					/>
				</FormField>

				{unsafePrefix ? (
					<div className={styles.checkboxField}>
						<Checkbox checked={unsafePrefixOk} onChange={(e) => setUnsafePrefixOk(e.target.checked)}>
							I understand and want to proceed
						</Checkbox>
					</div>
				) : null}

				{deleteAll ? (
					<FormField label='Type "DELETE" to confirm'>
						<Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE…" />
					</FormField>
				) : null}

				<FormField label="Dry run (no changes)">
					<ToggleSwitch checked={dryRun} onChange={setDryRun} ariaLabel="Dry run (no changes)" />
				</FormField>

				<FormField label="Include patterns (one per line)">
					<Input.TextArea value={include} onChange={(e) => setInclude(e.target.value)} rows={4} placeholder="*.log…" />
				</FormField>

				<FormField label="Exclude patterns (one per line)">
					<Input.TextArea value={exclude} onChange={(e) => setExclude(e.target.value)} rows={4} placeholder="tmp_*…" />
				</FormField>
			</form>
		</OverlaySheet>
	)
}

function splitLines(v: string): string[] {
	return v
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
}
